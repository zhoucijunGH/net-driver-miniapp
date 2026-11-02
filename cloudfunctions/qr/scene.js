/**
 * scene 场景码解析（纯函数，不依赖 wx-server-sdk，方便单测直接 require）
 *
 * 微信小程序码 scene 参数只有 32 字节，且不能放明文个人信息（手机号等），
 * 所以用「类型字母:资源ID」的紧凑格式：
 *
 *   F:fleet_demo_001   车队码（B 端生成，主力入口，可归因到公司）
 *   M:poster_nn_01     物料码（车身贴/传单，归因到投放点位）
 *   S:driver_demo_001  转发码（同行分享，归因到邀请人 openid）
 *   G:generic          自然进入兜底码（搜索/直接打开，只计数不建报表）
 *
 * 解析规则：第一个字母决定类型，冒号后是资源 ID；非法输入一律降级为 generic，
 * 绝不抛错——扫码链路上任何异常都不能挡住司机进小程序。
 */
const TYPE_BY_LETTER = {
  F: 'fleet',
  M: 'material',
  S: 'forward',
  G: 'generic'
}
const LETTER_BY_TYPE = {
  fleet: 'F',
  material: 'M',
  forward: 'S',
  generic: 'G'
}

/** 解析 scene → { type, id, valid }。type ∈ fleet|material|forward|generic */
function parseScene(scene) {
  const raw = String(scene || '').trim()
  if (!raw || raw.length > 32) return { type: 'generic', id: '', valid: false }
  const m = /^([A-Z]):([A-Za-z0-9_-]{1,30})$/.exec(raw)
  if (!m) return { type: 'generic', id: '', valid: false }
  const type = TYPE_BY_LETTER[m[1]]
  if (!type) return { type: 'generic', id: '', valid: false }
  return { type, id: m[2], valid: true }
}

/** 反向拼装：给 B 端生成码用。超长返回 null（32 字节红线，宁可不发码） */
function buildScene(type, id) {
  const letter = LETTER_BY_TYPE[type]
  const scene = letter ? `${letter}:${String(id || '').trim()}` : ''
  if (!scene || scene.length > 32 || !/^([A-Z]):([A-Za-z0-9_-]{1,30})$/.test(scene)) return null
  return scene
}

module.exports = { parseScene, buildScene, TYPE_BY_LETTER, LETTER_BY_TYPE }
