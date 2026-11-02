<template>
  <view class="page">
    <!-- 筛选：全部 / 即将到期 / 已逾期 -->
    <view class="tabs">
      <view v-for="t in tabs" :key="t" class="tab" :class="{ on: tab === t }" @tap="tab = t; load()">{{ t }}</view>
    </view>

    <!-- 台账时间线：证件/合同/二保/押金，四色状态 -->
    <view v-for="item in items" :key="item._id" class="ns-card item">
      <view class="head">
        <text class="name">{{ item.type }}</text>
        <text class="badge" :class="item.status">{{ statusText(item.status) }}</text>
      </view>
      <view class="due">到期：{{ item.dueDate }}</view>
      <button class="mini-btn" @tap="renew(item)">去处理</button>
    </view>
    <view v-if="!items.length" class="ns-card empty">暂无记录</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import { api } from '../../api'
import { useDidShow } from '@tarojs/taro'

const tabs = ['全部', '即将到期', '已逾期']
const tab = ref('全部')
const items = ref([])

function statusText(s) {
  return { ok: '有效', soon: '即将到期', overdue: '已逾期', future: '未到期' }[s] || s
}

async function load() {
  const res = await api.ledger({ tab: tab.value })
  if (res?.code === 0) items.value = res.data
}

function renew(item) {
  // TODO: 跳转编辑表单页（合同/证件录入）
  Taro.showToast({ title: '表单页待开发', icon: 'none' })
}

useDidShow(load)
</script>

<style>
.tabs { display: flex; gap: 24rpx; padding: 24rpx; }
.tab { padding: 12rpx 32rpx; border-radius: 32rpx; background: #fff; font-size: 26rpx; color: var(--ns-sub); }
.tab.on { background: var(--ns-orange); color: #fff; }
.head { display: flex; justify-content: space-between; align-items: center; }
.name { font-size: 30rpx; font-weight: 600; }
.badge { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; }
.badge.ok { background: #e8f8ef; color: #07c160; }
.badge.soon { background: #fff3e8; color: #ff8f1f; }
.badge.overdue { background: #ffecec; color: #fa5151; }
.badge.future { background: #e8f1fd; color: #1677ff; }
.due { font-size: 24rpx; color: var(--ns-sub); margin: 12rpx 0; }
.mini-btn { font-size: 24rpx; height: 56rpx; line-height: 56rpx; background: var(--ns-orange); color: #fff; border-radius: 32rpx; width: 160rpx; padding: 0; }
.empty { text-align: center; color: var(--ns-sub); padding: 60rpx 0; }
</style>
