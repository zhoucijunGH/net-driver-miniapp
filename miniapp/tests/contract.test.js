/**
 * 小程序侧契约测试（纯解析，无需 Taro / 云环境）
 *
 * 守护三件事，全部是"编译不报错、但运行时才暴露"的漂移风险：
 *   1. contract.js 里每个接口字段完整（path / fn / method / event）
 *   2. contract.js 的每个接口，在 api/index.js 都有同名语义方法
 *      —— 缺这一环正是"report 缺 costs 分支"那类真 bug 的来源（契约有了，方法却没接）
 *   3. contract.js 的每个 path，后端 routes.js 都已实现（与 code/server 共用真源，双向校验）
 *
 * 运行：node tests/contract.test.js
 */
const fs = require('fs')
const path = require('path')

const CONTRACT_SRC = path.join(__dirname, '..', 'src', 'api', 'contract.js')
const INDEX_SRC = path.join(__dirname, '..', 'src', 'api', 'index.js')
const routes = require('../../server/routes')

let pass = 0
let fail = 0
function check(title, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✓ ${title}`)
  } else {
    fail++
    console.log(`  ✗ ${title}${detail ? `  → ${detail}` : ''}`)
  }
}

/** 从 contract.js 抠出每个接口：key / path / fn / method / 是否有 event 函数 */
function parseContract() {
  const text = fs.readFileSync(CONTRACT_SRC, 'utf8')
  // 顶层接口块：两个空格缩进的 "key: {" ... 到同缩进 "},"
  const block = /^ {2}([a-zA-Z]\w*): \{[\s\S]*?\n {2}\},?\n/gm
  const out = []
  let m
  while ((m = block.exec(text)) !== null) {
    const body = m[0]
    const key = m[1]
    const p = /path:\s*'([^']+)'/.exec(body)?.[1]
    const fn = /fn:\s*'([^']+)'/.exec(body)?.[1]
    const method = /method:\s*'([^']+)'/.exec(body)?.[1] || 'POST'
    const hasEvent = /event:\s*\(?[\w\s,]*\)?\s*=>/.test(body)
    out.push({ key, path: p, fn, method, hasEvent })
  }
  return out
}

/** 从 api/index.js 抠出 api 对象里的所有方法名
 *  匹配「2 空格缩进 + 方法名 + ':' + '('」的声明（api 对象里所有方法都长这样） */
function parseApiMethods() {
  const text = fs.readFileSync(INDEX_SRC, 'utf8')
  const re = /^\s{2}([a-zA-Z]\w*):\s*\(/gm
  const names = []
  let m
  while ((m = re.exec(text)) !== null) names.push(m[1])
  return names
}

;(async () => {
  console.log('\n══ 小程序侧契约测试 ══\n')

  const contracts = parseContract()
  const apiMethods = parseApiMethods()
  const EXPECTED = 13
  const table = routes.TABLE

  check(
    `contract.js 解析出全部接口（期望 ${EXPECTED} 条）`,
    contracts.length === EXPECTED,
    `实际 ${contracts.length} 条`
  )

  // 1. 字段完整性
  const badField = contracts.filter((c) => !c.path || !c.fn || !c.hasEvent)
  check('每个接口都有 path / fn / event', badField.length === 0, badField.map((c) => c.key).join(', '))

  // 2. 契约 ↔ api 方法 1:1 映射
  const missingMethod = contracts.filter((c) => !apiMethods.includes(c.key))
  check(
    'contract.js 每个接口在 api/index.js 都有同名方法',
    missingMethod.length === 0,
    missingMethod.map((c) => c.key).join(', ') || '无'
  )
  const orphanMethod = apiMethods.filter((m) => !contracts.some((c) => c.key === m))
  if (orphanMethod.length) {
    console.log(`  · 提示：api 中存在未对应契约的方法（若有意则忽略）：${orphanMethod.join(', ')}`)
  }

  // 3. 契约 path ↔ 后端 routes 实现
  const missingRoute = contracts.filter((c) => !table.has(c.path))
  check(
    'contract.js 每个 path 后端 routes.js 都已实现',
    missingRoute.length === 0,
    missingRoute.map((c) => c.path).join(', ') || '无'
  )

  // 反向：后端不应有契约之外的 path（避免前端永远调不到的后端孤儿路由）
  const contractPaths = new Set(contracts.map((c) => c.path))
  const orphanRoute = [...table.keys()].filter((p) => !contractPaths.has(p))
  check(
    '后端 routes.js 没有契约之外的孤儿 path',
    orphanRoute.length === 0,
    orphanRoute.join(', ') || '无'
  )

  console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`)
  process.exit(fail ? 1 : 0)
})()
