<template>
  <view class="page">
    <!-- 净时薪 7 日趋势：ECharts 折线面积图 -->
    <view class="ns-card">
      <view class="title">近 7 日净时薪</view>
      <view class="chart-box">
        <ec-canvas id="chart-trend" canvas-id="chart-trend" :ec="ecTrend" style="width:100%;height:100%;display:block;" />
      </view>
    </view>

    <!-- 核心公式展示：净时薪 = (订单收入-高速-停车-分摊固定成本-电费) / 耗时 -->
    <view class="ns-card">
      <view class="title">各平台对比</view>
      <view v-for="p in compare" :key="p.name" class="row">
        <text>{{ p.name }}</text>
        <text class="v">¥{{ p.hourly }}/时</text>
      </view>
    </view>

    <view class="ns-card">
      <view class="title">成本拆解</view>
      <view class="cost-wrap">
        <view class="cost-list">
          <view v-for="c in costs" :key="c.name" class="row">
            <text>{{ c.name }}</text>
            <text>¥{{ c.amount }}（{{ c.percent }}%）</text>
          </view>
        </view>
        <view class="pie-box">
          <ec-canvas id="chart-cost" canvas-id="chart-cost" :ec="ecCost" style="width:100%;height:100%;display:block;" />
        </view>
      </view>
    </view>

    <!-- 周报卡（P0 补齐项③）：本周 vs 上周，涨红跌绿，订阅推送入口 -->
    <view class="ns-card" v-if="weekly">
      <view class="title">本周报告</view>
      <view class="wk-row">
        <view class="wk-col">
          <text class="wk-label">本周净收益</text>
          <view class="wk-num-row">
            <text class="wk-num">¥{{ weekly.thisWeek.net }}</text>
            <text class="wk-delta" :class="deltaNet >= 0 ? 'up' : 'down'">{{ deltaNet >= 0 ? '↑' : '↓' }}{{ Math.abs(deltaNetPercent) }}%</text>
          </view>
          <text class="wk-sub">上周 ¥{{ weekly.lastWeek.net }}</text>
        </view>
        <view class="wk-col">
          <text class="wk-label">本周净时薪</text>
          <view class="wk-num-row">
            <text class="wk-num">¥{{ weekly.thisWeek.hourly }}</text>
            <text class="wk-delta" :class="deltaHourly >= 0 ? 'up' : 'down'">{{ deltaHourly >= 0 ? '↑' : '↓' }}{{ Math.abs(deltaHourlyPercent) }}%</text>
          </view>
          <text class="wk-sub">上周 ¥{{ weekly.lastWeek.hourly }}</text>
        </view>
      </view>
      <view class="wk-tip">每周一 08:00 自动推送到微信（服务通知）</view>
    </view>

    <!-- 成本记账入口（净收益 = 收入 − 成本，成本侧总账）视觉与首页"车队已授权同步"卡一致 -->
    <view class="ns-card cost-entry" @tap="goCosts">
      <view class="ce-info">
        <view class="ce-title">📒 成本记账</view>
        <view class="ce-sub">充电、高速、保养…记清楚才叫净收益</view>
      </view>
      <button class="ce-btn" @tap.stop="goCosts">记一笔</button>
    </view>

    <!-- 洞察卡：结论型文案，提升付费价值感 -->
    <view class="insight ns-card" v-if="insight">💡 {{ insight }}</view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import Taro, { useDidShow } from '@tarojs/taro'
import { api } from '../../api'

const trend = ref([])
const compare = ref([])
const costs = ref([])
const insight = ref('')
// 周报对比数据（report type=analysis 返回里带 weekly）
const weekly = ref(null)

// 涨跌：国内口径涨红跌绿
const deltaNet = computed(() => Number(weekly.value?.thisWeek?.net || 0) - Number(weekly.value?.lastWeek?.net || 0))
const deltaNetPercent = computed(() => {
  const last = Number(weekly.value?.lastWeek?.net || 0)
  return last > 0 ? Math.round((deltaNet.value / last) * 100) : 0
})
const deltaHourly = computed(() => Number(weekly.value?.thisWeek?.hourly || 0) - Number(weekly.value?.lastWeek?.hourly || 0))
const deltaHourlyPercent = computed(() => {
  const last = Number(weekly.value?.lastWeek?.hourly || 0)
  return last > 0 ? Math.round((deltaHourly.value / last) * 100) : 0
})

function goCosts() {
  Taro.navigateTo({ url: '/pages/costs/index' })
}

// ===== ECharts 通用 =====
// 趋势/成本两个图表：实例延迟初始化，数据先到或图先初始化都能正确渲染
let trendChart = null
let costChart = null

// 近 7 日 X 轴标签（今天 + 前 6 天，MM-DD）
function last7Labels() {
  const arr = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    arr.push(`${d.getMonth() + 1}/${d.getDate()}`)
  }
  return arr
}

function buildTrendOption(values) {
  return {
    grid: { left: 8, right: 16, top: 30, bottom: 0, containLabel: true },
    tooltip: { trigger: 'axis', confine: true, valueFormatter: (v) => '¥' + v },
    xAxis: {
      type: 'category',
      data: last7Labels(),
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#E5E6EB' } },
      axisLabel: { color: '#86909C', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#F2F3F5' } },
      axisLabel: { color: '#86909C', fontSize: 10, formatter: '¥{value}' }
    },
    series: [{
      type: 'line',
      name: '净时薪',
      data: values,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 3, color: '#FF7E33' },
      itemStyle: { color: '#FF7E33', borderWidth: 2, borderColor: '#fff' },
      // 折线下方橙色渐变面积，视觉更"逼真"
      areaStyle: { color: 'rgba(255,126,51,0.18)' }
    }]
  }
}

const COST_COLORS = ['#FF7E33', '#FFA35C', '#FFC79A', '#FFE3CE']

function buildCostOption(list) {
  return {
    tooltip: { trigger: 'item', confine: true, formatter: '{b}: ¥{c}（{d}%）' },
    legend: { show: false },
    series: [{
      type: 'pie',
      radius: ['45%', '72%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: list.map((c, i) => ({
        name: c.name,
        value: Number(c.amount) || 0,
        itemStyle: { color: COST_COLORS[i % COST_COLORS.length] }
      }))
    }]
  }
}

// ec-canvas 初始化回调（组件侧已 init 好并传入 chart 实例，页面无需 import echarts）
function initTrendChart(chart) {
  trendChart = chart
  chart.setOption(buildTrendOption(trend.value))
}
function initCostChart(chart) {
  costChart = chart
  chart.setOption(buildCostOption(costs.value))
}
const ecTrend = { onInit: initTrendChart }
const ecCost = { onInit: initCostChart }

useDidShow(async () => {
  const res = await api.analysis()
  if (res?.code === 0) {
    trend.value = res.data.trend || []
    compare.value = res.data.compare
    costs.value = res.data.costs
    insight.value = res.data.insight
    weekly.value = res.data.weekly || null
    // 图先初始化、数据后到：补一次 setOption
    if (trendChart) trendChart.setOption(buildTrendOption(trend.value))
    if (costChart) costChart.setOption(buildCostOption(costs.value))
  }
})
</script>

<style>
.title { font-size: 30rpx; font-weight: 600; margin-bottom: 16rpx; }
.row { display: flex; justify-content: space-between; padding: 10rpx 0; font-size: 28rpx; }
.v { color: var(--ns-orange); font-weight: 600; }
.chart-box { width: 100%; height: 360rpx; }
.cost-wrap { display: flex; align-items: center; gap: 16rpx; }
.cost-list { flex: 1; }
.pie-box { width: 280rpx; height: 280rpx; flex-shrink: 0; }
.insight { font-size: 26rpx; color: #b25e00; background: #fff7ef; }
/* 周报卡：涨红跌绿 */
.wk-row { display: flex; }
.wk-col { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.wk-label { font-size: 24rpx; color: var(--ns-sub); }
.wk-num-row { display: flex; align-items: baseline; gap: 10rpx; }
.wk-num { font-size: 40rpx; font-weight: 700; }
.wk-delta { font-size: 24rpx; font-weight: 600; }
.wk-delta.up { color: #E24B4A; }
.wk-delta.down { color: #1D9E75; }
.wk-sub { font-size: 22rpx; color: var(--ns-sub); }
.wk-tip { margin-top: 20rpx; padding-top: 16rpx; border-top: 1rpx solid #F2F3F5; font-size: 22rpx; color: var(--ns-sub); }
/* 成本记账入口行：与首页 .fleet-sync / .fs-* 同一套视觉（橙渐变底 + 橙字标题 + 橙渐变胶囊按钮） */
.cost-entry { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; background: linear-gradient(135deg, #FFF3EA, #FFFFFF); }
.ce-info { display: flex; flex-direction: column; min-width: 0; }
.ce-title { font-size: 30rpx; font-weight: 700; color: var(--ns-orange); }
.ce-sub { font-size: 22rpx; color: var(--ns-sub); margin-top: 6rpx; }
.ce-btn { flex-shrink: 0; margin: 0; font-size: 26rpx; font-weight: 600; padding: 14rpx 26rpx; border-radius: 32rpx; background: linear-gradient(135deg, #FF9A4D, #FF6A1A); color: #fff; line-height: 1.4; }
</style>
