/**
 * cloudbase_auth —— 仅在「环境共享」方案下才需要
 *
 * 什么时候用：
 *   当净司机自己的 AppID 名下开不出免费环境，只能借用你另一个小程序的免费环境时。
 *   官方文档要求：调用方执行 cloud.init() 的过程中，会先调用资源方环境下的这个函数；
 *   它不存在就直接报「找不到对应的 FunctionName」，共享链路根本建不起来。
 *
 *   如果净司机最终用的是自己名下独立的环境，**删掉这个文件夹**，完全用不到它。
 *
 * 部署位置：
 *   部署到「资源方」那个小程序的环境里（谁拥有环境就部署到谁那儿），不是净司机这边。
 *
 * 返回协议（官方要求的字段名，大小写不能写错）：
 *   errCode  number  必填，0 表示放行，非 0 表示拒绝，会原样透传给调用方
 *   errMsg   string  可选，errCode 非 0 时的原因
 *   auth     string  可选，但必须是序列化后的字符串，可在安全规则里用 auth.custom 读取
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 只允许净司机这个 AppID 借用资源，别的哪怕同主体也一律拒绝
const ALLOW_FROM_APPID = 'YOUR_APPID'

exports.main = async (event) => {
  const ctx = cloud.getWXContext()

  // 跨账号共享时，标识调用来源的是 FROM_* 这一组字段，不是 OPENID / APPID
  const fromAppId = ctx.FROM_APPID
  const fromOpenId = ctx.FROM_OPENID

  console.log('[cloudbase_auth] 来源 AppID:', fromAppId, '来源 OPENID:', fromOpenId)

  if (fromAppId && fromAppId !== ALLOW_FROM_APPID) {
    return { errCode: -1, errMsg: `未授权的调用方：${fromAppId}` }
  }

  return {
    errCode: 0,
    errMsg: '',
    auth: JSON.stringify({ fromAppId })
  }
}
