/**
 * parseBill —— 账单解析入库
 * 触发：C 端"解析并入库"按钮
 * 入参：{ fileID, platform }（滴滴/高德/T3/曹操）
 * 职责：下载云存储文件 → 按平台字段映射归一化（标准账单模板）→ 批量写 bills 集合
 *
 * 容量约束（5000 用户规模下必须遵守，否则必炸）：
 *   1. 严禁逐条 await add —— 一个月的账单动辄 600~1000 单，串行写要 18~30 秒，
 *      直接撞云函数默认 20s 超时。改为分批并发写入。
 *   2. 必须冗余 month 字段（YYYY-MM）—— bills 按月查询是最频繁的口径，
 *      没有 month 就只能全表扫再内存过滤，数据量翻倍即雪崩。
 *   3. 单次导入上限 MAX_ROWS，超出要提示而不是硬扛（保护内存：单次运行上限 256MB）。
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CHUNK = 200      // 单批写入条数：兼顾单次请求包体与失败重试粒度
const CONCURRENCY = 5  // 并发批数：太小超时，太大会把数据库连接数(基础版 20)打满
const MAX_ROWS = 10000 // 单次导入行数上限

/**
 * 归一化日期为 YYYY-MM-DD。
 * 必须统一格式：report 的"近 30 天/本周 vs 上周"全部依赖 date 做字符串范围比较，
 * 只要混进一个 2026/10/28，那条账单就会从所有时间口径里消失。
 */
function normalizeDate(v) {
  const s = String(v || '').trim()
  if (!s) return ''
  const m = s.match(/(\d{4})[-/.年]?(\d{1,2})[-/.月]?(\d{1,2})/)
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
  return s.slice(0, 10)
}

/**
 * 从一行 CSV 里挑出"在线时长"，统一换算成小时。
 * 各平台列名五花八门（在线时长/耗时/serviceTime/duration/minutes），这里做常见名匹配。
 * 认不出就返回 0 —— report 会因为没有工时而把净时薪显示成 0，不会编数字。
 */
function pickHours(row) {
  const MIN_KEYS = ['分钟', 'mins', 'minutes']
  const HOUR_KEYS = ['在线时长', '服务时长', '出车时长', '时长', '耗时', 'duration', 'hours', 'serviceTime', 'service_time']
  for (const k of Object.keys(row)) {
    const lk = k.trim().toLowerCase()
    if (!HOUR_KEYS.some((h) => lk.includes(h.toLowerCase()))) continue
    const n = Number(String(row[k]).replace(/[^\d.]/g, ''))
    if (!n || n <= 0) continue
    if (MIN_KEYS.some((m) => lk.includes(m.toLowerCase()))) return Math.round((n / 60) * 100) / 100
    if (n <= 24) return Math.round(n * 100) / 100      // 已是小时
    if (n <= 1440) return Math.round((n / 60) * 100) / 100 // 分钟
    return 0
  }
  return 0
}

/**
 * 从一行里按「候选列名」找出目标列。
 *
 * 为什么必须这么做：各平台导出的 CSV 表头全是中文且各不相同
 * （滴滴叫"下单时间"，曹操可能叫"日期"，T3 又叫"用车时间"），
 * 而入库时必须归一成标准字段。这里沿用 pickHours 的思路——遍历真实列名做包含匹配，
 * 而不是指望某个固定字段名一定会存在。
 *
 * @returns {{ key: string, value: string }|null} 命中的列名与原始值；没认出来返回 null
 */
function pickCol(row, candidates) {
  const keys = Object.keys(row)
  // 候选词按优先级排：先把更精确的列名过一遍，避免"金额"抢掉"订单金额"的位置
  for (const word of candidates) {
    for (const k of keys) {
      const lk = String(k).trim().toLowerCase().replace(/\s/g, '')
      if (!lk || !lk.includes(word.toLowerCase())) continue
      const raw = row[k]
      if (raw === undefined || raw === null || String(raw).trim() === '') continue
      return { key: k, value: String(raw).trim() }
    }
  }
  return null
}

/** 把 "¥1,234.50" / "1234.5元" / "(12.3)" 之类洗成数字；认不出返回 NaN */
function toNumber(v) {
  const s = String(v || '').trim().replace(/[¥￥$,\s元]/g, '')
  if (!s) return NaN
  const neg = /^\(.*\)$/.test(s) // 财务 CSV 里括号表示负数
  const n = Number(s.replace(/[()]/g, ''))
  if (!isFinite(n)) return NaN
  return neg ? -n : n
}

/* 各字段的常见列名候选。拿到真实 CSV 后往这里补即可，不必改解析逻辑 */
const DATE_KEYS = [
  '日期', '账单日', '下单时间', '用车时间', '服务时间', '接单时间', '完成时间', 'businessdate', 'date', 'time'
]
const GROSS_KEYS = [
  '订单金额', '流水合计', '流水', '车费', '营收', '总收入', '乘客支付', '订单总额', '合计金额', 'gross', 'amount'
]
const NET_KEYS = [
  '司机收入', '司机实收', '到手', '实得', '实收', '净收入', '到账金额', '司机到手', 'net', 'income'
]
// 有的平台不给"到手"，只给抽成项：这时 net = gross - Σ抽成
const CUT_KEYS = ['平台服务费', '抽成', '信息费', '佣金', '服务费', '抽佣', 'commission', 'fee']

/**
 * 认出一行账单的三个核心值。
 * 认不出的字段一律返回 0 并在 missed 里记下原因——
 * 宁可让 report 显示"缺少金额数据"，也绝不填一个看起来合理的数字进去。
 */
function pickBillFields(row) {
  const dateHit = pickCol(row, DATE_KEYS)
  const grossHit = pickCol(row, GROSS_KEYS)
  const netHit = pickCol(row, NET_KEYS)

  const missed = []
  let gross = grossHit ? toNumber(grossHit.value) : NaN
  let net = netHit ? toNumber(netHit.value) : NaN

  if (!dateHit) missed.push('日期')
  if (!isFinite(gross)) { gross = 0; missed.push('流水金额') }

  if (isFinite(net)) {
    // 已经有到手金额，以它为准
  } else {
    // 没有到手金额：尝试用 流水 - Σ抽成 推导。抽成项也认不出才放弃。
    const cuts = []
    for (const k of Object.keys(row)) {
      const lk = String(k).trim().toLowerCase().replace(/\s/g, '')
      if (!CUT_KEYS.some((c) => lk.includes(c.toLowerCase()))) continue
      const n = toNumber(row[k])
      if (isFinite(n)) cuts.push(n)
    }
    if (cuts.length && gross > 0) {
      net = Math.round((gross - cuts.reduce((s, v) => s + v, 0)) * 100) / 100
    } else {
      net = 0
      missed.push('到手金额')
    }
  }

  return {
    dateRaw: dateHit ? dateHit.value : '',
    gross,
    net,
    missed,
    matched: {
      date: dateHit ? dateHit.key : '',
      gross: grossHit ? grossHit.key : '',
      net: netHit ? netHit.key : (net ? '由流水扣减抽成推算' : '')
    }
  }
}

/** 北京时间当月 */
function currentMonth() {
  const t = new Date(Date.now() + 8 * 3600 * 1000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 把数组按 size 切块 */
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** 受控并发：一次最多跑 limit 个任务 */
async function mapLimit(tasks, limit, worker) {
  const queue = tasks.slice()
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift())
  })
  await Promise.all(runners)
}

exports.main = async (event) => {
  const { fileID, platform } = event
  const { OPENID } = cloud.getWXContext()

  try {
    // 1. 下载账单文件（CSV 优先；Excel 后续用 exceljs 解析）
    const res = await cloud.downloadFile({ fileID })
    const text = res.fileContent.toString('utf-8')

    // 2. CSV 解析 + 平台字段映射（中文表头 → 标准字段 gross/net/hours）
    const rows = parseCsv(text)
    if (!rows.length) return { code: -1, msg: '没解析到有效账单行，请检查文件格式' }
    if (rows.length > MAX_ROWS) {
      return { code: -1, msg: `单次最多导入 ${MAX_ROWS} 行，请按月分批导入` }
    }

    const monthFallback = currentMonth()
    const now = Date.now()
    const missedStat = {}   // 统计哪些字段整体没认出来，用于给用户准确的提示
    let sampleMatched = null

    const bills = rows.map((r) => {
      const f = pickBillFields(r)
      const date = normalizeDate(f.dateRaw)
      f.missed.forEach((m) => { missedStat[m] = (missedStat[m] || 0) + 1 })
      if (!sampleMatched) sampleMatched = f.matched
      return {
        openid: OPENID,
        platform: platform || '未知',
        date,
        month: date ? date.slice(0, 7) : monthFallback, // 冗余月份，供按月查询走索引
        gross: f.gross,          // 订单收入（毛）
        net: f.net,              // 净额（扣平台抽成/服务费）
        hours: pickHours(r),     // 在线时长：净时薪的分母，缺失则 report 记 0
        sourceType: 'manual',    // 手动导入；车队同步为 fleet
        createdAt: now
      }
    })

    // 3. 入库前的兜底校验：关键列一个都没认出来时，宁可不写，也不能灌一堆 0 进库。
    //    必须放在写库**之前**——否则会出现"接口返回识别失败，但库里已经多了一堆空记录"，
    //    比不检查还糟。用户会看到"导入成功 N 条"但金额全为 0，且查不出原因。
    const totalRow = bills.length
    const allMiss = (name) => (missedStat[name] || 0) === totalRow
    if (totalRow && allMiss('日期') && allMiss('流水金额')) {
      return {
        code: -1,
        msg: `没认出账单列。这份文件的表头是：${Object.keys(rows[0]).join('、') || '（空）'}。` +
          '请确认导出的确实是账单明细，或者把表头截图发我们补一列候选名。'
      }
    }

    // 4. 批量入库：分批并发，任一失败不影响整体，返回成功条数
    let ok = 0
    const errs = []
    await mapLimit(chunk(bills, CHUNK), CONCURRENCY, async (part) => {
      try {
        await db.collection('bills').add({ data: part })
        ok += part.length
      } catch (e) {
        // 单批失败降级为逐条写，尽量不丢数据
        for (const b of part) {
          try { await db.collection('bills').add({ data: b }); ok++ }
          catch (e2) { errs.push(e2.message) }
        }
      }
    })

    // 5. 入库后的提示：哪些列整体没认出来，要明说，不能让用户对着 0 猜原因
    const warnParts = []
    if (allMiss('到手金额')) warnParts.push('没找到"司机到手/实收"列，也没算出扣费，净收益会显示为 0')
    if (allMiss('日期')) warnParts.push('没找到日期列，已按当月归档')
    const hoursMissed = bills.every((b) => !b.hours)
    if (hoursMissed) warnParts.push('没找到工时列，净时薪会显示为 0')

    return {
      code: 0,
      data: {
        count: ok,
        total: totalRow,
        failed: totalRow - ok,
        err: errs[0] || '',
        matched: sampleMatched || {},   // 实际命中的列名，便于核对有没有认错列
        missed: missedStat,
        warn: warnParts.join('；')
      }
    }
  } catch (err) {
    return { code: -1, msg: '解析失败：' + err.message }
  }
}

/**
 * CSV 解析。
 * 三个必须处理的现实问题（漏一个就会静默丢数据）：
 *   1. BOM：Excel/平台导出的 CSV 常带 UTF-8 BOM，不去掉的话第一个表头会长成 "\uFEFF日期"，
 *      从此再也匹配不上——表现为整列数据全空。
 *   2. CRLF：Windows 换行是 \r\n，只按 \n 切会让每行最后剩一个 \r，
 *      于是 "58.20\r" 过 Number() 得 NaN，被当成 0。金额就是这么悄悄变没的。
 *   3. 带引号的字段：备注里出现逗号时会被引号包起来，朴素 split(',') 会把列切乱。
 */
function splitCsvLine(line) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } // 转义的双引号
      else quoted = !quoted
      continue
    }
    if (ch === ',' && !quoted) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '')       // 1. 去 BOM
  const lines = clean.split(/\r?\n/).map((l) => l.replace(/\r$/, '')).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0])                        // 3. 支持引号
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line)
    const row = {}
    headers.forEach((h, i) => (row[h] = cols[i] !== undefined ? cols[i] : ''))
    return row
  })
}
