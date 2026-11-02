// 用户资料工具：微信头像/昵称的本地持久化
// 采用微信官方推荐的现代流程（getUserProfile 已停用推荐）：
//   头像 = <button open-type="chooseAvatar">；昵称 = <input type="nickname">
// 真实部署时头像临时文件应上传云存储换取永久 fileID；Mock 阶段先存本地路径
import Taro from '@tarojs/taro'

const KEY = 'ns_user_profile'
const DEFAULT = { nickname: '师傅', avatar: '' }

// 读取用户资料（无则返回默认值）
export function getUserProfile() {
  try {
    const v = Taro.getStorageSync(KEY)
    if (v && typeof v === 'object') return { ...DEFAULT, ...v }
  } catch (e) { /* 存储异常静默 */ }
  return { ...DEFAULT }
}

// 合并保存用户资料，返回保存后的完整资料
export function saveUserProfile(patch) {
  const next = { ...getUserProfile(), ...patch }
  try { Taro.setStorageSync(KEY, next) } catch (e) { /* 静默 */ }
  return next
}

// 按当前时段返回问候语
export function getGreeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜班辛苦'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

// ===== 每日净收益目标（P0 补齐项②：目标与激励）=====
// 目标属于个人偏好，存本地即可，不上云
const GOAL_KEY = 'ns_daily_goal'
const DEFAULT_GOAL = 300

export function getDailyGoal() {
  try {
    const v = Number(Taro.getStorageSync(GOAL_KEY))
    if (v > 0) return v
  } catch (e) { /* 静默 */ }
  return DEFAULT_GOAL
}

export function setDailyGoal(v) {
  const n = Math.max(0, Number(v) || 0)
  try { Taro.setStorageSync(GOAL_KEY, n) } catch (e) { /* 静默 */ }
  return n
}

// ===== 车队数据同步授权态（个保法：司机可随时撤回同意）=====
// 权威数据在云端 driver_consent 集合，本地这份只做"镜像"，供页面判断状态、避免每次进页都请求。
// 默认 true（演示环境车队已授权）；司机撤销后置 false，首页"车队已授权同步"卡随即隐藏。
const FLEET_KEY = 'ns_fleet_auth'
const DEFAULT_FLEET = { granted: true, fleetId: 'FLEET-DEMO', fleetName: '南宁邕州租车 · 1 号车队', revokedAt: 0 }

export function getFleetAuth() {
  try {
    const v = Taro.getStorageSync(FLEET_KEY)
    if (v && typeof v === 'object') {
      return {
        granted: v.granted !== false,
        fleetId: v.fleetId || DEFAULT_FLEET.fleetId,
        fleetName: v.fleetName || DEFAULT_FLEET.fleetName,
        revokedAt: Number(v.revokedAt) || 0
      }
    }
  } catch (e) { /* 存储异常静默 */ }
  return { ...DEFAULT_FLEET }
}

export function setFleetAuth(granted, extra = {}) {
  const next = {
    ...getFleetAuth(),
    ...extra,
    granted: !!granted,
    revokedAt: granted ? 0 : (extra.revokedAt || Date.now())
  }
  try { Taro.setStorageSync(FLEET_KEY, next) } catch (e) { /* 静默 */ }
  return next
}
