/**
 * subscribe —— 一次性订阅消息下发
 * 触发：定时触发器（每日 08:00 扫描未来 30 天到期项）
 * 规则：一次性订阅 = 用户授权一次只能发一条；免费版限 2 条待办，会员不限
 * 模板：需在 mp.weixin.qq.com 申请"提醒"类一次性订阅模板，填入模板 ID
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TEMPLATE_ID = 'TEMPLATE_ID_TODO' // TODO: 替换为真实模板 ID

exports.main = async () => {
  // 1. 查 30 天内到期且未提醒的台账项（certs/contracts）
  // 2. 检查该用户的剩余订阅额度（subscribe 集合计数）
  // 3. 调 cloud.openapi.subscribeMessage.send 下发
  //    额度不足则跳过（首页横幅仍是主触点，短信兜底证件类高风险项）
  return { code: 0, data: { sent: 0 } }
}
