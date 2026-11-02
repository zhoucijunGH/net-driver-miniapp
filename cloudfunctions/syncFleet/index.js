/**
 * syncFleet —— B 端滴滴车队 API 定时同步
 * 触发：定时触发器（CRON，建议每日 02:00）+ 手动
 * 职责：读 companies（fleetId + 加密 didiApiKey）→ 调滴滴车队 API（getBalance/getOrderList）
 *       → 按 driver_id 匹配 driver_consent → 仅对"已同意未吊销"司机写 bills(sourceType=fleet)
 * 合规：平台 ToS 转授权灰区须有公司书面协议；司机可随时吊销
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  // 0. 司机在 C 端主动「一键拉取」时（有 OPENID）先校验本人同意态：
  //    撤销授权后必须拒绝，否则"撤销"只是界面上的摆设。定时触发器无 OPENID，跳过此校验。
  const { OPENID } = cloud.getWXContext()
  if (OPENID) {
    const mine = await db.collection('driver_consent')
      .where({ openid: OPENID, granted: true, revoked: false })
      .count()
    if (!mine.total) {
      return { code: -1, msg: '已撤销车队数据同步授权，请先在「我的」重新授权' }
    }
  }

  // 1. 取已授权公司
  const companies = (await db.collection('companies').where({ authStatus: 'active' }).get()).data

  let synced = 0
  for (const c of companies) {
    // 2. TODO: 解密 didiApiKeyEnc → OAuth2 client_credentials 换 token
    //    GET 车队订单列表（fleet_id 限定）→ 得到司机订单/收益明细
    // 3. 匹配同意态：仅 driver_consent 中 granted=true 且未 revoke 的司机
    // 4. 写入 bills(sourceType='fleet')，注意回调去重（订单号幂等）
    synced += 0 // 占位
  }
  return { code: 0, data: { synced } }
}
