// Mock 数据集：结构与云函数返回完全一致（{ code: 0, data }），切换真数据时页面无感
import { getFleetAuth } from './user'

const now = Date.now()

function daysLater(n) {
  const d = new Date(now + n * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 首页：概览 + 多平台余额 + 待办横幅 + 今日跑单曲线
const home = {
  code: 0,
  data: {
    summary: { netIncome: '6280.00', netHourly: '42.3', onlineHours: 198 },
    // 今日净收益（目标进度卡用，P0 补齐项②）
    today: { net: '186.50' },
    platforms: [
      { name: '滴滴', amount: '16320.16' },
      { name: '花小猪', amount: '2150.40' },
      { name: '高德', amount: '1290.50' },
      { name: 'T3', amount: '820.00' },
      { name: '曹操', amount: '645.20' },
      { name: '首汽', amount: '410.00' },
      { name: '享道', amount: '268.90' },
      { name: '如祺', amount: '156.00' }
    ],
    todoBanner: '证件到期提醒：网约车证还有 28 天',
    // 车队授权同步状态（B 端租车公司授权 → C 端司机可一键拉取）
    fleetSync: { authorized: true, fleetName: '南宁邕州租车 · 1 号车队', lastSyncText: '今天 08:30' },
    todayOrders: [
      { time: '8:00', count: 42 }, { time: '9:00', count: 51 }, { time: '10:00', count: 47 },
      { time: '11:00', count: 38 }, { time: '12:00', count: 55 }, { time: '13:00', count: 61 },
      { time: '14:00', count: 72 }, { time: '15:00', count: 68 }
    ]
  }
}

// 账单列表
const bills = {
  code: 0,
  data: [
    { _id: '1', date: daysLater(0), platform: '滴滴', gross: '86.50', net: '63.20', sourceType: 'manual' },
    { _id: '2', date: daysLater(-1), platform: '滴滴', gross: '142.00', net: '105.80', sourceType: 'manual' },
    { _id: '3', date: daysLater(-1), platform: 'T3', gross: '58.00', net: '44.00', sourceType: 'manual' },
    { _id: '4', date: daysLater(-2), platform: '高德', gross: '73.30', net: '58.10', sourceType: 'fleet' },
    { _id: '5', date: daysLater(-2), platform: '滴滴', gross: '95.00', net: '71.40', sourceType: 'fleet' },
    { _id: '6', date: daysLater(-2), platform: '花小猪', gross: '66.80', net: '52.30', sourceType: 'manual' },
    { _id: '7', date: daysLater(-3), platform: '花小猪', gross: '88.60', net: '69.50', sourceType: 'manual' },
    { _id: '8', date: daysLater(-3), platform: '曹操', gross: '61.20', net: '47.80', sourceType: 'fleet' },
    { _id: '9', date: daysLater(-3), platform: '首汽', gross: '79.00', net: '60.10', sourceType: 'manual' },
    { _id: '10', date: daysLater(-4), platform: '享道', gross: '54.60', net: '41.90', sourceType: 'manual' },
    { _id: '11', date: daysLater(-4), platform: '如祺', gross: '48.30', net: '37.20', sourceType: 'manual' },
    { _id: '12', date: daysLater(-4), platform: '高德', gross: '67.90', net: '52.40', sourceType: 'fleet' }
  ]
}

// 净时薪分析
const analysis = {
  code: 0,
  data: {
    trend: [38, 41, 39, 44, 42, 46, 42.3],
    compare: [
      { name: '滴滴', hourly: '45.2' },
      { name: '花小猪', hourly: '39.5' },
      { name: '高德', hourly: '38.1' },
      { name: 'T3', hourly: '41.0' },
      { name: '曹操', hourly: '36.8' },
      { name: '首汽', hourly: '40.2' },
      { name: '享道', hourly: '37.4' },
      { name: '如祺', hourly: '35.9' }
    ],
    costs: [
      { name: '车辆租金', amount: '3300', percent: 52 },
      { name: '充电费', amount: '1560', percent: 25 },
      { name: '空驶油耗', amount: '820', percent: 13 },
      { name: '其他', amount: '640', percent: 10 }
    ],
    insight: '你在 8 个平台中滴滴净时薪最高（¥45.2/时），比最低的如祺高 26%；花小猪单量多但单价偏低，建议优先接滴滴高峰时段预约单',
    // 周报对比（P0 补齐项③，report 云函数 type=weekly 的返回并入 analysis）
    weekly: {
      thisWeek: { net: '1620.50', hourly: '43.6', hours: 37 },
      lastWeek: { net: '1485.20', hourly: '40.8', hours: 36.5 }
    }
  }
}

// 合规台账
const ledger = {
  code: 0,
  data: [
    { _id: '1', name: '网约车运输证', dueDate: daysLater(28), status: 'soon' },
    { _id: '2', name: '驾驶证年审', dueDate: daysLater(12), status: 'soon' },
    { _id: '3', name: '车辆二保', dueDate: daysLater(-3), status: 'overdue' },
    { _id: '4', name: '押金退还', dueDate: daysLater(150), status: 'ok' },
    { _id: '5', name: '商业保险续保', dueDate: daysLater(90), status: 'ok' }
  ]
}

// 一键拉取（syncFleet 云函数 Mock）：每次拉取生成 3 条"车队同步"来源的新账单，
// 并真实插入 bills 数据 —— 账单页/下次进页都能看到列表增长，演示更可信
let syncSeq = 0
const syncPool = [
  { platform: '滴滴', gross: '128.40', net: '96.30' },
  { platform: '高德', gross: '76.90', net: '60.80' },
  { platform: 'T3', gross: '82.00', net: '63.50' },
  { platform: '曹操', gross: '94.60', net: '73.20' },
  { platform: '花小猪', gross: '58.30', net: '45.60' },
  { platform: '首汽', gross: '88.00', net: '68.40' }
]
function mockSyncFleet() {
  // 真实链路：syncFleet 会校验 driver_consent，撤销后拒绝同步。Mock 同口径，
  // 否则"撤销授权"就只是弹个提示、一点效果都没有。
  if (!getFleetAuth().granted) {
    return { code: -1, msg: '已撤销车队数据同步授权，请先在「我的」重新授权' }
  }
  const fresh = []
  for (let i = 0; i < 3; i++) {
    const p = syncPool[(syncSeq * 3 + i) % syncPool.length]
    const bill = { _id: 'sync-' + Date.now() + '-' + i, date: daysLater(0), ...p, sourceType: 'fleet' }
    bills.data.unshift(bill)
    fresh.push(bill)
  }
  syncSeq++
  const platforms = [...new Set(fresh.map((b) => b.platform))]
  return { code: 0, data: { added: fresh.length, platforms, lastSyncText: '刚刚', bills: fresh } }
}

// 成本记账（P0 补齐项①，costs 集合 / addCost 云函数的 Mock）
const costCats = ['充电', '加油', '高速停车', '保养维修', '罚单', '其他']
const costList = {
  code: 0,
  data: {
    monthTotal: '3180.00',
    items: [
      { _id: 'c1', date: daysLater(0), category: '充电', amount: '58.20', note: '下午快充 1 次', hasPic: false },
      { _id: 'c2', date: daysLater(-1), category: '高速停车', amount: '25.00', note: '机场高速往返', hasPic: true },
      { _id: 'c3', date: daysLater(-2), category: '充电', amount: '63.80', note: '', hasPic: false },
      { _id: 'c4', date: daysLater(-4), category: '保养维修', amount: '280.00', note: '常规保养 + 空调滤芯', hasPic: true },
      { _id: 'c5', date: daysLater(-6), category: '罚单', amount: '150.00', note: '违停贴条', hasPic: false },
      { _id: 'c6', date: daysLater(-8), category: '充电', amount: '55.60', note: '', hasPic: false }
    ]
  }
}

// 记一笔：真实插入列表头部（页面上立刻可见），与真云函数返回结构一致
function mockAddCost(data = {}) {
  // 与 addCost 云函数同口径：记账永远成功，syncToFleet 才决定要不要进车队台账
  const auth = getFleetAuth()
  const syncToFleet = !!auth.granted && !!auth.fleetId
  const item = {
    _id: 'cost-' + Date.now(),
    date: daysLater(0),
    category: costCats.includes(data.category) ? data.category : '其他',
    amount: String(data.amount || '0'),
    note: data.note || '',
    hasPic: !!data.hasPic,
    syncToFleet
  }
  costList.data.items.unshift(item)
  costList.data.monthTotal = (Number(costList.data.monthTotal) + Number(item.amount)).toFixed(2)
  return {
    code: 0,
    data: {
      ...item,
      syncToFleet,
      reason: syncToFleet ? '' : (auth.granted ? '已授权但未绑定车队' : '已撤销车队数据同步授权')
    }
  }
}

// 票据 OCR（拍照记账）：模拟"腾讯云通用印刷体识别 + 字段归一化"的结果。
// 注意：仅当 config.js 的 OCR_AUTO_FILL = true 时才会被调用；当前默认关闭，拍照只存凭证不填字段。
// 真实云函数 ocrBill 返回结构与此完全一致（amount/category/note/merchant/date/confidence）
const ocrSamples = [
  { amount: '58.20', category: '充电', merchant: '特来电新能源', note: '特来电 · 南宁东站充电站', confidence: 0.96 },
  { amount: '300.00', category: '加油', merchant: '中国石化', note: '中石化 · 92# 25.6L', confidence: 0.94 },
  { amount: '25.00', category: '高速停车', merchant: '广西交投', note: '机场高速 · 通行费', confidence: 0.88 },
  { amount: '280.00', category: '保养维修', merchant: '途虎养车', note: '常规保养 + 空调滤芯', confidence: 0.92 }
]
let ocrIdx = 0
function mockOcrBill() {
  const s = ocrSamples[ocrIdx++ % ocrSamples.length]
  return {
    code: 0,
    data: {
      ...s,
      date: daysLater(0),
      rawText: `${s.merchant}\n合计 ¥${s.amount}\n${daysLater(0)}`
    }
  }
}

// 按云函数名 + 参数路由 mock
export function getMock(name, data = {}) {
  if (name === 'report') {
    if (data.type === 'home') return home
    if (data.type === 'bills') return bills
    if (data.type === 'analysis') return analysis
    if (data.type === 'ledger') return ledger
    if (data.type === 'costs') return costList
  }
  if (name === 'addCost') return mockAddCost(data)
  if (name === 'ocrBill') return mockOcrBill()
  if (name === 'syncFleet') return mockSyncFleet()
  if (name === 'parseBill') return { code: 0, data: { count: 5 } }
  if (name === 'pay') return { code: 0, data: { payment: {} } }
  if (name === 'consent') return { code: 0 }
  return { code: 0, data: {} }
}
