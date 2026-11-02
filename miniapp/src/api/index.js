/**
 * 业务接口出口
 *
 * 【用法】页面里只 import 这一个：
 *   import { api } from '../../api'
 *   const res = await api.home({ needFleet: true })
 *   if (res?.code === 0) { ... }
 *
 * 【规矩】
 *   1. 页面不许再出现 callFunction / Taro.request / 拼接 URL ——那些都在 contract 与 transport 里
 *   2. 方法参数用业务语义命名（fleetId、fileID、plan），不要出现 type / action 这种传输字眼
 *   3. 新增接口：在 contract.js 加一条，再在本文件补一个方法
 *
 * 【换后端要做什么】什么都不用做，改 utils/config.js 的 API_MODE 与 API_BASE 即可。
 */
import { request, requestQuiet, clearCache, cacheSize } from './transport'

export const api = {
  /* ---------------- 报表 ---------------- */

  /** 首页概览：净收益、净时薪、车队授权状态、待办横幅 */
  home: (params = {}, opts) => request('home', params, opts),

  /** 分析页：近 7 天走势、平台净时薪对比、成本构成、洞察文案 */
  analysis: (params = {}, opts) => request('analysis', params, opts),

  /** 账单流水列表 */
  bills: (opts) => request('bills', {}, opts),

  /** 成本列表（当月口径），返回 { monthTotal, items } */
  costs: (opts) => request('costs', {}, opts),

  /** 合规台账：证件 / 合同 / 违章，按 tab 过滤 */
  ledger: ({ tab } = {}, opts) => request('ledger', { tab }, opts),

  /* ---------------- 车队同步 ---------------- */

  /** 一键拉取各平台账单。返回 { added, platforms, lastSyncText, bills } */
  syncFleet: (opts) => request('syncFleet', {}, opts),

  /* ---------------- 授权与账号 ---------------- */

  /** 扫码归因分流：传 scene 原文，返回落地分支（车队欢迎页/价值页）所需数据 */
  qrResolve: ({ scene } = {}, opts) => request('qrResolve', { scene }, opts),

  /** 授予车队同步授权 */
  consentGrant: ({ fleetId } = {}, opts) => request('consentGrant', { fleetId }, opts),

  /** 撤销授权。撤销后 C 端与车队之间的双向同步立即停止 */
  consentRevoke: (opts) => request('consentRevoke', {}, opts),

  /** 注销账号，抹除本人全部数据 */
  deleteAccount: (opts) => request('deleteAccount', {}, opts),

  /* ---------------- 记账 ---------------- */

  /** 记一笔成本。返回 { syncToFleet } ——前端据此提示"已汇入车队台账" */
  addCost: (payload = {}, opts) => request('addCost', payload, opts),

  /** 票据识别（灰度中，OCR_AUTO_FILL 关时前端不会调用） */
  ocrBill: ({ fileID } = {}, opts) => request('ocrBill', { fileID }, opts),

  /* ---------------- 账单导入 ---------------- */

  /** 导入平台账单 CSV。返回 { count, failed, warn } */
  importBills: ({ fileID, platform } = {}, opts) => request('importBills', { fileID, platform }, opts),

  /* ---------------- 会员支付 ---------------- */

  /** 创建支付订单，返回唤起微信支付所需的 payment 参数 */
  payCreate: ({ plan } = {}, opts) => request('payCreate', { plan }, opts)
}

export { clearCache, cacheSize, requestQuiet }
export { listPaths } from './contract'
