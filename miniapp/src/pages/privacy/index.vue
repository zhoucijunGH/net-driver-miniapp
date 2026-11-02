<template>
  <view class="page">
    <view class="doc">
      <view class="doc-title">净司机隐私政策</view>
      <view class="doc-update">最近更新日期：2026-10-29</view>

      <view v-for="(sec, i) in sections" :key="i" class="sec">
        <view class="sec-title">{{ sec.t }}</view>
        <view v-for="(p, j) in sec.ps" :key="j" class="sec-p">{{ p }}</view>
      </view>

      <view class="contact">
        如你对本政策有任何疑问，可联系：广西邕州数智科技有限公司
        <br>邮箱：privacy@jingsiji.cn（示例，备案前替换为真实受理邮箱）
      </view>
    </view>
  </view>
</template>

<script setup>
const sections = [
  {
    t: '一、我们如何收集你的信息',
    ps: [
      '1. 账单数据：你通过微信会话手动导入的账单 CSV 文件，以及你拍照/选图留存的成本凭证图片。我们仅在本地解析与展示，不会上传原始凭证图片到第三方。',
      '2. 识别信息：为生成头像与昵称，我们使用微信提供的头像与昵称能力（由你主动选择填入）。',
      '3. 车队同步数据：在你明确授权后，租车公司通过平台开放接口推送的账单数据会同步至你的账户，用于生成净时薪与合规台账。',
      '4. 设备与日志：为排查故障与保障安全，我们会记录必要的设备型号、系统版本与操作日志，不含可单独识别自然人的敏感内容。'
    ]
  },
  {
    t: '二、我们如何使用你的信息',
    ps: [
      '· 计算并展示你的净收益、净时薪、成本占比与合规台账；',
      '· 在你授权的前提下，将你记录的成本账同步给所属车队后台用于成本核算；',
      '· 向你推送会员服务、版本更新与必要的系统通知。'
    ]
  },
  {
    t: '三、信息的存储与保护',
    ps: [
      '你的账单与成本数据存储在微信云开发（或同等合规云服务）中，按"仅创建者可读写"的最小权限隔离。',
      '我们采用传输加密与访问隔离等措施保护你的数据，但请理解任何互联网传输都无法保证 100% 安全。'
    ]
  },
  {
    t: '四、信息的共享',
    ps: [
      '除以下情形外，我们不会向第三方共享你的个人信息：',
      '· 你已就"车队数据同步"明确授权，相关数据按授权范围同步给对应租车公司；',
      '· 法律法规要求或为保护你及他人重大合法权益所必需。'
    ]
  },
  {
    t: '五、你的权利',
    ps: [
      '你有权随时查阅、更正你的数据；可在"我的"中撤销车队同步授权（撤销后双向同步立即停止）；',
      '你可随时注销账号，注销将删除你的全部账单、成本与台账数据且不可恢复；',
      '如需行使上述权利或撤回同意，可通过本页底部联系方式与我们联系。'
    ]
  },
  {
    t: '六、未成年人保护',
    ps: [
      '本产品主要面向成年网约车司机。我们不建议未成年人使用；若发现误注册，我们将依申请删除其数据。'
    ]
  },
  {
    t: '七、政策的更新',
    ps: [
      '我们可能不时更新本政策。重大变更将通过小程序内公告或推送告知；你继续使用即视为接受更新后的内容。'
    ]
  }
]
</script>

<style>
.page { background: #F7F8FA; min-height: 100vh; padding: 24rpx; box-sizing: border-box; }
.doc { background: #fff; border-radius: 20rpx; padding: 40rpx 32rpx; }
.doc-title { font-size: 38rpx; font-weight: 700; color: #1D2129; text-align: center; }
.doc-update { font-size: 22rpx; color: #C9CDD4; text-align: center; margin: 12rpx 0 32rpx; }
.sec { margin-bottom: 32rpx; }
.sec-title { font-size: 30rpx; font-weight: 600; color: #FF7E33; margin-bottom: 14rpx; }
.sec-p { font-size: 26rpx; line-height: 1.8; color: #4E5969; margin-bottom: 10rpx; }
.contact { margin-top: 16rpx; padding: 24rpx; background: #FFF7EF; border-radius: 12rpx; font-size: 24rpx; line-height: 1.7; color: #4E5969; }
</style>
