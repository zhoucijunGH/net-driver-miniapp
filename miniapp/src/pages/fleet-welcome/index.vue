<template>
  <view class="page">
    <!-- ============ 分支一：车队码 → 欢迎加入（§2.6.5 第①步"进入分流"）============ -->
    <view v-if="branch === 'fleet'" class="ns-card body">
      <view class="badge">车队码</view>
      <view class="title">{{ fleetName || '租车车队' }}</view>
      <view class="text">邀请你加入车队，开通后：</view>
      <view class="li">· 各平台账单自动同步，不用每周手动导出</view>
      <view class="li">· 每天自动生成净时薪报表（扣掉成本才是真收入）</view>
      <view class="li">· 租车合同、证件到期统一管理</view>

      <!-- 第④步：登记身份（可选，但登记了 B 端才能对上人） -->
      <view class="form">
        <input class="ipt" v-model="driverName" placeholder="您的姓名（用于车队台账）" />
        <input class="ipt" v-model="plate" placeholder="车牌号（如 桂A·D8821）" />
      </view>

      <!-- 第⑤步：数据同步授权（个保法硬要求：公司授权 ≠ 司机授权） -->
      <label class="agree">
        <checkbox :checked="agreed" @tap="agreed = !agreed" />
        <text>同意《数据同步授权书》：仅同步账单用于净时薪与台账，可随时撤销</text>
      </label>
      <button class="ns-btn-primary" :disabled="!agreed || joining" @tap="join">授权并加入车队</button>
      <button class="ghost" @tap="skip">先不用，随便看看</button>
      <view class="tip">拒绝授权不影响手动记账功能；随时可在"我的"撤销</view>
    </view>

    <!-- ============ 分支二：物料码/转发码/自然进入 → 价值页（先给价值再谈转化）============ -->
    <view v-else class="ns-card body">
      <view class="badge badge-2">{{ sourceLabel }}</view>
      <view class="title" v-if="refName">来自{{ refName }}的分享</view>
      <view class="title" v-else>跑网约车，你算过自己的"净时薪"吗？</view>
      <view class="text">
        平台流水 12000，减去租金、电费、保养、罚单，可能只剩 6000——
        净司机帮你算清每一笔，看懂自己到底赚多少、哪天在白跑。
      </view>
      <view class="case" v-if="materialName">案例：{{ materialName }}</view>
      <view class="li">· 微信里导出账单 CSV，30 秒算出净时薪</view>
      <view class="li">· 成本记账（充电/租金/罚单）自动汇总</view>
      <view class="li">· 证件到期提前提醒，不怕被查被罚</view>
      <button class="ns-btn-primary" @tap="goHome">开始查看我的净时薪</button>
      <button class="ghost" @tap="goImport">直接导入平台账单</button>
      <view class="tip">首次导入免费出报表；会员解锁月度对比与多平台合并（9.9/月）</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro, { useRouter } from '@tarojs/taro'
import { api } from '../../api'
import { setFleetAuth } from '../../utils/user'
import { parseScene, typeLabel, entryScene } from '../../utils/qr'

const router = useRouter()
const branch = ref('generic')   // fleet=车队欢迎页 generic=通用价值页
const fleetId = ref('')
const fleetName = ref('')
const refName = ref('')
const materialName = ref('')
const sourceLabel = ref('净司机')

const driverName = ref('')
const plate = ref('')
const agreed = ref(false)
const joining = ref(false)

// onLoad：拿 scene（扫码进入时微信带 query.scene），先本地解析做"进页即路由"，
// 再调服务端 qrResolve 做归因落库 + 取回真实展示数据（车队名/邀请人昵称）
Taro.useLoad((options) => {
  const scene = entryScene(options)
  const local = parseScene(scene)
  branch.value = local.type === 'fleet' ? 'fleet' : 'generic'
  sourceLabel.value = typeLabel(local.type)
  if (scene) {
    api.qrResolve({ scene }).then((res) => {
      if (res?.code !== 0 || !res.data) return
      const d = res.data
      // 以后端归因结果为准（本地解析只是预路由）
      branch.value = d.type === 'fleet' ? 'fleet' : 'generic'
      fleetId.value = d.fleetId || ''
      fleetName.value = d.fleetName || ''
      refName.value = d.refName || ''
      materialName.value = d.materialName || ''
      if (d.type === 'fleet' && branch.value === 'fleet') {
        Taro.setNavigationBarTitle({ title: d.fleetName || '车队邀请' })
      }
    })
  }
})

/** 第⑤步：授权并加入 → consent.grant（服务端顺带把司机写进车队名单） */
async function join() {
  joining.value = true
  try {
    const res = await api.consentGrant({ fleetId: fleetId.value })
    if (res?.code === 0) {
      setFleetAuth(true)
      Taro.showToast({ title: '已加入车队', icon: 'success' })
      setTimeout(() => Taro.switchTab({ url: '/pages/index/index' }), 900)
    } else {
      Taro.showToast({ title: res?.msg || '开通失败，请重试', icon: 'none' })
    }
  } finally {
    joining.value = false
  }
}

/** 拒绝授权不设墙：仍可正常使用手动记账（§2.6.5"拒绝仍可手动导入、功能不残缺"） */
function skip() {
  Taro.switchTab({ url: '/pages/index/index' })
}
function goHome() {
  Taro.switchTab({ url: '/pages/index/index' })
}
function goImport() {
  Taro.navigateTo({ url: '/pages/bill-import/index' })
}
</script>

<style>
.page { padding: 24rpx; }
.body { padding: 48rpx 32rpx; }
.badge { display: inline-block; font-size: 22rpx; color: #FF7E33; background: #FFF1E7; border-radius: 8rpx; padding: 6rpx 16rpx; margin-bottom: 20rpx; }
.badge-2 { color: #0F6E56; background: #E1F5EE; }
.title { font-size: 40rpx; font-weight: 600; margin-bottom: 24rpx; }
.text { font-size: 28rpx; line-height: 1.8; color: var(--ns-sub); margin-bottom: 24rpx; }
.li { font-size: 26rpx; line-height: 2; color: #333; }
.case { font-size: 24rpx; color: var(--ns-sub); background: #F7F8FA; border-radius: 10rpx; padding: 14rpx 18rpx; margin: 20rpx 0; }
.form { margin: 28rpx 0 8rpx; }
.ipt { border: 1rpx solid #E5E6EB; border-radius: 10rpx; padding: 18rpx 20rpx; font-size: 26rpx; margin-bottom: 18rpx; }
.agree { display: flex; align-items: flex-start; gap: 8rpx; font-size: 24rpx; margin: 20rpx 0 28rpx; color: #666; }
.ghost { background: none; color: var(--ns-sub); font-size: 26rpx; margin-top: 16rpx; }
.tip { text-align: center; font-size: 22rpx; color: var(--ns-sub); margin-top: 16rpx; }
</style>
