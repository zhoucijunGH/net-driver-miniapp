/**
 * initDb —— 云环境一次性初始化：批量建集合
 *
 * 为什么要有这个函数：
 *   本次联调走「微信云开发」，它没有 tcb CLI 的入口，也连不上腾讯云那份脚本，
 *   12 个集合要在控制台手点，既容易漏也容易把权限点错。
 *   所以把"建集合"做成一次性云函数，部署后在开发者工具里 call 一次即可。
 *
 * 使用步骤：
 *   1. 把这个文件夹整体部署到环境（上传并部署 → 云端安装依赖）
 *   2. 云开发控制台 → 云函数 → initDb → 云端测试，参数填 {} 或 { "action": "createAll" }
 *   3. 返回里 12 个全部 ok 之后，**把 initDb 从已部署函数里删掉**
 *      （它没有鉴权、且属于初始化特权操作，绝对不能留到生产环境）
 *
 * 它刻意不做的事：
 *   - 不灌任何测试数据（空集合就是空集合，不让演示数据污染真账）
 *   - 不建索引（SDK 没有 createIndex 接口；且小数据量联调阶段索引无关紧要，
 *     正式上量前按 database/indexes.md 在控制台建）
 *   - 不改安全规则（安全规则必须人确认，代码擅自放宽是红线）
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 与 database/README.md 完全一致的 12 个集合，用途注释同步写在这里，避免两边走偏
const COLLECTIONS = [
  { name: 'users', why: '用户主档（openid / 会员到期）' },
  { name: 'bills', why: '账单流水（含 month 冗余字段，用于月度汇总）' },
  { name: 'costs', why: '成本台账（含 syncToFleet，车队同步的唯一开关）' },
  { name: 'contracts', why: '租车合同（押金 / 月租 / 起止日期）' },
  { name: 'certs', why: '证件台账（到期日驱动首页待办横幅）' },
  { name: 'violations', why: '违章记录' },
  { name: 'companies', why: 'B 端租车公司（含管理员白名单）' },
  { name: 'fleet_sync_task', why: '车队同步任务留痕' },
  { name: 'driver_consent', why: '司机同意记录（个保法要求的同意/撤销留痕）' },
  { name: 'subscriptions', why: '订阅消息剩余额度' },
  { name: 'ocr_usage', why: '拍照识别每日配额' },
  { name: 'ocr_cache', why: '票据 OCR 结果缓存（按文件 ID 去重）' }
]

/**
 * 单个集合创建：已存在不能算失败
 * wx-server-sdk 没有 exists 判断接口，只能尝试创建再吞掉"已存在"错误；
 * 因此这里把错误原文回传，便于人工区分"已存在"和真正的权限/网络问题
 */
async function ensure(name) {
  try {
    await db.createCollection(name)
    return { name, ok: true, status: 'created' }
  } catch (e) {
    const msg = String((e && (e.message || e.errMsg)) || e)
    // 已存在：不同 SDK 版本措辞不一致，统一按包含 already / exist 判定
    if (/already|exist|已存在/i.test(msg)) {
      return { name, ok: true, status: 'exists' }
    }
    return { name, ok: false, status: 'failed', msg: msg.slice(0, 160) }
  }
}

exports.main = async (event) => {
  const action = (event && event.action) || 'createAll'

  if (action !== 'createAll') {
    return {
      code: -1,
      msg: `不支持的 action：${action}。本函数只提供 createAll（用完即删）`
    }
  }

  const results = []
  // 串行执行：建集合是低频运维动作，没必要并发，串行还能避免触发同一批资源的限流
  for (const item of COLLECTIONS) {
    const r = await ensure(item.name)
    results.push(Object.assign({ why: item.why }, r))
  }

  const failed = results.filter((r) => !r.ok)
  return {
    code: failed.length ? 1 : 0,
    total: COLLECTIONS.length,
    created: results.filter((r) => r.status === 'created').length,
    existed: results.filter((r) => r.status === 'exists').length,
    failed: failed.length,
    results,
    next: failed.length
      ? '有集合创建失败，多半是环境还在初始化，等 1 分钟重试一次'
      : '12 个集合就绪 → 记得把 initDb 这个函数删掉，再按 database/indexes.md 手动建 9 个索引'
  }
}
