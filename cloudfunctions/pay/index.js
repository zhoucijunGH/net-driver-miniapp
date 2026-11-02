/**
 * pay —— 微信支付下单与回调
 * 前置：广西邕州数智科技有限公司 商户号已开通并绑定小程序
 * 套餐：month=9.9 分单位 990 / year=99 分单位 9900
 * 回调：微信支付 v3 回调需验签，这里预留 handleCallback
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// TODO: 商户号参数（商户号 / 商户 API v3 密钥 / 证书序列号）配置在云函数环境变量，勿硬编码
const PLANS = { month: 990, year: 9900 }

exports.main = async (event) => {
  const { action, plan } = event
  const { OPENID } = cloud.getWXContext()

  if (action === 'create') {
    if (!PLANS[plan]) return { code: -1, msg: '未知套餐' }
    // TODO: 调微信支付 v3 统一下单（JSAPI）→ 返回 payment 五件套给前端 requestPayment
    // const payment = await cloud.cloudPay.unifiedOrder({...})  // 或直连 v3 API
    return { code: 0, data: { payment: { /* timeStamp, nonceStr, package, signType, paySign */ } } }
  }

  if (action === 'callback') {
    // TODO: 验签 → 写 members 集合（openid, plan, expireAt）→ 返回成功应答
    return { code: 0 }
  }

  return { code: -1, msg: '未知 action' }
}
