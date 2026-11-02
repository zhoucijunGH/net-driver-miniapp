/**
 * 批量创建 12 个集合（腾讯云 CloudBase CLI 版）
 *
 * 前置条件（只需一次）：
 *   npm i -g @cloudbase/cli
 *   tcb login                       // 浏览器授权
 *   tcb env use <环境ID>            // 或直接 node create-collections.js --env-id xxx
 *
 * 运行：
 *   node create-collections.js
 *   node create-collections.js --env-id cloud1-xxxxxxxx
 *
 * ⚠️ 重要前提：目标环境必须是「云数据库（文档型）」模式。
 *   2026-10-28 实测：撞金华账号下的 zhoucijun-d2gete83h2f2bb329 是 PG 环境，
 *   接口原话 "provisioned with PostgreSQL instance ... document-database actions
 *   such as CreateTable are not available"；且腾讯云文档明确说明
 *   「环境运行模式由创建时选择的数据库类型决定，一旦确定不可切换」。
 *   所以：环境开错 → 别想办法补救 → 重开一个，创建时数据库类型选「云数据库」。
 *   本脚本遇到 PG 环境会直接给出这条提示并停住，不会假装成功。
 */
const { spawnSync } = require('child_process')

const argv = process.argv.slice(2)
const ei = argv.findIndex((a) => a === '--env-id' || a === '-e')
const envId = ei >= 0 && argv[ei + 1] ? argv[ei + 1] : ''
const DRY = argv.includes('--dry') // 只打印将要执行的命令，不真的调用云端

// 与 database/README.md、cloudfunctions/initDb 三方保持一致
const COLLECTIONS = [
  'users',
  'bills',
  'costs',
  'contracts',
  'certs',
  'violations',
  'companies',
  'fleet_sync_task',
  'driver_consent',
  'subscriptions',
  'ocr_usage',
  'ocr_cache'
]

/**
 * 统一的失败归因：把几种典型错误翻译成「下一步该干什么」
 * 命令行工具的错误码不直观，人工看原始输出很容易往错的方向排查
 */
function explain(out) {
  if (/no document database instance|未开通文档型数据库|document-database actions/i.test(out)) {
    return '本环境没有文档型数据库（PG 模式），且不支持切换 → 请新建环境、创建时数据库类型选「云数据库」，地域选上海；已有环境没法救'
  }
  if (/not logged|please login|请先登录|AuthFailure/i.test(out)) {
    return '未登录或登录已过期 → 执行 tcb login 重新授权'
  }
  if (/MISSING_PARAM|specify the environment|please specify/i.test(out)) {
    return '未指定环境 → tcb env use <环境ID>，或运行时加 --env-id <环境ID>'
  }
  return null
}

/**
 * Windows 下给 cmd.exe 用的参数转义（务必保留，别删）
 *
 * 踩坑过程：payload 是 JSON，里面必然有双引号；node 在 Windows 走 shell:true
 * 时不会自动转义，cmd.exe 会把引号吃掉一半，tcb 报错停在
 * "Command parameter JSON parse failed: Expected property name ... at position 2"，
 * 看起来像命令格式写错了，其实是被 cmd 嚼了。
 * 按 MSVCRT 规则处理：引号前已有的反斜杠翻倍，再把引号本身写成 \"。
 * 注意 payload 里存在嵌套 JSON（Command 字段本身是字符串化的 JSON），本来就有 \"
 * 序列，所以必须按"成对"规则转义，不能简单地全局 replace(" 为 \"。
 */
function quoteForCmd(s) {
  return '"' + s.replace(/(\\*)"/g, (m, bs) => (bs.length ? bs + bs + '\\"' : '\\"')).replace(/(\\+)$/, (m, bs) => bs + bs) + '"'
}

function run(name) {
  // tcb db nosql execute 的 --command 必须是「JSON 数组」，传单个对象会被直接拒绝
  const payload = JSON.stringify([
    { TableName: name, CommandType: 'COMMAND', Command: JSON.stringify({ createCollection: name }) }
  ])
  // macOS / Linux 交给 shell 自身的引号规则即可，只有 Windows 需要上面那套 MSVCRT 转义
  const commandArg = process.platform === 'win32' ? quoteForCmd(payload) : payload
  const args = ['db', 'nosql', 'execute', '--command', commandArg, '--json']
  if (envId) args.push('--env-id', envId)

  if (DRY) {
    console.log(`[dry] tcb ${args.map((a) => (a.includes(' ') ? `'${a}'` : a)).join(' ')}`)
    return { ok: true, dup: false, dry: true }
  }

  const r = spawnSync('tcb', args, { encoding: 'utf-8', shell: process.platform === 'win32' })
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim()

  if (r.error) {
    console.log(`✗ ${name} 未执行：没找到 tcb 命令 → npm i -g @cloudbase/cli 并 tcb login`)
    return { ok: false, hint: true }
  }
  if (explain(out)) return { ok: false, hint: explain(out) }
  // 集合已存在会报 ResourceInUse / already exists，这不算失败
  const dup = /ResourceInUse|already exists|已存在|CollectionExists/i.test(out)
  if (r.status === 0 || dup) return { ok: true, dup }
  return { ok: false, raw: out.slice(0, 200) }
}

;(function main() {
  console.log(`准备创建 ${COLLECTIONS.length} 个集合${envId ? `，环境 ${envId}` : '（使用 tcb 默认环境）'}`)
  const created = []
  const skipped = []
  const failed = []
  let stop = null

  for (const name of COLLECTIONS) {
    const r = run(name)
    if (r.ok) {
      r.dup ? skipped.push(name) : created.push(name)
      console.log(`${r.dup ? '·' : '✓'} ${name}${r.dup ? '（已存在）' : ''}`)
    } else if (r.hint) {
      stop = r.hint
      console.log(`✗ ${name} —— ${r.hint}`)
      break
    } else {
      failed.push(name)
      console.log(`✗ ${name} —— ${r.raw}`)
    }
  }

  console.log('\n———— 汇总 ————')
  console.log(`新建 ${created.length} / 已存在 ${skipped.length} / 失败 ${failed.length}`)
  if (stop) {
    console.log(`\n⛔ 环境级问题，后续命令已跳过：\n   ${stop}`)
    process.exitCode = 1
    return
  }
  if (created.length || skipped.length) {
    console.log('\n下一步：')
    console.log('  1) node create-indexes.js          // 建 9 个索引（上线前必须做）')
    console.log('  2) 控制台 → 数据库 → 每个集合 → 权限设置改为「仅创建者可读写」')
    console.log('  3) 如果当前是微信云开发环境（无 CLI 入口），改用 cloudfunctions/initDb 云函数建集合')
  }
})()
