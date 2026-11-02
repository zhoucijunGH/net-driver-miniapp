/**
 * 传输层
 *
 * 职责：把「调用哪个接口」翻译成「怎么发出去」。业务代码永远不接触这一层。
 *
 * 三种模式由 config.API_MODE 决定，切换后端就是改那一个常量：
 *   mock  → 本地假数据
 *   http  → HTTP 请求到 API_BASE
 *   cloud → 微信云函数
 *
 * 无论哪种模式，对上层的返回口径完全一致：{ code, msg, data }
 */
import Taro from '@tarojs/taro'
import { API_BASE, API_MODE, API_TIMEOUT, DEBUG_OPENID } from '../utils/config'
import { CONTRACT } from './contract'
import { getMock } from '../utils/mock'

/* ---------------------------------------------------------------------------
 * 读缓存（默认 60 秒）
 *
 * 为什么加：司机在赶路间隙会反复进出首页/账单页，这些是最热的接口。
 * 每次打开都重新查一遍，既慢又占后端资源；缓存 60 秒能砍掉三到四成重复请求。
 *
 * 为什么敢加：写操作（记一笔 / 导入账单 / 车队同步 / 授权变更）执行后会立刻清空缓存，
 * 所以「刚记完账却看不到」不会发生。
 *
 * 三条纪律：
 *   1. 只缓存读接口（契约里标了 read: true 的），写接口永远实时
 *   2. 失败结果不缓存，否则一次网络抖动会被记住 60 秒
 *   3. Mock 模式不走缓存——syncFleet 每次都产生新数据，缓存会让演示看起来"拉了没反应"
 * ------------------------------------------------------------------------- */
const CACHE_TTL = 60 * 1000

const cache = new Map() //    key -> { at: number, value: any }
const inflight = new Map() //  key -> Promise（同一 key 并发时复用同一次请求，不做两次调用）

/** 稳定 key：参数顺序不同也算同一个请求 */
function cacheKey(name, params) {
  const p = params || {}
  return Object.keys(p).sort().reduce((s, k) => `${s}&${k}=${JSON.stringify(p[k])}`, name)
}

/** 清空全部读缓存（写操作成功后、切换账号时调用） */
export function clearCache() {
  cache.clear()
}

/** 当前缓存条目数，便于开发期观察命中情况 */
export function cacheSize() {
  return cache.size
}

/* ---------------------------------------------------------------------------
 * 鉴权
 *
 * 生产标准做法应该是：wx.login 拿 code → 后端用 appid+secret 换 session → 返回自有的
 * 短期令牌 → 前端每次请求带上。这样才不会把用户身份暴露在前端可被伪造的请求里。
 *
 * 现在后端还没有自己的登录体系，所以先用 DEBUG_OPENID 占位：服务端信任这个头。
 * ⚠️ 这是开发期的临时做法，等价于「谁都能伪造身份」，上线前必须换成上面那套。
 * ------------------------------------------------------------------------- */
function buildAuthHeader() {
  const header = { 'content-type': 'application/json' }
  if (DEBUG_OPENID) header['x-openid'] = DEBUG_OPENID
  // TODO(上线前): 换成 Authorization: `Bearer ${token}`，token 由 /api/auth/login 下发
  return header
}

/* ---------------------------------------------------------------------------
 * 三种模式的实际发送
 * ------------------------------------------------------------------------- */

/** mock：读本地假数据，附带一点延迟让 loading 态更真实 */
async function sendMock(key, params) {
  const spec = CONTRACT[key]
  await new Promise((r) => setTimeout(r, 200))
  return getMock(spec.fn, spec.event(params))
}

/** http：请求 REST 接口。URL 全部来自 contract.path，集中可查 */
async function sendHttp(key, params) {
  const spec = CONTRACT[key]
  const res = await Taro.request({
    url: `${API_BASE}${spec.path}`,
    // GET 用 query，其余走 body。用错地方的话 Taro 在某些安卓机型上会静默丢参数
    method: spec.method,
    data: spec.method === 'GET' ? undefined : params,
    header: buildAuthHeader(),
    dataType: 'json',
    timeout: API_TIMEOUT
  })

  // HTTP 层错误（超时、DNS、证书、后端 5xx）
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const err = new Error(`HTTP ${res.statusCode}`)
    err.httpStatus = res.statusCode
    throw err
  }
  return res.data
}

/** cloud：微信云函数。注意入参要经过 spec.event 翻译 */
async function sendCloud(key, params) {
  const spec = CONTRACT[key]
  const res = await Taro.cloud.callFunction({
    name: spec.fn,
    data: spec.event(params)
  })
  return res.result
}

const SENDERS = { mock: sendMock, http: sendHttp, cloud: sendCloud }

/* ---------------------------------------------------------------------------
 * 对外主入口
 * ------------------------------------------------------------------------- */

/**
 * 调用一个接口
 * @param {keyof typeof CONTRACT} key  契约里的接口名
 * @param {object} [params] 业务参数（语义化，与传输方式无关）
 * @param {{ noCache?: boolean, cacheMs?: number, silent?: boolean }} [opts]
 *        noCache 跳过缓存；cacheMs 自定义有效期；silent 为 true 时不弹错误 toast（页面自行处理）
 * @returns {Promise<{code: number, msg?: string, data?: any}>}
 */
export async function request(key, params = {}, opts = {}) {
  const spec = CONTRACT[key]
  if (!spec) throw new Error(`未定义的接口：${key}`)

  const send = SENDERS[API_MODE]
  if (!send) throw new Error(`未知的 API_MODE：${API_MODE}`)

  // Mock 不走缓存，理由见上方缓存注释第 3 条
  const canCache = API_MODE !== 'mock' && spec.read === true && !opts.noCache
  const ttl = opts.cacheMs == null ? CACHE_TTL : opts.cacheMs
  const ck = cacheKey(key, params)

  if (canCache) {
    const hit = cache.get(ck)
    if (hit && Date.now() - hit.at < ttl) return hit.value
    if (inflight.has(ck)) return inflight.get(ck)
  }

  const task = send(key, params)

  if (canCache) inflight.set(ck, task)

  try {
    const result = await task
    if (canCache) cache.set(ck, { at: Date.now(), value: result })

    // 写操作落地后清掉读缓存，保证下一屏看到最新数据
    if (spec.read !== true) clearCache()

    return result
  } catch (err) {
    console.error(`[接口 ${spec.label || key}] 调用失败:`, err)
    if (!opts.silent) {
      const httpCode = err && err.httpStatus
      Taro.showToast({
        title: httpCode ? `服务异常（${httpCode}）` : '网络开小差了，稍后再试',
        icon: 'none'
      })
    }
    throw err
  } finally {
    inflight.delete(ck)
  }
}

/**
 * 带默认值的便捷读取：接口失败时返回 fallback 而不抛错。
 * 用于「页面要渲染但数据拿不到也不能白屏」的场景，比如首页的统计卡。
 */
export async function requestQuiet(key, params = {}, fallback = null, opts = {}) {
  try {
    const res = await request(key, params, { ...opts, silent: true })
    if (res && res.code === 0) return res.data
    return fallback
  } catch (e) {
    return fallback
  }
}
