/**
 * 接口契约表
 *
 * 全站唯一的接口真源。每个接口声明三件事：
 *   path  —— REST 路径，供 HTTP 模式用（后端照此实现即可，换语言换数据库都不影响前端）
 *   fn    —— 云函数名，供 cloud 模式用（微信云开发的传统写法）
 *   event —— cloud 模式下的入参拼装（把语义化参数翻译成云函数 event）
 *
 * 为什么要抽这一层：
 * 以前业务页面直接写 callFunction('report', { type: 'home' })，15 处调用散落在 9 个页面里，
 * 后端一旦换实现要改 15 个地方。现在业务侧只认 `api.home()`，
 * 具体走 HTTP 还是云函数、路径叫什么，全在这张表里，改一处即可。
 *
 * read: true 表示读接口，会走 60 秒缓存（详见 transport.js）；写接口永远实时。
 */

export const CONTRACT = {
  /* ---------------- 报表 ---------------- */
  home: {
    label: '首页概览',
    method: 'POST',
    path: '/api/report/home',
    fn: 'report',
    event: (p) => ({ type: 'home', needFleet: p.needFleet !== false, month: p.month }),
    read: true
  },
  analysis: {
    label: '分析洞察',
    method: 'POST',
    path: '/api/report/analysis',
    fn: 'report',
    event: (p) => ({ type: 'analysis', month: p.month }),
    read: true
  },
  bills: {
    label: '账单列表',
    method: 'POST',
    path: '/api/report/bills',
    fn: 'report',
    event: () => ({ type: 'bills' }),
    read: true
  },
  costs: {
    label: '成本列表',
    method: 'POST',
    path: '/api/report/costs',
    fn: 'report',
    event: (p) => ({ type: 'costs', month: p.month }),
    read: true
  },
  ledger: {
    label: '合规台账',
    method: 'POST',
    path: '/api/report/ledger',
    fn: 'report',
    event: (p) => ({ type: 'ledger', tab: p.tab }),
    read: true
  },

  /* ---------------- 车队同步 ---------------- */
  syncFleet: {
    label: '车队数据同步',
    method: 'POST',
    path: '/api/fleet/sync',
    fn: 'syncFleet',
    event: () => ({})
  },

  /* ---------------- 授权与账号 ---------------- */
  qrResolve: {
    label: '扫码归因分流',
    method: 'POST',
    path: '/api/qr/resolve',
    fn: 'qr',
    event: (p) => ({ action: 'resolve', scene: p.scene })
  },
  consentGrant: {
    label: '授予车队同步授权',
    method: 'POST',
    path: '/api/consent/grant',
    fn: 'consent',
    event: (p) => ({ action: 'grant', scope: 'fleet_sync', fleetId: p.fleetId })
  },
  consentRevoke: {
    label: '撤销车队同步授权',
    method: 'POST',
    path: '/api/consent/revoke',
    fn: 'consent',
    event: () => ({ action: 'revoke' })
  },
  deleteAccount: {
    label: '注销账号',
    method: 'POST',
    path: '/api/account/delete',
    fn: 'consent',
    event: () => ({ action: 'deleteAccount' })
  },

  /* ---------------- 记账 ---------------- */
  addCost: {
    label: '记一笔成本',
    method: 'POST',
    path: '/api/costs',
    fn: 'addCost',
    event: (p) => ({
      amount: p.amount,
      category: p.category,
      note: p.note,
      date: p.date,
      hasPic: p.hasPic,
      picFileID: p.picFileID,
      driverName: p.driverName
    })
  },
  ocrBill: {
    label: '票据识别',
    method: 'POST',
    path: '/api/costs/ocr',
    fn: 'ocrBill',
    event: (p) => ({ fileID: p.fileID })
  },

  /* ---------------- 账单导入 ---------------- */
  importBills: {
    label: '导入平台账单',
    method: 'POST',
    path: '/api/bills/import',
    fn: 'parseBill',
    event: (p) => ({ fileID: p.fileID, platform: p.platform })
  },

  /* ---------------- 会员支付 ---------------- */
  payCreate: {
    label: '创建支付订单',
    method: 'POST',
    path: '/api/pay/create',
    fn: 'pay',
    event: (p) => ({ action: 'create', plan: p.plan })
  }
}

/** 后端需要实现的 REST 路径清单，方便对照开发/联调 */
export function listPaths() {
  return Object.entries(CONTRACT).map(([key, c]) => `${key.padEnd(14)} ${c.method.padEnd(5)} ${c.path}`)
}
