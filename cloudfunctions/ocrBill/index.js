/**
 * ocrBill —— 票据 / 账单截图 OCR，把关键信息结构化成"可以填进输入框"的字段
 * 触发：C 端「记一笔 → 拍照识别账单」
 * 入参：{ fileID }（图片已在云存储）
 * 出参：{ code: 0, data: { amount, category, date, merchant, note, confidence, rawText } }
 *
 * 识别通道（自动降级，谁通用谁上）：
 *   ① 腾讯云 OCR · 通用印刷体（GeneralBasicOCR）—— 需在云函数环境变量配
 *      TENCENT_SECRET_ID / TENCENT_SECRET_KEY，可选项 OCR_REGION（默认 ap-guangzhou）
 *   ② 微信云调用 OCR（cloud.openapi.ocr.printedText）—— 需在小程序后台开通 OCR 能力，免密钥
 *   两条都不通时返回明确提示，前端自动回落到"手动填写"，不会卡住用户。
 *
 * 成本与安全（上线前必须有的三件套，已内置）：
 *   · 配额：每用户每日 OCR_DAILY_LIMIT 次（集合 ocr_usage），防恶意刷接口
 *   · 缓存：同一张图（fileID 的 md5）识别过就复用（集合 ocr_cache），重复点击不再花钱
 *   · 体积：超过 7MB 直接拒（OCR 接口 base64 上限），提示重拍
 * 两个集合若未创建也不会让识别失败（读写异常被吞掉，只影响配额/缓存能力）。
 */
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const OCR_DAILY_LIMIT = 20                       // 每用户每日识别上限
const MAX_IMAGE_BYTES = 7 * 1024 * 1024          // 单图上限，OCR 接口 base64 超限会直接报错

exports.main = async (event) => {
  const { fileID } = event
  const { OPENID } = cloud.getWXContext()
  if (!fileID) return { code: -1, msg: '请先拍照或选择票据图片' }

  // ① 命中缓存：同一张图不重复调用 OCR（也绕开配额）
  const cacheId = md5(fileID)
  const cached = await readDoc('ocr_cache', cacheId)
  if (cached && cached.result) return { code: 0, data: { ...cached.result, cached: true } }

  // ② 每日配额：先扣后用，避免并发刷量
  const day = beijingDay()
  const usageId = `${OPENID || 'anon'}_${day}`
  const usage = await readDoc('ocr_usage', usageId)
  const used = (usage && usage.count) || 0
  if (used >= OCR_DAILY_LIMIT) {
    return { code: -1, msg: `今天拍照识别已达 ${OCR_DAILY_LIMIT} 次上限，可手动填写或明天再试` }
  }
  await writeDoc('ocr_usage', usageId, { openid: OPENID || '', date: day, count: used + 1, updatedAt: Date.now() })

  // ③ 下载 + 体积校验（只下载一次，两条通道复用）
  let fileContent
  try {
    const dl = await cloud.downloadFile({ fileID })
    fileContent = dl.fileContent
  } catch (e) {
    return { code: -1, msg: '读取图片失败，请重新拍照' }
  }
  if (fileContent.length > MAX_IMAGE_BYTES) {
    return { code: -1, msg: '图片超过 7MB，请重拍（或用相册里的压缩图）' }
  }

  let lines = []
  let channel = ''
  try {
    lines = await ocrByTencentCloud(fileContent)
    channel = 'tencent'
  } catch (e) {
    try {
      lines = await ocrByWxOpenApi(fileID)
      channel = 'wxopenapi'
    } catch (e2) {
      console.error('[ocrBill] 通道①失败:', e.message, '通道②失败:', e2.message)
      return { code: -1, msg: 'OCR 服务未开通，请先配置腾讯云密钥或开通微信 OCR（可先手动填写）' }
    }
  }
  if (!lines.length) return { code: -1, msg: '图片里没识别到文字，请对准票据重拍' }

  const data = parseTicket(lines)
  if (!data.amount) return { code: -1, msg: '没认出金额，请重拍或手动填写' }
  data.channel = channel
  data.rawText = lines.slice(0, 40).map((l) => l.text).join('\n')

  // ④ 写缓存：下次同一张图直接返回
  await writeDoc('ocr_cache', cacheId, { fileID, result: data, createdAt: Date.now() })
  return { code: 0, data }
}

/* ---------------- 配额 / 缓存小工具 ---------------- */

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex')

/** 东八区当天日期 YYYY-MM-DD（云函数默认 UTC，配额要按司机本地日期算） */
function beijingDay() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

async function readDoc(coll, id) {
  try {
    const r = await db.collection(coll).doc(id).get()
    return r.data
  } catch (e) {
    return null // 集合或文档不存在（没建也不影响识别）
  }
}

async function writeDoc(coll, id, data) {
  try {
    await db.collection(coll).doc(id).set({ data })
  } catch (e) {
    console.warn(`[ocrBill] 写入 ${coll}/${id} 失败:`, e.message)
  }
}

/* ---------------- OCR 通道 ---------------- */

/** 通道①：腾讯云通用印刷体识别（手工 TC3 签名，不打包大 SDK，冷启动快） */
async function ocrByTencentCloud(fileContent) {
  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) throw new Error('未配置腾讯云密钥')

  const body = JSON.stringify({ ImageBase64: fileContent.toString('base64') })
  const res = await tc3Request({
    host: 'ocr.tencentcloudapi.com',
    service: 'ocr',
    action: 'GeneralBasicOCR',
    version: '2018-11-19',
    region: process.env.OCR_REGION || 'ap-guangzhou',
    body
  })
  const r = res.Response || {}
  if (r.Error) throw new Error(r.Error.Message || 'OCR 调用失败')
  return (r.TextDetections || []).map((t) => ({
    text: t.DetectedText || '',
    confidence: Number(t.Confidence || 0) / 100
  }))
}

/** 通道②：微信云调用 OCR（要求小程序后台已开通 OCR 权限） */
async function ocrByWxOpenApi(fileID) {
  const { fileList } = await cloud.getTempFileURL({ fileList: [fileID] })
  const url = fileList && fileList[0] && fileList[0].tempFileURL
  if (!url) throw new Error('获取图片临时地址失败')

  const res = await cloud.openapi.ocr.printedText({ type: 'photo', imgUrl: url })
  if (res.errCode && res.errCode !== 0) throw new Error('微信 OCR 返回 ' + res.errCode)
  return (res.items || []).map((i) => ({ text: i.text || '', confidence: 0.9 }))
}

/** 腾讯云 API 3.0 签名 + 请求 */
function tc3Request({ host, service, action, version, region, body }) {
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const contentType = 'application/json; charset=utf-8'
  const signedHeaders = 'content-type;host'
  const canonicalRequest = [
    'POST', '/', '',
    `content-type:${contentType}\nhost:${host}\n`,
    signedHeaders,
    sha256hex(body)
  ].join('\n')
  const scope = `${date}/${service}/tc3_request`
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, scope, sha256hex(canonicalRequest)].join('\n')

  const secretDate = hmac('TC3' + process.env.TENCENT_SECRET_KEY, date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = hmac(secretSigning, stringToSign).toString('hex')
  const authorization =
    `TC3-HMAC-SHA256 Credential=${process.env.TENCENT_SECRET_ID}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        method: 'POST',
        path: '/',
        headers: {
          Authorization: authorization,
          'Content-Type': contentType,
          Host: host,
          'X-TC-Action': action,
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Version': version,
          'X-TC-Region': region,
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (resp) => {
        let buf = ''
        resp.on('data', (c) => (buf += c))
        resp.on('end', () => {
          try {
            resolve(JSON.parse(buf))
          } catch (e) {
            reject(new Error('OCR 返回内容解析失败'))
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex')
const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest()

/* ---------------- 字段归一化 ---------------- */

// 关键词 → 成本分类（与 C 端分类色板一致）
const CATE_RULES = [
  { cat: '充电', kw: ['充电', '特来电', '星星充电', '国家电网', '南方电网', '快充', '慢充', '度电', '电量', '充电桩'] },
  { cat: '加油', kw: ['加油', '中国石化', '石化', '中国石油', '石油', '92#', '95#', '柴油', '汽油', '油枪'] },
  { cat: '高速停车', kw: ['高速', '通行费', 'ETC', '收费站', '停车', '泊位', '路桥'] },
  { cat: '保养维修', kw: ['保养', '维修', '修理', '途虎', '4S', '换胎', '机油', '滤芯', '轮胎', '工时费'] },
  { cat: '罚单', kw: ['罚款', '违停', '违章', '交警', '交管', '处罚'] }
]
// 金额关键词：命中这些行，优先在该行取数
const AMT_KEYS = ['合计', '总计', '实收', '实付', '应付', '金额', '小计', '总额', '总价', '收费', '通行费', '停车费', '费用']
// 商户名线索
const MERCHANT_KW = ['公司', '站', '店', '石化', '石油', '途虎', '服务区', '充电', '停车']

function parseTicket(lines) {
  const allText = lines.map((l) => l.text).join(' ').replace(/\s+/g, '')
  const merchant = pickMerchant(lines)
  const amt = pickAmount(lines)
  const spec = pickSpec(lines)

  return {
    amount: amt.amount,
    category: pickCategory(allText),
    date: pickDate(lines),
    merchant,
    note: buildNote(merchant, spec),
    confidence: Math.round((amt.confidence || 0) * 100) / 100
  }
}

/** 备注：商户短名 + 油品/电量，控制在 30 字内（输入框一屏可读） */
function buildNote(merchant, spec) {
  const short = (merchant || '').replace(/(股份)?有限(责任)?公司.*$/, '').slice(0, 12)
  return [short, spec].filter(Boolean).join(' · ').slice(0, 30)
}

function pickAmount(lines) {
  const numRe = /\d{1,6}(?:\.\d{1,2})?/g
  // ① 关键词行取最后一个数字（"合计 ¥58.20"）
  for (const l of lines) {
    if (AMT_KEYS.some((k) => l.text.includes(k))) {
      const nums = (l.text.match(numRe) || []).map(Number).filter((n) => n > 0 && n < 100000)
      if (nums.length) return { amount: nums[nums.length - 1].toFixed(2), confidence: l.confidence }
    }
  }
  // ② 带货币符号的数字，取最大
  const withSymbol = []
  for (const l of lines) {
    const m = l.text.match(/[¥￥]\s*(\d{1,6}(?:\.\d{1,2})?)/)
    if (m) withSymbol.push({ v: Number(m[1]), c: l.confidence })
  }
  if (withSymbol.length) {
    withSymbol.sort((a, b) => b.v - a.v)
    return { amount: withSymbol[0].v.toFixed(2), confidence: withSymbol[0].c }
  }
  // ③ 兜底：两位小数里最大的（票据总额通常是全图最大数），置信度打折
  const all = []
  for (const l of lines) {
    ;(l.text.match(/\d{1,6}\.\d{2}/g) || []).forEach((v) => all.push({ v: Number(v), c: l.confidence }))
  }
  if (!all.length) return { amount: '', confidence: 0 }
  all.sort((a, b) => b.v - a.v)
  return { amount: all[0].v.toFixed(2), confidence: (all[0].c || 0.8) * 0.9 }
}

function pickDate(lines) {
  for (const l of lines) {
    const m = l.text.match(/(20\d{2})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/)
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
  }
  return ''
}

function pickMerchant(lines) {
  for (const l of lines) {
    const t = l.text.replace(/\s+/g, '')
    if (t.length >= 4 && MERCHANT_KW.some((k) => t.includes(k))) return t.slice(0, 20)
  }
  const first = lines.find((l) => l.text.trim().length >= 4)
  return first ? first.text.trim().slice(0, 20) : ''
}

/** 油品/电量/单号这类"能帮司机回忆"的补充信息 */
function pickSpec(lines) {
  for (const l of lines) {
    const t = l.text.replace(/\s+/g, ' ')
    if (/(92#|95#|98#|0#|柴油|电量|度数|度电|升|L\b)/.test(t)) return t.slice(0, 18)
  }
  return ''
}

function pickCategory(allText) {
  for (const r of CATE_RULES) {
    if (r.kw.some((k) => allText.includes(k))) return r.cat
  }
  return '其他'
}
