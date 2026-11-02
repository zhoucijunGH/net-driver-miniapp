/**
 * 全局配置
 *
 * 这里只放「环境相关的开关」，业务代码不应该直接读这里的东西做判断——
 * 业务侧一律走 src/api/index.js，换后端时只改本文件的 API_MODE / API_BASE，其它地方零改动。
 */

/**
 * 数据接入模式（三选一）
 *
 *  'mock'  假数据。不依赖任何后端，改 UI 最快，但数据不持久化
 *  'http'  HTTP 接口。地址由 API_BASE 决定，**生产就用这个**
 *         —— 后端是 Node / Java / Python、数据库是 MySQL / PG / MongoDB，前端统统不用管
 *  'cloud' 微信云函数 wx.cloud.callFunction。绑死微信生态，好处是不占域名配额
 *
 * ⚠️ http 模式的真机约束：微信小程序要求 request 目标必须是 **HTTPS + 已备案域名**，
 *    且要在小程序后台「开发 → 开发设置 → 服务器域名」里配成 request 合法域名。
 *    开发者工具可勾「不校验合法域名」绕过，但**正式发布上线绕不过**。
 *    当前 api.jingsiji.cn 尚未备案也未解析，属占位。
 * 当前状态：与 B 端共用本地网关 code/server（127.0.0.1:3001，数据落本机 MySQL），
 * 演示身份 DEBUG_OPENID=driver_demo_001（C 端演示司机，与 B 端 fleet_ 前缀隔离）。
 */
export const API_MODE = 'http'

/**
 * HTTP 模式的后端根地址
 *   开发期：'http://127.0.0.1:3001'（本地网关 code/server，数据落本机 MySQL）
 *   生产期：'https://api.jingsiji.cn'（备案通过后）
 * 只改这一行就能切换后端，前端其它代码不动。
 */
export const API_BASE = 'http://127.0.0.1:3001'

/** 请求超时（毫秒）。司机的网络环境差，10 秒是经验值：短了容易误报失败，长了用户等不住 */
export const API_TIMEOUT = 10 * 1000

/**
 * cloud 模式使用的云环境 ID
 * 这是「微信云开发」免费体验版环境。它在小程序后台显示的应用名是「发礼通」，
 * 但 AppID 就是本项目这个 YOUR_APPID（见 project.config.json）——同一个账号，
 * 可直接复用，不必再开（2026-10-28 截图核对确认）。
 * ⚠️ 同一 AppID 只送一个免费体验版环境，再点「开通」就是新购套餐（¥19.9/月起）。
 */
export const CLOUD_ENV = 'cloud1-d0g4yd5q68a20350c'

/**
 * 开发期身份占位。
 * 真机上 OPENID 由微信注入；本地网关拿不到微信身份，用这个假 openid 顶替以便调试。
 * ⚠️ 生产必删：正式鉴权要走 wx.login → code → 后端换取自有登录态，见 src/api/auth.js
 */
export const DEBUG_OPENID = 'driver_demo_001'

/** 订阅消息模板 ID（旧礼发通的模板不可跨小程序复用，需在净司机名下重新申请） */
export const SUBSCRIBE_TMPL_ID = 'TODO_净司机新模板ID'

/**
 * 拍照识别账单开关（灰度）
 *   false：拍照只做凭证留存，不填任何字段 —— 当前就是这个状态，避免识别不准带来错误账目
 *   true ：走 ocrBill 自动识别金额/分类/备注并回填（需先配好密钥，且通过 MVP 清单 §11.4 验收：
 *          金额准确率 ≥90%、分类 ≥85%，才建议打开）
 */
export const OCR_AUTO_FILL = false
