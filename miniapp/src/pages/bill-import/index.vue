<template>
  <view class="page">
    <!-- 平台选择：决定字段归一化映射 + 上方引导随平台切换 -->
    <view class="ns-card">
      <view class="chip" :class="{ on: platform === p }" v-for="p in platforms" :key="p" @tap="platform = p">{{ p }}</view>
    </view>

    <!-- 三步引导（随所选平台变化）：解决"去哪导出"的第一次使用门槛 -->
    <view class="steps ns-card">
      <view class="steps-title">如何导入「{{ platform }}」的账单</view>
      <view class="step">
        <text class="no">1</text>
        <text class="step-txt">{{ exportHints[platform] }}</text>
      </view>
      <view class="step">
        <text class="no">2</text>
        <text class="step-txt">在微信里把文件发给「文件传输助手」（发给任意聊天也可以）</text>
      </view>
      <view class="step">
        <text class="no">3</text>
        <text class="step-txt">回到这里，点击下方卡片 → 在会话列表里选中刚发的文件</text>
      </view>
      <view class="steps-sub">App 版本不同入口略有差异，以 App 内实际页面为准</view>
    </view>

    <!-- 已授权车队引导：不用手动导，直接一键拉取 -->
    <view class="ns-card auto-tip" @tap="goBills">
      <text>⚡ 你的车队已授权自动同步，</text><text class="link">一键拉取平台账单 →</text>
    </view>

    <view class="upload ns-card" hover-class="upload-press" @tap="pickAndUpload">
      <template v-if="!fileName">
        <text class="icon">📄</text>
        <text>点击选择微信会话中的文件</text>
        <text class="sub">支持 CSV / Excel</text>
      </template>
      <template v-else>
        <text class="icon">✅</text>
        <text class="file-name">{{ fileName }}</text>
        <text class="sub">点此可重新选择</text>
      </template>
    </view>

    <button class="ns-btn-primary" :disabled="!fileId" @tap="parse">解析并入库</button>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import { api } from '../../api'
import { chooseMessageFile, uploadBillFile } from '../../utils/media'

const platforms = ['滴滴', '花小猪', '高德', 'T3', '曹操', '首汽', '享道', '如祺']
const platform = ref('滴滴')
const fileId = ref('')
const fileName = ref('')

// 各平台账单导出路径提示（App 改版可能有差异，写通用入口）
const exportHints = {
  滴滴: '打开「滴滴车主App」→ 我的 → 收入 → 流水明细，导出 CSV/Excel 账单',
  花小猪: '打开「花小猪司机App」→ 我的 → 收入 → 流水明细，导出账单文件',
  高德: '打开「高德司机App」→ 收入 → 账单明细，导出收入明细文件',
  T3: '打开「T3出行司机端」→ 钱包 → 流水，申请导出账单明细',
  曹操: '打开「曹操出行司机端」→ 收入 → 收入明细（如暂无导出入口，可先导入其他平台账单体验）',
  首汽: '打开「首汽约车司机端」→ 钱包 → 流水明细，申请导出账单',
  享道: '打开「享道出行司机端」→ 收入 → 明细，导出账单文件',
  如祺: '打开「如祺出行司机端」→ 钱包 → 收入明细（如暂无导出入口，可先导入其他平台账单体验）'
}

// 未授权/懒得导出：跳账单页一键拉取
function goBills() {
  Taro.switchTab({ url: '/pages/bills/index' })
}

// 选文件 → 上传 → 记录 fileID（上传方式由当前接入模式决定，页面不用管）
async function pickAndUpload() {
  try {
    const file = await chooseMessageFile()
    fileId.value = await uploadBillFile(file.path, file.name)
    fileName.value = file.name || '已选择文件'
    Taro.showToast({ title: '已选择文件', icon: 'success' })
  } catch (e) {
    // 用户取消选择静默即可；上传失败要明说，否则司机不知道为什么解析不了
    const msg = String((e && e.message) || '')
    if (!/cancel|取消/i.test(msg)) {
      Taro.showToast({ title: msg || '文件上传失败，请重试', icon: 'none' })
    }
  }
}

// 调云函数解析（parseBill 负责下载文件、字段归一化、写库）
async function parse() {
  Taro.showLoading({ title: '解析中…' })
  try {
    const res = await api.importBills({ fileID: fileId.value, platform: platform.value })
    Taro.hideLoading()
    if (res?.code === 0) {
      Taro.showToast({ title: `入库 ${res.data.count} 条`, icon: 'success' })
      setTimeout(() => Taro.switchTab({ url: '/pages/bills/index' }), 800)
    } else {
      Taro.showToast({ title: res?.msg || '解析失败', icon: 'none' })
    }
  } catch (e) {
    Taro.hideLoading()
  }
}
</script>

<style>
.chip { display: inline-block; padding: 10rpx 28rpx; margin: 0 16rpx 8rpx 0; border-radius: 28rpx; background: #f2f3f5; font-size: 26rpx; }
.chip.on { background: var(--ns-orange); color: #fff; }
.steps { display: flex; flex-direction: column; gap: 16rpx; }
.steps-title { font-size: 30rpx; font-weight: 600; margin-bottom: 4rpx; }
.step { display: flex; align-items: flex-start; gap: 14rpx; }
.no { flex-shrink: 0; width: 34rpx; height: 34rpx; border-radius: 50%; background: #FFE3CE; color: var(--ns-orange); font-size: 22rpx; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.step-txt { font-size: 26rpx; color: var(--ns-text); line-height: 1.5; }
.steps-sub { font-size: 20rpx; color: var(--ns-sub); margin-top: 4rpx; }
.auto-tip { font-size: 26rpx; color: var(--ns-text); }
.auto-tip .link { color: var(--ns-orange); font-weight: 600; }
.upload { display: flex; flex-direction: column; align-items: center; gap: 8rpx; padding: 60rpx 24rpx; border: 2rpx dashed #ddd; border-radius: 20rpx; }
.upload-press { background: #FFF7EF; border-color: var(--ns-orange); }
.icon { font-size: 64rpx; }
.file-name { font-size: 28rpx; font-weight: 600; color: var(--ns-orange); max-width: 100%; }
.sub { font-size: 22rpx; color: var(--ns-sub); }
</style>
