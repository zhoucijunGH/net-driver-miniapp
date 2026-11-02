/**
 * clipboardParse —— 剪贴板文本大模型抽取
 * 触发：C 端粘贴订单文本后调用
 * 入参：{ text }
 * 职责：调腾讯云免密钥大模型，从订单文本抽取 预估收入/里程/时长/远郊标记 → 返回结构化净时薪预估值
 * 注意：定位是"机场/远郊/预约单预规划测算"，不做实时接单判断
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { text } = event
  if (!text || text.length > 500) return { code: -1, msg: '文本为空或过长' }

  // TODO: 云开发免密钥大模型调用（混元），prompt 要求输出 JSON：
  // { estimatedIncome, distanceKm, durationMin, isRemote }
  // 再按用户成本设置（租金/电/空驶系数）算净时薪预估
  const parsed = { estimatedIncome: 0, distanceKm: 0, durationMin: 0, isRemote: false }

  return { code: 0, data: parsed }
}
