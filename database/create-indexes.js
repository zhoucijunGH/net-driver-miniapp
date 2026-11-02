/**
 * 一键创建网约车司机出车管家所需的全部索引
 *
 * 前置条件（只需一次）：
 *   npm i -g @cloudbase/cli
 *   tcb login                    // 浏览器授权（推荐）或 tcb login --key 用密钥
 *   tcb env use <你的环境ID>      // 例如 cloud1-xxxxxxxxxxxx
 *
 * 运行：
 *   node create-indexes.js                          // 已用 tcb env use 设过默认环境
 *   node create-indexes.js --env-id cloud1-xxx      // 显式指定环境（CI / 多环境场景）
 *
 * 为什么必须做这一步：没有索引时数据库会全集合扫描，
 * 而基础套餐的同时连接数只有 20，一个慢查询就能占掉一个配额，
 * 高峰期会连锁拖慢所有人——这是容量问题里性价比最高的一件-date事。
 */
const { spawnSync } = require('child_process')

// 环境 ID：未传 --env-id / -e 时依赖 tcb 的全局默认环境
const argv = process.argv.slice(2)
let envId = ''
const ei = argv.findIndex((a) => a === '--env-id' || a === '-e')
if (ei >= 0 && argv[ei + 1]) envId = argv[ei + 1]

// 索引清单：与 report / parseBill / addCost / fleetCosts 的实际查询路径一一对应
const INDEXES = [
  {
    coll: 'bills',
    why: '按月汇总、车队流水占比（最高频）',
    keys: [{ month: 1 }, { openid: 1 }],
    name: 'idx_bill_month_openid'
  },
  {
    coll: 'bills',
    why: '近 30 天 / 本周对比范围查询（report 的 date >= from）',
    keys: [{ openid: 1 }, { date: 1 }],
    name: 'idx_bill_openid_date'
  },
  {
    coll: 'bills',
    why: '账单列表分页（openid + createdAt 倒序）',
    keys: [{ openid: 1 }, { createdAt: -1 }],
    name: 'idx_bill_openid_createdAt'
  },
  {
    coll: 'costs',
    why: '月度成本汇总、C 端成本列表',
    keys: [{ openid: 1 }, { month: 1 }],
    name: 'idx_cost_openid_month'
  },
  {
    coll: 'costs',
    why: 'analysis 按天汇总成本的日期范围查询',
    keys: [{ openid: 1 }, { date: 1 }],
    name: 'idx_cost_openid_date'
  },
  {
    coll: 'costs',
    why: '车队台账聚合的成本侧过滤（fleetCosts）',
    keys: [{ fleetId: 1 }, { month: 1 }, { syncToFleet: 1 }],
    name: 'idx_cost_fleet_month_sync'
  },
  {
    coll: 'certs',
    why: '证件到期排序取最紧急（首页待办横幅）',
    keys: [{ openid: 1 }, { dueDate: 1 }],
    name: 'idx_cert_openid_due'
  },
  {
    coll: 'driver_consent',
    why: '写路径热查询：每次记账都要判授权态',
    keys: [{ openid: 1 }],
    name: 'idx_consent_openid'
  },
  {
    coll: 'companies',
    why: 'B 端鉴权取管理员白名单',
    keys: [{ fleetId: 1 }],
    name: 'idx_company_fleetid'
  }
]

// 同一个集合的索引合并成一条 tcb 命令执行
function group() {
  const map = {}
  for (const it of INDEXES) (map[it.coll] = map[it.coll] || []).push(it)
  return map
}

const FAIL_HINT = {
  pg: '本环境没有文档型数据库（PG 模式），且不支持切换 → 新建环境、创建时数据库类型选「云数据库」、地域选上海；已有环境没法救（详见 create-collections.js 头部说明）',
  // collection not exist 说明顺序错了：先建集合再建索引
  seq: '集合还不存在 → 先跑 node create-collections.js，再回来建索引',
  login: '未登录或登录已过期 → 执行 tcb login 重新授权',
  env: '未指定环境 → tcb env use <环境ID>，或运行时加 --env-id <环境ID>'
}

function explain(out) {
  if (/no document database instance|未开通文档型数据库|document-database actions/i.test(out)) return FAIL_HINT.pg
  if (/CollectionNotFound|collection not exist|不存在/i.test(out)) return FAIL_HINT.seq
  if (/not logged|please login|请先登录|AuthFailure/i.test(out)) return FAIL_HINT.login
  if (/MISSING_PARAM|specify the environment|please specify/i.test(out)) return FAIL_HINT.env
  return null
}

/**
 * Windows 下给 cmd.exe 用的参数转义（务必保留，别删）
 * node 在 Windows 走 shell:true 时不转义，JSON 里的引号会被 cmd.exe 吃掉，
 * tcb 就报 "JSON parse failed ... at position 2"，很容易误判成命令格式写错。
 * 按 MSVCRT 规则：引号前的反斜杠翻倍，引号本身写成 \"。
 * 索引 payload 也含嵌套 JSON（Command 字段是字符串化的 JSON），必须按成对规则转义。
 */
function quoteForCmd(s) {
  return '"' + s.replace(/(\\*)"/g, (m, bs) => (bs.length ? bs + bs + '\\"' : '\\"')).replace(/(\\+)$/, (m, bs) => bs + bs) + '"'
}

function run(coll, items) {
  const cmd = JSON.stringify({
    createIndexes: coll,
    indexes: items.map((i) => ({ key: Object.assign({}, ...i.keys), name: i.name }))
  })
  // tcb db nosql execute 的 --command 必须是「JSON 数组」，传单个对象会被直接拒绝
  const payload = JSON.stringify([
    { CommandType: 'COMMAND', TableName: coll, Command: cmd }
  ])
  const commandArg = process.platform === 'win32' ? quoteForCmd(payload) : payload
  const args = ['db', 'nosql', 'execute', '--command', commandArg, '--json']
  if (envId) args.push('--env-id', envId)

  const r = spawnSync('tcb', args, {
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  })
  if (r.error) {
    console.log('   ✗ 没找到 tcb 命令，请先 npm i -g @cloudbase/cli 并 tcb login')
    return { ok: false, stop: true }
  }
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim()

  // 环境级故障（PG 模式 / 未登录 / 没指定环境）：说明根因并让主流程停下，避免后面重复报错刷屏
  const hint = explain(out)
  if (hint) {
    console.log(`   ✗ ${hint}`)
    return { ok: false, stop: true }
  }

  // UpdateTable 幂等：索引已存在会返回成功，这里不再单独判定重复
  const ok = r.status === 0
  console.log(`   ${ok ? '✓ 已创建' : '✗ 需检查'}  ${out.slice(0, 200)}`)
  return { ok, stop: false }
}

;(function main() {
  console.log('开始创建索引，共 ' + INDEXES.length + ' 个（分布在 ' + Object.keys(group()).length + ' 个集合）')
  let okCount = 0
  let stopped = null
  for (const [coll, items] of Object.entries(group())) {
    const r = run(coll, items)
    if (r.ok) okCount++
    if (r.stop) {
      stopped = true
      break
    }
  }
  console.log(`\n完成：${okCount}/${Object.keys(group()).length} 个集合成功`)
  if (stopped) {
    console.log('⛔ 因环境级问题中断，请先修复上面的提示再重跑')
    process.exitCode = 1
    return
  }
  console.log('复核方式：云开发控制台 → 数据库 → 对应集合 → 索引管理，确认上面每个索引都处于"已生效"')
})()
