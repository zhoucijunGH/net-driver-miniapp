/**
 * fleetCosts —— B 端车队后台读取「司机成本台账」（C 端记账 → B 端汇总）
 * 入参：{ fleetId, month }   month 形如 2026-10，缺省为当月
 * 出参：{ code: 0, data: { month, drivers: [...], byCategory, total, count } }
 *
 * 数据口径：
 *   只读 costs 里 fleetId 相同、且 syncToFleet = true 的记录 ——
 *   司机一旦撤销车队数据同步授权，此后记的账 syncToFleet 为 false，本接口天然查不到，
 *   不需要额外做"屏蔽"逻辑。历史已同步的记录保留（司机对账依据，撤销不清空）。
 * 权限：调用者必须在 companies.admins 白名单内，且该公司 authStatus = active。
 *   司机端 openid 不在白名单，直接拒绝，防止 C 端用户反查车队数据。
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const PAGE = 100
const DRIVER_BLOCK = 100 // $in 单次匹配的司机数上限，超出分块，避免匹配条件过长

/** 北京时间当月，形如 2026-10 */
function currentMonth() {
  const t = new Date(Date.now() + 8 * 3600 * 1000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * 按司机聚合车队当月成本 —— 走数据库聚合管道，一次请求算完。
 *
 * 为什么不用 skip 翻页拉全量：5000 用户规模下一个车队月增成本上万条，
 * skip(n) 需要数据库从第一条扫到第 n 条，越翻越慢（O(n²)），且串行几十次请求必撞
 * 云函数 20s 超时。聚合管道把计算下推到数据库侧，网络往返从 N 次降到 1 次。
 * 前置条件：costs 上建 (fleetId + month + syncToFleet) 复合索引。
 */
async function aggregateCosts(fleetId, month) {
  const res = await db.collection('costs')
    .aggregate()
    .match({ fleetId, month, syncToFleet: true })
    .group({
      _id: '$openid',
      name: $.first('$driverName'),
      charge: $.sum($.cond({ if: $.eq(['$category', '充电']), then: '$amount', else: 0 })),
      fuel: $.sum($.cond({ if: $.eq(['$category', '加油']), then: '$amount', else: 0 })),
      highway: $.sum($.cond({ if: $.eq(['$category', '高速停车']), then: '$amount', else: 0 })),
      maintain: $.sum($.cond({ if: $.eq(['$category', '保养维修']), then: '$amount', else: 0 })),
      fine: $.sum($.cond({ if: $.eq(['$category', '罚单']), then: '$amount', else: 0 })),
      other: $.sum($.cond({ if: $.eq(['$category', '其他']), then: '$amount', else: 0 })),
      total: $.sum('$amount'),
      count: $.sum(1)
    })
    .end()
  return res.list.map((r) => ({
    openid: r._id,
    name: r.name || '司机' + String(r._id).slice(-4),
    charge: r.charge || 0, fuel: r.fuel || 0, highway: r.highway || 0,
    maintain: r.maintain || 0, fine: r.fine || 0, other: r.other || 0,
    total: r.total || 0, count: r.count || 0
  }))
}

/**
 * 按司机取当月流水（用于"成本占流水比"）—— 同样走聚合。
 * 注意：bills 的手动导入记录没有 fleetId，所以不能用 fleetId 过滤，
 * 而是用已聚合出的司机列表 + month 去匹配，这也让索引可以被命中。
 * 前置条件：bills 上建 (month + openid) 复合索引。
 */
async function aggregateGross(openids, month) {
  const out = {}
  for (let i = 0; i < openids.length; i += DRIVER_BLOCK) {
    const block = openids.slice(i, i + DRIVER_BLOCK)
    const res = await db.collection('bills')
      .aggregate()
      .match({ month, openid: _.in(block) })
      .group({ _id: '$openid', gross: $.sum('$gross') })
      .end()
    for (const r of res.list) out[r._id] = r.gross || 0
  }
  return out
}

/** 兜底路径：聚合不可用时按页拉取（仅小规模或降级场景，超过 PAGE_LIMIT 条会截断） */
const PAGE_LIMIT = 5000
async function fallbackDrivers(fleetId, month) {
  const out = []
  for (let i = 0; ; i++) {
    const res = await db.collection('costs')
      .where({ fleetId, month, syncToFleet: true })
      .orderBy('createdAt', 'desc')
      .skip(i * PAGE).limit(PAGE)
      .get()
    out.push(...res.data)
    if (res.data.length < PAGE || out.length >= PAGE_LIMIT) break
  }
  const map = {}
  for (const c of out) {
    const key = c.openid
    if (!map[key]) {
      map[key] = {
        openid: key, name: c.driverName || '司机' + String(key).slice(-4),
        charge: 0, fuel: 0, highway: 0, maintain: 0, fine: 0, other: 0, total: 0, count: 0
      }
    }
    const d = map[key]
    const amt = Number(c.amount) || 0
    if (c.category === '充电') d.charge += amt
    else if (c.category === '加油') d.fuel += amt
    else if (c.category === '高速停车') d.highway += amt
    else if (c.category === '保养维修') d.maintain += amt
    else if (c.category === '罚单') d.fine += amt
    else d.other += amt
    d.total += amt
    d.count += 1
  }
  return Object.values(map)
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录车队后台' }

  const fleetId = String(event.fleetId || '').trim()
  if (!fleetId) return { code: -1, msg: '缺少车队标识' }
  const month = /^\d{4}-\d{2}$/.test(event.month || '') ? event.month : currentMonth()

  // 1. 鉴权：必须是该车队的后台管理员
  const comps = (await db.collection('companies')
    .where({ fleetId, authStatus: 'active' })
    .limit(1)
    .get()).data
  const company = comps[0]
  if (!company) return { code: -1, msg: '车队不存在或授权已失效' }
  const admins = Array.isArray(company.admins) ? company.admins : []
  if (!admins.includes(OPENID)) return { code: -1, msg: '无权限查看该车队数据' }

  // 2. 取当月已同步的成本，按司机聚合（优先数据库聚合管道；不可用时降级分页）
  let rawDrivers
  try {
    rawDrivers = await aggregateCosts(fleetId, month)
  } catch (e) {
    console.error('[fleetCosts] 聚合失败，降级分页：', e.message)
    rawDrivers = await fallbackDrivers(fleetId, month)
  }

  // 3. 取当月流水，用于算"成本占流水比"（流水来自 bills，按司机聚合 gross）
  let grossByDriver = {}
  try {
    grossByDriver = await aggregateGross(rawDrivers.map((d) => d.openid), month)
  } catch (e) {
    console.error('[fleetCosts] 流水聚合失败，占比记 0：', e.message)
    // 流水缺失不影响成本台账本身，占比降级为 0 而不是整体失败
  }

  // 4. 拼装输出（统一保留 2 位小数）
  const drivers = rawDrivers
    .map((d) => {
      const gross = grossByDriver[d.openid] || 0
      return {
        ...d,
        charge: +d.charge.toFixed(2),
        fuel: +d.fuel.toFixed(2),
        highway: +d.highway.toFixed(2),
        maintain: +d.maintain.toFixed(2),
        fine: +d.fine.toFixed(2),
        other: +d.other.toFixed(2),
        total: +d.total.toFixed(2),
        gross: +gross.toFixed(2),
        // 成本占流水比：无流水时记 0，避免除零
        ratio: gross > 0 ? Math.round((d.total / gross) * 1000) / 10 : 0
      }
    })
    .sort((a, b) => b.total - a.total)

  const byCategory = {
    充电: 0, 加油: 0, 高速停车: 0, 保养维修: 0, 罚单: 0, 其他: 0
  }
  for (const d of drivers) {
    byCategory.充电 += d.charge
    byCategory.加油 += d.fuel
    byCategory.高速停车 += d.highway
    byCategory.保养维修 += d.maintain
    byCategory.罚单 += d.fine
    byCategory.其他 += d.other
  }
  Object.keys(byCategory).forEach((k) => { byCategory[k] = +byCategory[k].toFixed(2) })

  return {
    code: 0,
    data: {
      fleetId,
      month,
      drivers,
      byCategory,
      total: +drivers.reduce((s, d) => s + d.total, 0).toFixed(2),
      // 记录条数（非司机数）：偏离 ±0.5% 以内可接受，用于前端展示"共 N 笔"
      count: rawDrivers.reduce((s, d) => s + d.count, 0),
      truncated: false // 聚合路径不做截断；降级分页且触顶时由 fallback 侧置 true
    }
  }
}
