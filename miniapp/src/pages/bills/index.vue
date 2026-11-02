<template>
  <view class="page">
    <!-- 一键拉取：车队已授权（B 端授权 → syncFleet 云函数自动同步各平台账单） -->
    <view class="ns-card sync">
      <view class="sync-info">
        <view class="sync-title">⚡ 一键拉取平台账单</view>
        <view class="sync-sub">你的车队「{{ fleetName }}」已授权同步{{ lastSyncText ? ' · 上次拉取 ' + lastSyncText : '' }}</view>
      </view>
      <button class="sync-btn" :class="{ doing: syncing }" :disabled="syncing" @tap="onSync">{{ syncing ? '拉取中…' : '一键拉取' }}</button>
    </view>

    <!-- 账单列表：标准账单模板字段（金额/净额/来源） -->
    <view v-for="b in bills" :key="b._id" class="ns-card bill">
      <view class="row">
        <text class="date">{{ b.date }}</text>
        <text class="amount">¥{{ b.gross }}</text>
      </view>
      <view class="row sub">
        <text>{{ b.platform }} · {{ b.sourceType === 'fleet' ? '车队同步' : '手动导入' }}</text>
        <text class="net">净 ¥{{ b.net }}</text>
      </view>
    </view>
    <view v-if="!bills.length" class="empty ns-card">还没有账单，去首页导入吧</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../../api'
import { useDidShow } from '@tarojs/taro'

const bills = ref([])
const syncing = ref(false)
// 车队授权信息（Mock 阶段固定已授权；真数据由 consent 集合判断）
const fleetName = ref('')
const lastSyncText = ref('')

useDidShow(async () => {
  const res = await api.bills()
  if (res?.code === 0) bills.value = res.data
  const home = await api.home()
  if (home?.code === 0 && home.data.fleetSync) {
    fleetName.value = home.data.fleetSync.fleetName || ''
    lastSyncText.value = home.data.fleetSync.lastSyncText || ''
  }
})

// 一键拉取：调 syncFleet 云函数，成功后把新账单插到列表顶部
async function onSync() {
  if (syncing.value) return
  syncing.value = true
  Taro.showLoading({ title: '正在拉取各平台账单…', mask: true })
  try {
    const res = await api.syncFleet()
    Taro.hideLoading()
    if (res?.code === 0) {
      bills.value.unshift(...(res.data.bills || []))
      lastSyncText.value = res.data.lastSyncText || '刚刚'
      Taro.showToast({ title: `已拉取 ${res.data.added} 条（${(res.data.platforms || []).join('、')}）`, icon: 'none', duration: 2200 })
    } else {
      Taro.showToast({ title: '拉取失败，请稍后再试', icon: 'none' })
    }
  } catch (e) {
    Taro.hideLoading()
    Taro.showToast({ title: '拉取失败，请稍后再试', icon: 'none' })
  } finally {
    syncing.value = false
  }
}
</script>

<style>
/* 一键拉取卡片 */
.sync { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; background: linear-gradient(135deg, #FFF3EA, #FFFFFF); }
.sync-title { font-size: 30rpx; font-weight: 700; color: var(--ns-orange); }
.sync-sub { font-size: 22rpx; color: var(--ns-sub); margin-top: 6rpx; }
.sync-btn { flex-shrink: 0; margin: 0; font-size: 26rpx; font-weight: 600; padding: 14rpx 26rpx; border-radius: 32rpx; background: linear-gradient(135deg, #FF9A4D, #FF6A1A); color: #fff; line-height: 1.4; }
.sync-btn.doing { opacity: .6; }
.bill .row { display: flex; justify-content: space-between; padding: 8rpx 0; }
.date { font-size: 28rpx; font-weight: 600; }
.amount { color: var(--ns-orange); font-weight: 700; font-size: 32rpx; }
.sub { font-size: 24rpx; color: var(--ns-sub); }
.net { color: #07c160; }
.empty { text-align: center; color: var(--ns-sub); padding: 60rpx 0; }
</style>
