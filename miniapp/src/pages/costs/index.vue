<template>
  <view class="page">
    <!-- 月度汇总：成本总额 + 占流水比例（净收益公式里"成本侧"的总账） -->
    <view class="ns-card sum">
      <view class="sum-col">
        <text class="sum-label">本月成本合计</text>
        <text class="sum-num">¥{{ monthTotal }}</text>
      </view>
      <view class="sum-col">
        <text class="sum-label">占流水比例</text>
        <text class="sum-sub">{{ costRatio }}%</text>
      </view>
    </view>

    <!-- 记一笔：分类快选 + 金额 + 备注 + 拍照凭证（3 秒完成一笔） -->
    <view class="ns-card">
      <view class="card-title">记一笔</view>
      <view class="cats">
        <view
          v-for="c in cats" :key="c.name"
          class="cat" :class="{ on: form.category === c.name }"
          :style="form.category === c.name ? { background: c.color, borderColor: c.color } : {}"
          @tap="form.category = c.name"
        >
          <view class="cat-dot" :style="{ background: c.color }" />
          <text>{{ c.name }}</text>
        </view>
      </view>
      <view class="form-row">
        <text class="form-label">金额</text>
        <input class="form-input" type="digit" :value="form.amount" placeholder="花了多少元" placeholder-class="ph" @input="(e) => (form.amount = e?.detail?.value || '')" />
      </view>
      <view class="form-row">
        <text class="form-label">备注</text>
        <input class="form-input" :value="form.note" placeholder="选填，如：机场高速往返" placeholder-class="ph" @input="(e) => (form.note = e?.detail?.value || '')" />
      </view>
      <view class="form-row">
        <text class="form-label">凭证</text>
        <view class="pic-wrap">
          <image v-if="picPath" class="pic-thumb" :src="picPath" mode="aspectFill" @tap="previewPic" />
          <button class="pic-btn" :loading="ocrLoading" :disabled="ocrLoading" @tap="choosePic">
            {{ ocrLoading ? '识别中…' : picPath ? '重新拍照' : '拍照 / 选图存凭证' }}
          </button>
        </view>
      </view>
      <!-- 选图后的凭证状态 -->
      <view v-if="picTip" class="pic-tip"><text>{{ picTip }}</text></view>
      <!-- 未选图时常驻说明：先讲清预期，避免司机以为拍完会自动填好 -->
      <view v-if="!picTip" class="hint-line">
        <text>拍照识别正在优化中：当前先把票据存成凭证，功能上线后会自动读出金额和分类填进上面，不用再手输。</text>
      </view>
      <button class="ns-btn-primary save-btn" @tap="save">保存这笔成本</button>
    </view>

    <!-- 近期成本列表（最新在上，真实插入） -->
    <view class="ns-card">
      <view class="card-title">近期成本</view>
      <view v-for="c in items" :key="c._id" class="cost-row">
        <view class="cost-left">
          <view class="cost-dot" :style="{ background: catColor(c.category) }" />
          <view class="cost-info">
            <text class="cost-cat">{{ c.category }}<text v-if="c.hasPic" class="pic-tag"> 有凭证</text></text>
            <text class="cost-note">{{ c.date }}{{ c.note ? ' · ' + c.note : '' }}</text>
          </view>
        </view>
        <text class="cost-amt">-¥{{ c.amount }}</text>
      </view>
    </view>
    <PrivacyModal />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import Taro, { useDidShow } from '@tarojs/taro'
import { api } from '../../api'
import { OCR_AUTO_FILL } from '../../utils/config'
import { uploadReceipt } from '../../utils/media'
import { getUserProfile } from '../../utils/user'
import { ensurePrivacyAuthorized } from '../../utils/privacy'
import PrivacyModal from '../../components/PrivacyModal.vue'

// 分类与配色（与 B 端/分析页成本拆解口径一致）
const cats = [
  { name: '充电', color: '#1D9E75' },
  { name: '加油', color: '#378ADD' },
  { name: '高速停车', color: '#BA7517' },
  { name: '保养维修', color: '#7F77DD' },
  { name: '罚单', color: '#E24B4A' },
  { name: '其他', color: '#888780' }
]
function catColor(name) {
  return (cats.find((c) => c.name === name) || {}).color || '#888780'
}

const monthTotal = ref('0.00')
const items = ref([])
const form = ref({ category: '充电', amount: '', note: '' })
const picPath = ref('')       // 本地临时路径（缩略图预览）
const picFileID = ref('')     // 云存储 fileID（真实模式，保存时一并入库留档）
const picTip = ref('')        // 选图后的状态提示
const ocrLoading = ref(false) // 仅 OCR_AUTO_FILL 打开时使用

// 本月流水（演示口径 ¥26560）用于算成本占比
const monthGross = 26560
const costRatio = computed(() => {
  const r = (Number(monthTotal.value) / monthGross) * 100
  return r.toFixed(1)
})

async function load() {
  const res = await api.costs()
  if (res?.code === 0) {
    monthTotal.value = res.data.monthTotal
    items.value = res.data.items || []
  }
}
useDidShow(load)

/**
 * 拍照/选图
 * 当前版本（OCR_AUTO_FILL = false）：只把票据存成凭证留档，不写任何字段，避免识别不准污染账目。
 * 开关打开后：上传 → ocrBill 识别 → 回填金额/分类/备注（代码保留在 recognize 里，届时直接生效）。
 */
async function choosePic() {
  if (ocrLoading.value) return
  // 隐私授权：未授权时微信会拦截相册/摄像头接口，先拿授权再选图（否则真机必崩）
  if (!(await ensurePrivacyAuthorized())) return
  let picked
  try {
    picked = await Taro.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed']
    })
  } catch (e) {
    return // 用户取消
  }
  const path = picked?.tempFiles?.[0]?.tempFilePath
  if (!path) return

  picPath.value = path
  picFileID.value = ''
  picTip.value = ''

  if (OCR_AUTO_FILL) {
    await recognize(path)
    return
  }

  // 仅留存凭证：上传拿 fileID 一并入库（mock 模式不真传，返回占位串）
  try {
    picFileID.value = await uploadReceipt(path)
    picTip.value = '已存为凭证，保存这笔记录时一并留档。'
  } catch (e) {
    picTip.value = '图片暂时没上传成功，可点“重新拍照”再试；不影响先记下金额。'
  }
}

/** OCR 自动识别（默认关闭，开关打开后生效）：识别结果只回填，不做默认值兜底 */
async function recognize(path) {
  ocrLoading.value = true
  picTip.value = '正在识别金额、分类和备注…'
  try {
    picFileID.value = await uploadReceipt(path)
    const res = await api.ocrBill({ fileID: picFileID.value })
    if (res?.code === 0 && res.data?.amount) {
      const d = res.data
      form.value.amount = String(d.amount)
      if (cats.some((c) => c.name === d.category)) form.value.category = d.category
      if (d.note) form.value.note = d.note
      const lowConf = d.confidence && d.confidence < 0.9
      picTip.value = `已识别：${d.merchant ? d.merchant + ' ' : ''}¥${d.amount}（${d.category}）${lowConf ? ' · 把握一般，请核对' : ' · 可直接保存或修改'}`
    } else {
      picTip.value = '这张图没认出金额，可重拍或手动填写（凭证仍会留存）。'
    }
  } catch (e) {
    picTip.value = '识别失败，可重拍或手动填写（凭证仍会留存）。'
  } finally {
    ocrLoading.value = false
  }
}

function previewPic() {
  if (picPath.value) Taro.previewImage({ urls: [picPath.value] })
}

// 保存 → addCost 云函数：写 costs 集合，并按授权态决定是否"同步给车队后台"
//   已授权且有 fleetId → syncToFleet=true，B 端成本台账能读到
//   已撤销授权 / 未绑定车队 → 仍能正常记账，但 syncToFleet=false，B 端查不到
//   （判断在云函数里做，前端只负责把结果如实告诉司机，不做假同步）
async function save() {
  const amt = Number(form.value.amount)
  if (!amt || amt <= 0) {
    Taro.showToast({ title: '请输入金额', icon: 'none' })
    return
  }
  const res = await api.addCost({
    ...form.value,
    amount: amt.toFixed(2),
    hasPic: !!picPath.value,
    picFileID: picFileID.value,
    driverName: getUserProfile().nickname || ''
  })
  if (res?.code === 0) {
    const d = res.data || {}
    // 记录成功但没同步到车队时，必须当场说清楚，不能等司机事后发现"车队怎么没有这笔"
    if (d.syncToFleet === false) {
      Taro.showToast({
        title: '已记录 · 未同步车队（' + (d.reason || '未授权') + '）',
        icon: 'none',
        duration: 2600
      })
    } else {
      Taro.showToast({ title: '已记录 · 已汇入车队台账', icon: 'none', duration: 2000 })
    }
    form.value.amount = ''
    form.value.note = ''
    picPath.value = ''
    picFileID.value = ''
    picTip.value = ''
    load()
  }
}
</script>

<style>
.sum { display: flex; justify-content: space-around; }
.sum-col { display: flex; flex-direction: column; align-items: center; }
.sum-label { font-size: 24rpx; color: var(--ns-sub); }
.sum-num { font-size: 44rpx; font-weight: 700; color: #E24B4A; margin-top: 8rpx; }
.sum-sub { font-size: 36rpx; font-weight: 600; margin-top: 12rpx; }
.card-title { font-size: 30rpx; font-weight: 600; margin-bottom: 16rpx; }
.cats { display: flex; flex-wrap: wrap; gap: 14rpx; margin-bottom: 20rpx; }
.cat { display: flex; align-items: center; gap: 8rpx; padding: 10rpx 20rpx; border-radius: 28rpx; border: 1rpx solid #E5E6EB; font-size: 24rpx; color: var(--ns-sub); }
.cat.on { color: #fff; }
.cat.on .cat-dot { background: #fff !important; }
.cat-dot { width: 14rpx; height: 14rpx; border-radius: 50%; }
.form-row { display: flex; align-items: center; gap: 16rpx; padding: 12rpx 0; }
.form-label { font-size: 26rpx; color: var(--ns-sub); width: 84rpx; flex-shrink: 0; }
.form-input { flex: 1; padding: 14rpx 20rpx; background: #F7F8FA; border-radius: 12rpx; font-size: 28rpx; }
.ph { color: #C9CDD4; }
.pic-wrap { flex: 1; display: flex; align-items: center; gap: 16rpx; }
.pic-thumb { width: 96rpx; height: 96rpx; border-radius: 12rpx; flex-shrink: 0; background: #F2F3F5; }
.pic-btn { margin: 0; font-size: 24rpx; padding: 12rpx 24rpx; background: #FFF3EA; color: var(--ns-orange); border-radius: 12rpx; line-height: 1.4; }
.pic-tip { margin-top: 10rpx; padding: 12rpx 18rpx; border-radius: 12rpx; background: #FFF7F0; font-size: 23rpx; color: #C2551F; line-height: 1.5; }
.hint-line { margin-top: 10rpx; padding: 0 4rpx; font-size: 22rpx; color: #9AA0A6; line-height: 1.6; }
.save-btn { margin: 24rpx 0 0; }
.cost-row { display: flex; justify-content: space-between; align-items: center; padding: 18rpx 0; border-bottom: 1rpx solid #F2F3F5; }
.cost-row:last-child { border-bottom: none; }
.cost-left { display: flex; align-items: center; gap: 16rpx; }
.cost-dot { width: 16rpx; height: 16rpx; border-radius: 50%; flex-shrink: 0; }
.cost-info { display: flex; flex-direction: column; gap: 4rpx; }
.cost-cat { font-size: 28rpx; font-weight: 600; }
.pic-tag { font-size: 20rpx; color: var(--ns-orange); font-weight: 400; }
.cost-note { font-size: 22rpx; color: var(--ns-sub); }
.cost-amt { font-size: 30rpx; font-weight: 700; color: #E24B4A; flex-shrink: 0; }
</style>
