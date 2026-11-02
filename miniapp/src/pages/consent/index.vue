<template>
  <view class="page">
    <!-- 司机同意流（个保法硬要求）：公司授权 ≠ 司机授权 -->
    <view class="ns-card body">
      <view class="text">
        您的租车公司申请同步您在滴滴车队的账单数据到本小程序，
        仅用于为您生成净时薪与合规台账，不做其他用途。
      </view>
      <view class="text text-2">
        开启后为双向同步：车队会把各平台账单推给你；你在这里「成本记账」记下的每一笔，
        也会同步给车队后台用于成本核算。你可随时在「我的」撤销，撤销后双向都停。
      </view>
      <label class="agree">
        <checkbox :checked="agreed" @tap="agreed = !agreed" />
        <text>我已阅读并同意《数据授权协议》</text>
      </label>
      <button class="ns-btn-primary" :disabled="!agreed" @tap="grant">同意并开启</button>
      <button class="ghost" @tap="deny">暂不开通</button>
      <view class="tip">你随时可在"我的"中撤销授权</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro, { useRouter } from '@tarojs/taro'
import { api } from '../../api'
import { setFleetAuth } from '../../utils/user'

const agreed = ref(false)
// B 端推送授权链接时带 ?fleetId=xxx，必须原样传给云函数，
// 否则 driver_consent 里没有 fleetId，司机记的成本账就归不到任何车队
const router = useRouter()
const fleetId = String(router?.params?.fleetId || '')

// 写 consent 云函数 → driver_consent 集合（grantedAt + scope + fleetId），可撤销
async function grant() {
  const res = await api.consentGrant({ fleetId })
  if (res?.code === 0) {
    // 本地镜像置为已授权 → 首页"车队已授权同步"卡恢复、一键拉取可用
    setFleetAuth(true)
    Taro.showToast({ title: '已开启同步', icon: 'success' })
    setTimeout(() => Taro.navigateBack(), 800)
  }
}

function deny() {
  Taro.navigateBack()
}
</script>

<style>
.body { padding: 48rpx 32rpx; }
.text { font-size: 28rpx; line-height: 1.8; margin-bottom: 24rpx; }
.text-2 { font-size: 24rpx; color: var(--ns-sub); background: #FFF7EF; border-radius: 10rpx; padding: 16rpx 18rpx; margin-bottom: 32rpx; }
.agree { display: flex; align-items: center; gap: 8rpx; font-size: 26rpx; margin-bottom: 32rpx; }
.ghost { background: none; color: var(--ns-sub); font-size: 26rpx; margin-top: 16rpx; }
.tip { text-align: center; font-size: 22rpx; color: var(--ns-sub); margin-top: 16rpx; }
</style>
