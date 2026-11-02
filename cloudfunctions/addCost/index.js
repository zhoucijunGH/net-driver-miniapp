/**
 * addCost —— C 端「记一笔」写入成本台账，并按授权态决定是否同步到车队后台
 * 入参：{ amount, category, note, hasPic, picFileID, driverName }
 * 出参：{ code: 0, data: { _id, syncToFleet, reason } }
 *
 * 关键产品口径（与撤销授权联动）：
 *   记账本身是司机自己的账本权利 —— 无论是否授权车队，都必须能记下来；
 *   syncToFleet 只决定"这条记录要不要出现在车队后台的成本台账里"。
 *   → 已授权且已绑定 fleetId：syncToFleet = true，B 端 fleetCosts 可读到
 *   → 已撤销授权 / 未绑定车队：syncToFleet = false，只落在个人台账，B 端永远查不到
 *   这条判断只写在云函数里，前端无法伪造（前端传什么都不影响结果）。
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CATS = ['充电', '加油', '高速停车', '保养维修', '罚单', '其他']
const MAX_AMOUNT = 100000

/** 北京时间 YYYY-MM-DD（云函数默认 UTC，直接取 local 会跨日出错） */
function ymd(d = new Date()) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '未获取到用户身份，请重新进入小程序' }

  // 1. 入参校验（金额为唯一必填项，分类非法时归到"其他"，不让用户卡住）
  const amount = Math.round(Number(event.amount) * 100) / 100
  if (!amount || amount <= 0) return { code: -1, msg: '请输入有效金额' }
  if (amount > MAX_AMOUNT) return { code: -1, msg: '金额异常，请核对后重试' }
  const category = CATS.includes(event.category) ? event.category : '其他'
  const note = String(event.note || '').slice(0, 60)

  // 2. 授权态 = 能否同步到车队台账的唯一判据（以云端 driver_consent 为准）
  const consents = (await db.collection('driver_consent')
    .where({ openid: OPENID, granted: true, revoked: false })
    .limit(1)
    .get()).data
  const consent = consents[0] || null
  const fleetId = (consent && consent.fleetId) || ''
  const syncToFleet = !!consent && !!fleetId

  // 3. 落库
  const date = ymd()
  const doc = {
    openid: OPENID,
    driverName: String(event.driverName || '').slice(0, 20),
    fleetId,
    date,
    month: date.slice(0, 7),
    category,
    amount,
    note,
    hasPic: !!event.hasPic,
    picFileID: event.picFileID || '',
    source: 'manual',
    syncToFleet,
    createdAt: Date.now()
  }
  const add = await db.collection('costs').add({ data: doc })

  return {
    code: 0,
    data: {
      _id: add._id,
      syncToFleet,
      // 前端据此给司机一句明确提示，避免"记了但车队看不到"这种事后再解释
      reason: syncToFleet ? '' : (consent ? '已授权但未绑定车队' : '已撤销车队数据同步授权')
    }
  }
}
