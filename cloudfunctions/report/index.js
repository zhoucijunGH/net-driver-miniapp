/**
 * report —— 报表与净时薪统计（C 端最高频接口，两条热路径：home / analysis）
 * 入参：{ type: 'home' | 'bills' | 'analysis' | 'ledger', tab?, month?, needFleet? }
 *
 * 核心公式（统一口径，全产品只认这一套）：
 *   本月净收益 = Σ 订单净额(net，已扣平台抽成) − 本月成本合计
 *   净时薪    = 净收益 ÷ 在线时长(hours)
 *   缺工时数据时净时薪记 0 并回 hourlyHint —— 宁可显示 0，也不编一个有收益数字给用户。
 *
 * 容量约定（见 database/README.md「容量与性能规范」）：
 *   所有查询走聚合管道，把计算下推到数据库；单次 home ≤ 4 次数据库往返（+车队状态 2 次），
 *   analysis ≤ 3 次。禁止把某个司机的账单全量读进内存统计。
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const HOUR = 3600 * 1000

/** 东八区今天 YYYY-MM-DD（云函数默认 UTC，直接取 local 会跨日） */
function ymd(offsetDays = 0) {
  const t = new Date(Date.now() + 8 * HOUR + offsetDays * 86400000)
  return t.toISOString().slice(0, 10)
}

/** 东八区当月 YYYY-MM */
function currentMonth() {
  return ymd().slice(0, 7)
}

/** 本月第一天 YYYY-MM-DD */
function monthStart(month) {
  return `${month}-01`
}

/** 该日期所在周的周一 YYYY-MM-DD（周一为一周第一天，符合国内习惯） */
function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=周日
  const back = dow === 0 ? 6 : dow - 1
  const m = new Date(d.getTime() - back * 86400000)
  return m.toISOString().slice(0, 10)
}

/** 日期加减天数（输入/输出均为 YYYY-MM-DD） */
function shiftDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 保留两位小数的字符串，与 Mock 返回格式一致 */
function money(n) {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)
}

/** 净时薪：无工时数据返回 0，绝不猜一个数 */
function hourly(net, hours) {
  const h = Number(hours) || 0
  if (h <= 0) return '0.0'
  return (Math.round(((Number(net) || 0) / h) * 10) / 10).toFixed(1)
}

/** 聚合：把某集合按指定维度求和（开方 indirect 便于复用） */
async function groupBy(coll, match, spec) {
  const res = await db.collection(coll).aggregate().match(match).group(spec).end()
  return res.list
}

/* ------------------------------- home ------------------------------- */

async function buildHome(OPENID, wantFleet) {
  const month = currentMonth()
  const from = monthStart(month)
  const today = ymd()

  // ① 本月账单按平台汇总：既能算月总额，也是「多平台合并」卡的数据源
  // ② 本月成本按分类汇总
  // ③ 今日账单明细（上限 500 条）：今日净收益 + 今日跑单图的小时分布
  // ④ 待办：即将到期 / 已逾期证件（取最紧急 3 条）
  const [platRows, costRows, todayList, certRows] = await Promise.all([
    groupBy('bills', { openid: OPENID, date: _.gte(from) }, {
      _id: '$platform',
      gross: $.sum('$gross'),
      net: $.sum('$net'),
      hours: $.sum('$hours'),
      count: $.sum(1)
    }),
    groupBy('costs', { openid: OPENID, month }, {
      _id: null,
      total: $.sum('$amount')
    }),
    db.collection('bills').where({ openid: OPENID, date: today }).limit(500).get(),
    db.collection('certs')
      .where({ openid: OPENID, status: _.in(['soon', 'overdue']) })
      .orderBy('dueDate', 'asc').limit(3).get()
  ])

  const sumBy = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
  const monthNet = sumBy(platRows, 'net')
  const monthHours = sumBy(platRows, 'hours')
  const monthCost = costRows.length ? Number(costRows[0].total) || 0 : 0
  const netIncome = monthNet - monthCost

  // 今日跑单：按小时聚合单量（createdAt 转东八区小时）
  const todayData = todayList.data || []
  const hourBucket = {}
  for (const b of todayData) {
    const h = new Date((Number(b.createdAt) || Date.now()) + 8 * HOUR).getUTCHours()
    hourBucket[h] = (hourBucket[h] || 0) + 1
  }
  const todayOrders = Object.keys(hourBucket)
    .sort((a, b) => Number(a) - Number(b))
    .map((h) => ({ time: `${Number(h)}:00`, count: hourBucket[h] }))

  // 待办横幅：只提示最紧急的一条
  let todoBanner = ''
  const certs = certRows.data || []
  if (certs.length) {
    const c = certs[0]
    const days = Math.round((new Date(`${c.dueDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000)
    // 名称兼容两种落库写法：台账页表单写的是 type，早期数据可能写成 name
    const certName = c.name || c.type || '证件'
    todoBanner = days < 0
      ? `证件逾期提醒：${certName} 已逾期 ${Math.abs(days)} 天，请尽快处理`
      : `证件到期提醒：${certName} 还有 ${days} 天`
  }

  const out = {
    summary: {
      netIncome: money(netIncome),
      netHourly: hourly(netIncome, monthHours),
      onlineHours: Math.round(monthHours * 10) / 10
    },
    today: { net: money(todayData.reduce((s, b) => s + (Number(b.net) || 0), 0)) },
    platforms: platRows
      .filter((r) => r._id)
      .map((r) => ({ name: r._id, amount: money(r.gross) })) // 展示流水口径，与"多平台合并"语义一致
      .sort((a, b) => Number(b.amount) - Number(a.amount)),
    todoBanner,
    todayOrders,
    // 账单里没有工时字段时明说原因，别让司机以为自己白跑了
    hourlyHint: monthHours > 0 ? '' : '本月账单缺少「在线时长」信息，导入含时长列的账单后即可算出净时薪',
    monthCost: money(monthCost),
    month: month
  }

  // ⑤⑥ 车队同步状态：仅当本地镜像显示已授权时才查（省两次往返）
  out.fleetSync = { authorized: false, fleetName: '', lastSyncText: '' }
  if (wantFleet) {
    const consents = (await db.collection('driver_consent')
      .where({ openid: OPENID, granted: true, revoked: false }).limit(1).get()).data
    const consent = consents[0]
    if (consent && consent.fleetId) {
      const comps = (await db.collection('companies')
        .where({ fleetId: consent.fleetId, authStatus: 'active' }).limit(1).get()).data
      if (comps[0]) {
        out.fleetSync = {
          authorized: true,
          fleetName: comps[0].name || '车队',
          lastSyncText: comps[0].lastSyncText || '已授权'
        }
      }
    }
  }
  return out
}

/* ----------------------------- analysis ----------------------------- */

async function buildAnalysis(OPENID) {
  // 取最近 30 天：足够覆盖近 7 日趋势 + 本周 vs 上周，且一次聚合只回 ~30 行
  const from = ymd(-29)
  const thisMonday = mondayOf(ymd())
  const lastMonday = shiftDays(thisMonday, -7)

  // ① 账单按天汇总  ② 账单按平台汇总  ③ 成本按天+分类汇总（一次拿两个维度）
  const [billByDay, billByPlat, costByDayCat] = await Promise.all([
    groupBy('bills', { openid: OPENID, date: _.gte(from) }, {
      _id: '$date', net: $.sum('$net'), gross: $.sum('$gross'), hours: $.sum('$hours'), count: $.sum(1)
    }),
    groupBy('bills', { openid: OPENID, date: _.gte(from) }, {
      _id: '$platform', net: $.sum('$net'), hours: $.sum('$hours'), count: $.sum(1)
    }),
    groupBy('costs', { openid: OPENID, date: _.gte(from) }, {
      _id: { date: '$date', category: '$category' }, amount: $.sum('$amount')
    })
  ])

  // 成本：按天汇总 + 按分类汇总（饼图/拆解）
  const costByDay = {}
  const costByCat = {}
  for (const r of costByDayCat) {
    const d = r._id.date
    const c = r._id.category || '其他'
    costByDay[d] = (costByDay[d] || 0) + (Number(r.amount) || 0)
    costByCat[c] = (costByCat[c] || 0) + (Number(r.amount) || 0)
  }

  const dayMap = {}
  for (const r of billByDay) {
    dayMap[r._id] = { net: Number(r.net) || 0, hours: Number(r.hours) || 0, count: r.count || 0 }
  }

  // 近 7 日净时薪趋势（缺工时那天记 0，不插值）
  const trend = []
  for (let i = 6; i >= 0; i--) {
    const d = ymd(-i)
    const v = dayMap[d] || { net: 0, hours: 0 }
    trend.push(Number(hourly(v.net - (costByDay[d] || 0), v.hours)))
  }

  // 各平台净时薪：总成本按净额占比分摊到各平台（成本本身不带平台维度）
  const totalNet = billByPlat.reduce((s, r) => s + (Number(r.net) || 0), 0)
  const totalCost = Object.values(costByCat).reduce((s, v) => s + v, 0)
  const compare = billByPlat
    .filter((r) => r._id)
    .map((r) => {
      const share = totalNet > 0 ? (Number(r.net) || 0) / totalNet : 0
      const platNet = (Number(r.net) || 0) - totalCost * share
      return { name: r._id, hourly: hourly(platNet, r.hours) }
    })
    .sort((a, b) => Number(b.hourly) - Number(a.hourly))

  // 成本拆解（近 30 天）
  const totalCostAll = totalCost || 1
  const costs = Object.entries(costByCat)
    .map(([name, amount]) => ({
      name,
      amount: money(amount),
      percent: Math.round((amount / totalCostAll) * 1000) / 10
    }))
    .sort((a, b) => Number(b.amount) - Number(a.amount))

  // 周对比：本周 vs 上周（自然周，周一起算）
  function weekStat(monday) {
    let net = 0, hours = 0, cost = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(`${monday}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + i)
      const key = d.toISOString().slice(0, 10)
      const v = dayMap[key]
      if (v) { net += v.net; hours += v.hours }
      cost += costByDay[key] || 0
    }
    const n = net - cost
    return { net: money(n), hourly: hourly(n, hours), hours: Math.round(hours * 10) / 10 }
  }
  const weekly = { thisWeek: weekStat(thisMonday), lastWeek: weekStat(lastMonday) }

  // 洞察：只在有真实数据时生成结论，没有就给引导而不是假结论
  let insight = ''
  if (compare.length >= 2) {
    const best = compare[0]
    const worst = compare[compare.length - 1]
    if (Number(best.hourly) > 0 && Number(worst.hourly) > 0) {
      const gap = Math.round(((Number(best.hourly) - Number(worst.hourly)) / Number(worst.hourly)) * 100)
      insight = `你在 ${compare.length} 个平台中 ${best.name} 净时薪最高（¥${best.hourly}/时），比最低的 ${worst.name} 高 ${gap}%；把出车时间倾斜到 ${best.name}，同样时长能多赚`
    }
  }
  if (!insight) {
    insight = trend.some((v) => v > 0)
      ? '净时薪走势已生成，继续记录成本可以算出更准的数'
      : '导入账单后这里会自动算出各平台净时薪对比'
  }

  return { trend, compare, costs, insight, weekly }
}

/* ------------------------------ entry ------------------------------ */

exports.main = async (event = {}) => {
  const { type, tab } = event
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '未获取到用户身份，请重新进入小程序' }

  if (type === 'home') {
    // needFleet 由前端按本地授权镜像传入：已撤销时跳过车队查询，省两次往返
    return { code: 0, data: await buildHome(OPENID, event.needFleet !== false) }
  }

  if (type === 'analysis') {
    return { code: 0, data: await buildAnalysis(OPENID) }
  }

  if (type === 'bills') {
    const res = await db.collection('bills')
      .where({ openid: OPENID })
      .orderBy('createdAt', 'desc').limit(50).get()
    return { code: 0, data: res.data }
  }

  if (type === 'ledger') {
    // 台账：certs + contracts + violations，按 tab 过滤（全部/即将到期/已逾期）
    const cond = { openid: OPENID }
    if (tab === '已逾期') cond.status = 'overdue'
    if (tab === '即将到期') cond.status = 'soon'
    const res = await db.collection('certs').where(cond).limit(100).get()
    return { code: 0, data: res.data }
  }

  if (type === 'costs') {
    // 成本列表。这里必须按当月口径裁切，因为页面顶部写的是「本月成本合计 / 占流水比例」：
    // 若 items 跨月而合计只算当月，就会出现"合计 3180 但列表加起来才 2800"这种对不上账的困惑。
    // month 是落库时冗余的字段（addCost / parseBill 都写了），命中 (openid, month) 索引；
    // 这也是容量规范里"日期必须冗余 month"的原因——缺了它这条查询会退化且拿不到当月数据。
    const month = currentMonth()
    const res = await db.collection('costs')
      .where({ openid: OPENID, month })
      .orderBy('date', 'desc')
      .limit(100)
      .get()
    const items = res.data || []
    const total = items.reduce((s, c) => s + (Number(c.amount) || 0), 0)
    return {
      code: 0,
      data: {
        monthTotal: total.toFixed(2),
        items: items.map((c) => ({
          _id: c._id,
          date: c.date,
          category: c.category,
          amount: (Number(c.amount) || 0).toFixed(2),
          note: c.note || '',
          hasPic: !!c.hasPic,
          picFileID: c.picFileID || ''
        }))
      }
    }
  }

  return { code: -1, msg: '未知 type' }
}
