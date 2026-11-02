/**
 * 扫码 scene 工具（客户端侧）
 *
 * scene 格式与服务端 cloudfunctions/qr/scene.js 一致："类型字母:资源ID"
 *   F=车队码  M=物料码  S=转发码  G=自然进入
 *
 * 客户端解析只做「进页即路由」（扫了车队码先跳欢迎页，不用等网络），
 * 归因落库/计数一律以服务端 api.qrResolve 的结果为准——前端入参不可信是后端的原则，
 * 反过来前端也不能只信本地解析就展示车队名。
 */

import Taro from '@tarojs/taro'

const TYPE_LABELS = {
  fleet: '车队码',
  material: '物料码',
  forward: '转发码',
  generic: '自然进入'
}

/** 解析 scene → { type, id }。非法输入降级 generic，绝不抛错 */
export function parseScene(scene) {
  const raw = String(scene || '').trim()
  const m = /^([A-Z]):([A-Za-z0-9_-]{1,30})$/.exec(raw)
  if (!m || raw.length > 32) return { type: 'generic', id: '' }
  const map = { F: 'fleet', M: 'material', S: 'forward', G: 'generic' }
  return { type: map[m[1]] || 'generic', id: m[2] }
}

export function typeLabel(type) {
  return TYPE_LABELS[type] || TYPE_LABELS.generic
}

/**
 * 取进入场景的 scene：
 * ① 扫"小程序码"进入时，scene 在启动参数 query.scene（微信已做 decodeURIComponent）
 * ② 兜底：页面自身 onLoad options.scene
 */
export function entryScene(pageOptions) {
  try {
    const launch = Taro.getLaunchOptionsSync ? Taro.getLaunchOptionsSync() : null
    const fromLaunch = launch && launch.query && launch.query.scene
    return String(fromLaunch || (pageOptions && pageOptions.scene) || '').trim()
  } catch (e) {
    return String((pageOptions && pageOptions.scene) || '').trim()
  }
}
