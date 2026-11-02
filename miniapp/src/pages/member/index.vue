<template>
  <view class="page">
    <!-- 会员状态卡：免费版 / 已开通 + 到期日 -->
    <view class="ns-card status">
      <text>{{ isMember ? `会员有效至 ${expireDate}` : '当前为免费版' }}</text>
    </view>

    <!-- 套餐：主推 9.9/月，年付 99 做锚点（见需求分析 §2.4） -->
    <view class="plans ns-card">
      <view class="plan" :class="{ on: plan === 'month' }" @tap="plan = 'month'">
        <text class="p-name">连续包月</text>
        <text class="p-price">¥9.9<text class="p-unit">/月</text></text>
      </view>
      <view class="plan" :class="{ on: plan === 'year' }" @tap="plan = 'year'">
        <text class="p-name">年付</text>
        <text class="p-price">¥99<text class="p-unit">/年</text></text>
      </view>
    </view>

    <view class="ns-card benefits">
      <view>✅ 多平台合并对账</view>
      <view>✅ 净时薪分析</view>
      <view>✅ 无限待办提醒</view>
      <view>✅ 导出对账表</view>
    </view>

    <!-- 支付：调 pay 云函数统一下单（需商户号已开通） -->
    <button class="ns-btn-primary" @tap="buy">立即开通</button>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import { api } from '../../api'

const plan = ref('month')
const isMember = ref(false)
const expireDate = ref('')

// 微信支付流程：pay 云函数返回 wx.requestPayment 参数 → 前端拉起收银台
async function buy() {
  try {
    const order = await api.payCreate({ plan: plan.value })
    if (order?.code !== 0) return Taro.showToast({ title: order?.msg || '下单失败', icon: 'none' })
    await Taro.requestPayment(order.data.payment)
    Taro.showToast({ title: '开通成功', icon: 'success' })
  } catch (e) {
    // 用户取消支付不提示错误
  }
}
</script>

<style>
.status { text-align: center; font-size: 30rpx; color: var(--ns-orange); font-weight: 600; }
.plans { display: flex; gap: 20rpx; }
.plan { flex: 1; border: 2rpx solid #eee; border-radius: 16rpx; padding: 24rpx; text-align: center; }
.plan.on { border-color: var(--ns-orange); background: #fff7ef; }
.p-name { font-size: 26rpx; color: var(--ns-sub); display: block; }
.p-price { font-size: 44rpx; font-weight: 700; color: var(--ns-orange); }
.p-unit { font-size: 22rpx; font-weight: 400; }
.benefits { font-size: 28rpx; line-height: 2; }
</style>
