<template>
  <view class="page">
    <!-- 品牌页头：图标 + 问候（昵称）+ 微信头像 -->
    <view class="header">
      <view class="brand">
        <!-- 首字头像块：显示昵称第一个字，未设置昵称时显示品牌字"净" -->
        <view class="logo">{{ logoChar }}</view>
        <view class="hi">
          <text class="hi-main">{{ greeting }}，{{ profile.nickname }}</text>
          <text class="hi-sub">净司机 · 算清净赚明白</text>
        </view>
      </view>
      <image class="header-avatar" :src="profile.avatar || '/assets/default-avatar.png'" mode="aspectFill" @tap="goProfile" />
    </view>

    <!-- 待办横幅：证件/押金到期提醒（主触点，替代微信长期订阅） -->
    <view v-if="todoBanner" class="banner">
      <text>⚠️ {{ todoBanner }}</text>
    </view>

    <!-- 三卡：净收益 / 净时薪 / 在线时长 -->
    <view class="stats ns-card">
      <view class="stat">
        <text class="label">本月净收益</text>
        <text class="num">¥{{ summary.netIncome }}</text>
      </view>
      <view class="stat">
        <text class="label">净时薪</text>
        <text class="num">¥{{ summary.netHourly }}</text>
      </view>
      <view class="stat">
        <text class="label">在线时长</text>
        <text class="num">{{ summary.onlineHours }}h</text>
      </view>
    </view>

    <!-- 本月账单缺工时字段时的说明（宁可显示 0，也不给一个编出来的净时薪） -->
    <view v-if="hourlyHint" class="hint-line">{{ hourlyHint }}</view>

    <!-- 今日目标进度卡（P0 补齐项②：目标与激励，对标 Gridwise earnings goal） -->
    <view class="ns-card goal">
      <view class="goal-head">
        <text class="goal-title">今日净收益</text>
        <text class="goal-edit" @tap="toggleGoalEdit">{{ editingGoal ? '收起' : '改目标' }}</text>
      </view>
      <view class="goal-num-row">
        <text class="goal-num">¥{{ todayNet }}</text>
        <text class="goal-total">/ 目标 ¥{{ goal }}</text>
      </view>
      <view class="goal-bar">
        <view class="goal-bar-fill" :style="{ width: goalPercent + '%' }" :class="{ done: goalPercent >= 100 }" />
      </view>
      <view class="goal-tip" :class="{ ok: goalPercent >= 100 }">
        {{ goalPercent >= 100 ? '🎉 已达成本日目标，可以安心收工了' : `距今日目标还差 ¥${goalGap}，继续冲` }}
      </view>
      <!-- 改目标：内联输入行（本地存储，不上云） -->
      <view v-if="editingGoal" class="goal-edit-row">
        <input class="goal-input" type="digit" :value="goalDraft" placeholder="输入每日目标金额" @input="onGoalInput" />
        <button class="fs-btn" @tap="saveGoal">保存</button>
      </view>
    </view>

    <!-- 一键拉取：车队已授权同步（B 端授权 → 自动拉取各平台账单） -->
    <view v-if="fleetSync.authorized" class="ns-card fleet-sync">
      <view class="fs-info">
        <view class="fs-title">⚡ 车队已授权同步</view>
        <view class="fs-sub">{{ fleetSync.fleetName }} · 上次拉取 {{ fleetSync.lastSyncText }}</view>
      </view>
      <button class="fs-btn" :class="{ doing: syncing }" :disabled="syncing" @tap="onSync">{{ syncing ? '拉取中…' : '一键拉取' }}</button>
    </view>

    <!-- 多平台合并（卖点：净 + 跨平台） -->
    <view class="ns-card">
      <view class="card-title">多平台合并</view>
      <view v-for="p in platforms" :key="p.name" class="row">
        <text>{{ p.name }}</text>
        <text class="money">¥{{ p.amount }}</text>
      </view>
    </view>

    <!-- 今日跑单：ECharts 柱状图 -->
    <view class="ns-card">
      <view class="card-title">今日跑单</view>
      <view class="chart-box">
        <ec-canvas id="chart-today" canvas-id="chart-today" :ec="ecToday" style="width:100%;height:100%;display:block;" />
      </view>
    </view>

    <button class="ns-btn-primary" @tap="goImport">导入账单</button>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import Taro, { useDidShow } from '@tarojs/taro'
import { api } from '../../api'
import { getUserProfile, getGreeting, getDailyGoal, setDailyGoal, getFleetAuth } from '../../utils/user'

// ===== 用户资料（微信授权头像/昵称，本地存储持久化） =====
const profile = ref(getUserProfile())
const greeting = getGreeting()
// logo 方块显示昵称第一个字（取不到则回退品牌字"净"）
const logoChar = computed(() => {
  const n = (profile.value.nickname || '').trim()
  return n ? n[0] : '净'
})
function goProfile() {
  Taro.navigateTo({ url: '/pages/profile/index' })
}

// ===== 今日目标进度（目标存本地 storage，今日净收益来自 report 接口） =====
const goal = ref(getDailyGoal())
const goalDraft = ref('')
const editingGoal = ref(false)
const todayNet = ref('0.00')

const goalPercent = computed(() => {
  const p = Math.floor((Number(todayNet.value) / Math.max(1, goal.value)) * 100)
  return Math.min(100, Math.max(0, p))
})
const goalGap = computed(() => {
  const g = (goal.value - Number(todayNet.value)).toFixed(2)
  return Number(g) > 0 ? g : '0.00'
})
function toggleGoalEdit() {
  editingGoal.value = !editingGoal.value
  goalDraft.value = String(goal.value)
}
function onGoalInput(e) {
  goalDraft.value = e?.detail?.value || ''
}
function saveGoal() {
  goal.value = setDailyGoal(goalDraft.value)
  editingGoal.value = false
  Taro.showToast({ title: '目标已保存', icon: 'success' })
}

// ===== 概览数据与多平台余额（report 云函数 / Mock） =====
const summary = ref({ netIncome: '0.00', netHourly: '0.0', onlineHours: 0 })
const platforms = ref([])
const todoBanner = ref('')
const todayOrders = ref([])
// 账单缺「在线时长」时的说明文案（report 返回，为空则不显示）
const hourlyHint = ref('')
// 车队授权同步状态（未授权车队时整个卡片不显示，回落到手动导入）
const fleetSync = ref({ authorized: false, fleetName: '', lastSyncText: '' })
const syncing = ref(false)

// 一键拉取：syncFleet 云函数（Mock 每次新增 3 条），成功后提示并更新同步时间
async function onSync() {
  if (syncing.value) return
  syncing.value = true
  Taro.showLoading({ title: '正在拉取各平台账单…', mask: true })
  try {
    const res = await api.syncFleet()
    Taro.hideLoading()
    if (res?.code === 0) {
      fleetSync.value.lastSyncText = res.data.lastSyncText || '刚刚'
      Taro.showToast({ title: `已拉取 ${res.data.added} 条（${(res.data.platforms || []).join('、')}）`, icon: 'none', duration: 2200 })
    } else {
      Taro.showToast({ title: res?.msg || '拉取失败，请稍后再试', icon: 'none' })
    }
  } catch (e) {
    Taro.hideLoading()
    Taro.showToast({ title: '拉取失败，请稍后再试', icon: 'none' })
  } finally {
    syncing.value = false
  }
}

// ===== ECharts：今日跑单柱状图 =====
// chartInstance 延迟初始化：数据先到 or 图先初始化都能正确渲染
let chartInstance = null

function buildTodayOption(list) {
  return {
    grid: { left: 8, right: 8, top: 24, bottom: 0, containLabel: true },
    tooltip: { trigger: 'axis', confine: true },
    xAxis: {
      type: 'category',
      data: list.map((o) => o.time),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#E5E6EB' } },
      axisLabel: { color: '#86909C', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#F2F3F5' } },
      axisLabel: { color: '#86909C', fontSize: 10 }
    },
    series: [{
      type: 'bar',
      name: '单量',
      data: list.map((o) => o.count),
      barWidth: '52%',
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
        color: '#FF7E33'
      }
    }]
  }
}

// ec-canvas 初始化回调（组件侧已 init 好并传入 chart 实例，页面无需 import echarts）
function initTodayChart(chart) {
  chartInstance = chart
  chart.setOption(buildTodayOption(todayOrders.value))
}
const ecToday = { onInit: initTodayChart }

async function loadHome() {
  // 每次回到首页刷新用户资料（可能刚在"我的"页改过头像/昵称）
  profile.value = getUserProfile()
  try {
    // needFleet：本地已授权才让服务端查车队状态，未授权时直接跳过，省两次数据库往返
    const auth = getFleetAuth()
    const res = await api.home({ needFleet: auth.granted })
    if (res?.code === 0) {
      summary.value = res.data.summary
      todayNet.value = res.data.today?.net || '0.00'
      platforms.value = res.data.platforms || []
      todoBanner.value = res.data.todoBanner || ''
      todayOrders.value = res.data.todayOrders || []
      hourlyHint.value = res.data.hourlyHint || ''
      // 车队同步卡：以本地授权镜像为"否决项"——司机在「我的」撤销后，这张卡和一键拉取一起收起
      // （服务端拿不到授权时也走这里，回落手动导入）
      const serverFleet = res.data.fleetSync || { authorized: false, fleetName: '', lastSyncText: '' }
      fleetSync.value = auth.granted ? serverFleet : { authorized: false, fleetName: '', lastSyncText: '' }
      // 图表先初始化、数据后到：补一次 setOption
      if (chartInstance) chartInstance.setOption(buildTodayOption(todayOrders.value))
    }
  } catch (e) { /* 静默 */ }
}

function goImport() {
  Taro.navigateTo({ url: '/pages/bill-import/index' })
}

useDidShow(loadHome)
</script>

<style>
.header { padding: 32rpx 24rpx 8rpx; display: flex; align-items: center; justify-content: space-between; }
.brand { display: flex; align-items: center; gap: 16rpx; flex: 1; }
.logo { width: 72rpx; height: 72rpx; border-radius: 20rpx; background: linear-gradient(135deg, #FF9A4D, #FF6A1A); color: #fff; font-size: 40rpx; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.hi { display: flex; flex-direction: column; }
.hi-main { font-size: 36rpx; font-weight: 700; }
.hi-sub { font-size: 22rpx; color: var(--ns-sub); }
.header-avatar { width: 88rpx; height: 88rpx; border-radius: 50%; border: 4rpx solid #FFE3CE; background: #F2F3F5; }
.banner { margin: 20rpx 24rpx; padding: 20rpx 24rpx; background: linear-gradient(135deg, #FF9A4D, #FF6A1A); color: #fff; border-radius: 16rpx; font-size: 26rpx; }
/* 今日目标进度卡 */
.goal-head { display: flex; justify-content: space-between; align-items: center; }
.goal-title { font-size: 30rpx; font-weight: 600; }
.goal-edit { font-size: 24rpx; color: var(--ns-orange); padding: 4rpx 8rpx; }
.goal-num-row { display: flex; align-items: baseline; gap: 12rpx; margin: 12rpx 0 16rpx; }
.goal-num { font-size: 52rpx; font-weight: 700; color: var(--ns-orange); }
.goal-total { font-size: 24rpx; color: var(--ns-sub); }
.goal-bar { height: 16rpx; border-radius: 8rpx; background: #F2F3F5; overflow: hidden; }
.goal-bar-fill { height: 100%; border-radius: 8rpx; background: linear-gradient(90deg, #FF9A4D, #FF6A1A); transition: width .4s; }
.goal-bar-fill.done { background: linear-gradient(90deg, #35C26B, #1D9E75); }
.goal-tip { font-size: 24rpx; color: var(--ns-sub); margin-top: 12rpx; }
.goal-tip.ok { color: #1D9E75; }
.goal-edit-row { display: flex; align-items: center; gap: 16rpx; margin-top: 20rpx; }
.goal-input { flex: 1; padding: 14rpx 20rpx; background: #F7F8FA; border-radius: 12rpx; font-size: 28rpx; }
/* 一键拉取卡 */
.fleet-sync { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; background: linear-gradient(135deg, #FFF3EA, #FFFFFF); }
.fs-title { font-size: 30rpx; font-weight: 700; color: var(--ns-orange); }
.fs-sub { font-size: 22rpx; color: var(--ns-sub); margin-top: 6rpx; }
.fs-btn { flex-shrink: 0; margin: 0; font-size: 26rpx; font-weight: 600; padding: 14rpx 26rpx; border-radius: 32rpx; background: linear-gradient(135deg, #FF9A4D, #FF6A1A); color: #fff; line-height: 1.4; }
.fs-btn.doing { opacity: .6; }
.stats { display: flex; justify-content: space-between; }
.stat { display: flex; flex-direction: column; align-items: center; }
.label { font-size: 24rpx; color: var(--ns-sub); }
.num { font-size: 40rpx; font-weight: 700; color: var(--ns-orange); margin-top: 8rpx; }
/* 净时薪为 0 时的原因说明，避免用户误以为是 bug */
.hint-line { font-size: 22rpx; color: var(--ns-sub); line-height: 1.5; padding: 12rpx 8rpx 0; }
.card-title { font-size: 30rpx; font-weight: 600; margin-bottom: 12rpx; }
.row { display: flex; justify-content: space-between; padding: 12rpx 0; font-size: 28rpx; }
.money { color: var(--ns-orange); font-weight: 600; }
.chart-box { width: 100%; height: 360rpx; }
.chart-box ec-canvas { width: 100%; height: 100%; display: block; }
.ns-btn-primary { margin: 40rpx 24rpx; }
</style>
