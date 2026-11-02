<template>
  <view class="page">
    <view class="doc">
      <view class="doc-title">净司机用户协议</view>
      <view class="doc-update">最近更新日期：2026-10-29</view>

      <view v-for="(sec, i) in sections" :key="i" class="sec">
        <view class="sec-title">{{ sec.t }}</view>
        <view v-for="(p, j) in sec.ps" :key="j" class="sec-p">{{ p }}</view>
      </view>

      <view class="contact">
        运营主体：广西邕州数智科技有限公司
        <br>本协议与《净司机隐私政策》共同构成你使用本产品的约定。
      </view>
    </view>
  </view>
</template>

<script setup>
const sections = [
  {
    t: '一、服务说明',
    ps: [
      '净司机是一款面向网约车司机的"出车管家"工具，帮助你汇总多平台账单、核算净收益与净时薪、记录成本并生成合规台账。',
      '本产品为付费订阅制（当前主推 ¥9.9/月，年付 ¥99），部分基础功能可免费使用。'
    ]
  },
  {
    t: '二、账号与资料',
    ps: [
      '你需对账号下的所有行为负责。请勿将账号转让或出借他人。',
      '你提供的头像、昵称等资料须真实、合法，不得冒用他人身份。'
    ]
  },
  {
    t: '三、数据来源与准确性',
    ps: [
      '账单数据由你手动导入或经你授权后由车队同步而来。我们尽力保证核算准确，但数据准确性依赖于你导入的源头文件；',
      '本产品展示的净收益、净时薪等均为基于你数据的计算结果，不构成任何投资、税务或法律建议。'
    ]
  },
  {
    t: '四、付费与退订',
    ps: [
      '订阅在你主动购买后生效。会员权益自开通起按周期计算，已支付的当期费用一般不予退还；',
      '你可随时在"会员中心"取消自动续费，取消后当前周期内仍可正常使用，到期后不再续扣。'
    ]
  },
  {
    t: '五、车队数据同步',
    ps: [
      '开启"车队数据同步"即表示你同意按授权范围将相关数据在"你—车队"之间双向同步；',
      '你可随时在"我的"中撤销该授权，撤销后双向同步立即终止，已同步的历史数据按隐私政策处理。'
    ]
  },
  {
    t: '六、责任限制',
    ps: [
      '在法律法规允许的最大范围内，我们对因网络、设备、第三方平台接口变更等不可抗力导致的服务中断或数据延误不承担责任；',
      '你因使用本产品作出的任何经营或财务决策，风险由你自行承担。'
    ]
  },
  {
    t: '七、协议变更与终止',
    ps: [
      '我们可能根据业务与法规变化调整本协议，重大变更将提前公告；',
      '若你严重违反本协议，我们可暂停或终止对你的服务，并依隐私政策处理你的数据。'
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
