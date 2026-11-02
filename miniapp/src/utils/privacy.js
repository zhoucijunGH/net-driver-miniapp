// 微信隐私授权适配
//
// 背景：微信自 2023-09 起，涉及相册/摄像头等接口必须先经用户授权，
// 否则接口直接 fail（errMsg 含 "require authorize"），即旧版"选图必崩"的根因。
// 这里统一一套：注册全局监听 + 主动预校验，业务侧只需 await ensurePrivacyAuthorized()。
//
// 关键约定：
//   - 仅在微信小程序环境、且基础库提供该能力时才启用（H5/非微信直接放行）。
//   - 用户拒绝时返回 false，业务侧应静默放弃，绝不要反复弹窗逼用户。
import Taro from '@tarojs/taro'
import { reactive } from 'vue'

// 弹窗状态：可被任意页面/组件绑定，渲染自定义隐私授权弹窗
export const privacyState = reactive({ show: false, contractName: '《净司机隐私政策》' })

// 待原接口放行的 resolve（由 onNeedPrivacyAuthorization 提供）
let pendingResolve = null

/**
 * 在 App.onLaunch 调一次即可。注册后，任意需要隐私授权的接口
 * 在调用时若用户尚未同意，会触发此回调——我们弹出授权窗，
 * 用户点"同意"才放行原接口，否则驳回。
 */
export function initPrivacy() {
  if (typeof Taro.onNeedPrivacyAuthorization !== 'function') return
  Taro.onNeedPrivacyAuthorization((resolve, privacyInstance) => {
    pendingResolve = resolve
    if (privacyInstance && privacyInstance.privacyContractName) {
      privacyState.contractName = privacyInstance.privacyContractName
    }
    privacyState.show = true
  })
}

/** 用户点"同意"：放行原接口并关闭弹窗 */
export function agreePrivacy() {
  if (pendingResolve) {
    pendingResolve({ event: 'agree' })
    pendingResolve = null
  }
  privacyState.show = false
}

/** 用户点"拒绝"：驳回原接口并关闭弹窗 */
export function disagreePrivacy() {
  if (pendingResolve) {
    pendingResolve({ event: 'disagree' })
    pendingResolve = null
  }
  privacyState.show = false
}

/**
 * 主动预校验：调用需隐私授权的接口前先 await 它。
 * 返回 true = 已授权或无需授权；false = 用户拒绝。
 * 内部通过 requirePrivacyAuthorize 触发上面的监听弹窗，由用户最终决定。
 */
export async function ensurePrivacyAuthorized() {
  if (typeof Taro.getPrivacySetting !== 'function') return true
  try {
    const { needAuthorization } = await Taro.getPrivacySetting()
    if (!needAuthorization) return true
  } catch (e) {
    // 取不到设置时放行，避免把正常用户挡在门外
    return true
  }
  return new Promise((resolve) => {
    Taro.requirePrivacyAuthorize({
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}
