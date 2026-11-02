<template>
  <view class="page">
    <!-- 用户信息卡：微信头像 + 昵称
         平台限制：2022-10 起微信已收回 getUserProfile 返回真实昵称/头像的能力，
         官方唯一途径 = chooseAvatar 按钮 + type="nickname" 输入框（键盘上方一键填入微信昵称） -->
    <view class="ns-card user-card">
      <button class="avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
        <image class="avatar" :src="profile.avatar || '/assets/default-avatar.png'" mode="aspectFill" />
        <text class="avatar-tip">{{ profile.avatar ? '点击更换头像' : '点击使用微信头像' }}</text>
      </button>
      <view class="nick-row" @tap="focusNick">
        <text class="nick-label">昵称</text>
        <input
          class="nick-input"
          type="nickname"
          :focus="willFocus"
          :value="profile.nickname"
          placeholder="点这里一键填入微信昵称"
          placeholder-class="nick-ph"
          @input="onNickInput"
          @blur="onNickBlur"
        />
      </view>
      <view class="nick-hint">💡 点输入框，键盘上方会出现「使用微信昵称」，一键填入</view>
      <view class="user-sub">净司机 · 算清净赚明白</view>
    </view>

    <view class="ns-card menu-card">
      <view class="cell" hover-class="cell-press" :hover-stay-time="80" @tap="go('/pages/member/index')">
        <text>会员中心</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" hover-class="cell-press" :hover-stay-time="80" @tap="go('/pages/costs/index')">
        <text>成本记账</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" hover-class="cell-press" :hover-stay-time="80" @tap="go('/pages/agreement/index')">
        <text>用户协议</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" hover-class="cell-press" :hover-stay-time="80" @tap="go('/pages/privacy/index')">
        <text>隐私政策</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" hover-class="cell-press" :hover-stay-time="80" @tap="onFleetAuthTap">
        <view class="cell-main">
          <text>车队数据同步</text>
          <text class="cell-sub">{{ fleetAuth.granted ? fleetAuth.fleetName + ' · 已授权' : '已撤销，不再自动拉取各平台账单' }}</text>
        </view>
        <text class="cell-action" :class="{ off: !fleetAuth.granted }">{{ fleetAuth.granted ? '撤销' : '去开启' }} ›</text>
      </view>
      <view class="cell" hover-class="cell-press" :hover-stay-time="80" @tap="del">
        <text>注销账号（即删全部数据）</text>
        <text class="arrow danger">›</text>
      </view>
      <view class="cell static">
        <text>关于 · 广西邕州数智科技有限公司</text>
        <text class="version">v1.0.0</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro, { useDidShow } from '@tarojs/taro'
import { api, clearCache } from '../../api'
import { getUserProfile, saveUserProfile, getFleetAuth, setFleetAuth } from '../../utils/user'

const profile = ref(getUserProfile())
// 车队同步授权态：状态直接写进菜单行，避免"不知道现在有没有授权"
const fleetAuth = ref(getFleetAuth())
// 昵称输入框聚焦控制：整行可点，点行即弹键盘（键盘上方有"使用微信昵称"一键填入）
const willFocus = ref(false)
function focusNick() {
  willFocus.value = false
  // 下一帧再置 true，保证重复点击也能再次唤起键盘
  setTimeout(() => { willFocus.value = true }, 50)
}

// 每次进入"我的"刷新一次资料与授权态（可能刚在同意页开启/在首页撤销）
useDidShow(() => {
  profile.value = getUserProfile()
  fleetAuth.value = getFleetAuth()
})

// 选择微信头像：e.detail.avatarUrl 为临时路径（Mock 阶段直接存本地；
// 正式版需 Taro.uploadFile 传云存储换永久 fileID，避免临时路径失效）
function onChooseAvatar(e) {
  const url = e?.detail?.avatarUrl
  if (!url) return
  profile.value = saveUserProfile({ avatar: url })
  Taro.showToast({ title: '头像已更新', icon: 'success' })
}

// 边输入边存：即使没触发 blur 就离开页面，首页也能读到最新昵称（含微信昵称一键填入）
function onNickInput(e) {
  const nick = (e?.detail?.value || '').trim()
  if (!nick) return
  profile.value = saveUserProfile({ nickname: nick })
}

// 失焦兜底保存 + 收起键盘状态
function onNickBlur(e) {
  willFocus.value = false
  const nick = (e?.detail?.value || '').trim()
  if (!nick || nick === profile.value.nickname) return
  profile.value = saveUserProfile({ nickname: nick })
  Taro.showToast({ title: '昵称已保存', icon: 'success' })
}

function go(url) {
  Taro.navigateTo({ url })
}

// 车队数据同步授权：已授权 → 可撤销（讲清后果）；已撤销 → 去重新授权（走同意页）
function onFleetAuthTap() {
  if (fleetAuth.value.granted) revoke()
  else Taro.navigateTo({ url: '/pages/consent/index' })
}

// 撤销授权：个保法第 15 条要求"便捷的撤回方式"，所以必须有这个入口、且必须真的生效
//   生效链路：consent 云函数标记 revoked → syncFleet 校验后拒绝同步（Mock 同口径）
//   本地同步置 granted=false → 首页"车队已授权同步"卡隐藏，一键拉取入口一并收起
async function revoke() {
  const { confirm } = await Taro.showModal({
    title: '撤销车队数据同步授权',
    content: '撤销后为双向停止，立即生效：\n\n'
      + '1. 车队不再向你推送账单数据，自动同步关闭\n'
      + '2. 你此后在「成本记账」记的每一笔，也不再同步给车队后台（已同步的历史记录保留）\n'
      + '3. 首页「车队已授权同步」卡片消失，一键拉取一并停用\n'
      + '4. 已经拉进来的账单、成本记录全部保留，不会被删除\n'
      + '5. 以后需要时，在「我的」点「去开启」即可恢复',
    confirmText: '确认撤销',
    confirmColor: '#F53F3F',
    cancelText: '再想想'
  })
  if (!confirm) return
  Taro.showLoading({ title: '正在撤销…', mask: true })
  const res = await api.consentRevoke()
  Taro.hideLoading()
  if (res?.code !== 0) {
    Taro.showToast({ title: res?.msg || '撤销失败，请稍后再试', icon: 'none' })
    return
  }
  // 云端已撤销，本地镜像同步（首页读这份判断是否展示同步卡）
  fleetAuth.value = setFleetAuth(false)
  Taro.showToast({ title: '已撤销，双向同步已停止', icon: 'none', duration: 2200 })
}

// 注销即删（隐私红线）：详细告知后果 → 确认 → 删除云端全部数据 + 清空本地 → 回首页
async function del() {
  const { confirm } = await Taro.showModal({
    title: '注销账号确认',
    content: '注销后将立即执行以下操作，且不可恢复：\n\n'
      + '1. 删除你的全部账单、成本、合同、证件台账数据\n'
      + '2. 撤销车队数据同步授权，停止一切自动同步\n'
      + '3. 清空会员权益，剩余会员期不予退还\n'
      + '4. 注销后如需使用，须重新注册并重新录入数据',
    confirmText: '确认注销',
    confirmColor: '#F53F3F',
    cancelText: '再想想'
  })
  if (!confirm) return
  const res = await api.deleteAccount()
  if (res?.code !== 0) {
    Taro.showToast({ title: res?.msg || '注销失败，请稍后再试', icon: 'none' })
    return
  }
  // 清空本地全部缓存（含头像/昵称等资料），并清掉内存里的读缓存，避免残留他人痕迹
  try { Taro.clearStorageSync() } catch (e) { /* 静默 */ }
  clearCache()
  profile.value = getUserProfile()
  Taro.showToast({ title: '已注销，数据已清除', icon: 'none' })
  setTimeout(() => Taro.switchTab({ url: '/pages/index/index' }), 600)
}
</script>

<style>
.user-card { display: flex; flex-direction: column; align-items: center; gap: 20rpx; padding: 48rpx 24rpx 32rpx; }
.avatar-btn { padding: 0; margin: 0; background: transparent; border: none; line-height: 1.3; display: flex; flex-direction: column; align-items: center; gap: 10rpx; }
.avatar-btn::after { border: none; }
.avatar { width: 128rpx; height: 128rpx; border-radius: 50%; border: 6rpx solid #FFE3CE; background: #F2F3F5; }
.avatar-tip { font-size: 22rpx; color: var(--ns-sub); }
.nick-row { display: flex; align-items: center; gap: 16rpx; width: 100%; padding: 16rpx 24rpx; background: #F7F8FA; border-radius: 12rpx; }
.nick-label { font-size: 28rpx; color: var(--ns-sub); flex-shrink: 0; }
.nick-input { flex: 1; font-size: 28rpx; text-align: right; }
.nick-ph { color: #C9CDD4; }
.nick-hint { font-size: 20rpx; color: var(--ns-sub); background: #FFF7EF; border-radius: 10rpx; padding: 10rpx 16rpx; width: 100%; box-sizing: border-box; }
.user-sub { font-size: 22rpx; color: var(--ns-sub); }
.cell { padding: 28rpx 8rpx; font-size: 30rpx; border-bottom: 1rpx solid #f2f3f5; display: flex; align-items: center; justify-content: space-between; }
.cell:last-child { border-bottom: none; }
/* 带状态的两行菜单项：主标题 + 状态副标，右侧是动作文字 */
.cell-main { display: flex; flex-direction: column; gap: 6rpx; flex: 1; }
.cell-sub { font-size: 22rpx; color: var(--ns-sub); }
.cell-action { font-size: 26rpx; color: var(--ns-sub); flex-shrink: 0; }
/* 未授权时"去开启"是引导动作，用主题色突出；已授权时"撤销"是破坏性动作，弱化为灰色 */
.cell-action.off { color: var(--ns-orange); font-weight: 600; }
/* 右侧箭头：暗示可点击 */
.arrow { color: #C9CDD4; font-size: 34rpx; font-weight: 600; }
.arrow.danger { color: #F53F3F; }
/* 可点击行按压反馈：整行变灰一瞬 */
.cell-press { background: #F2F3F5; }
/* 静态行（关于）不可点：箭头换成弱化版本号 */
.cell.static { color: var(--ns-sub); font-size: 26rpx; }
.version { color: #C9CDD4; font-size: 24rpx; }
</style>
