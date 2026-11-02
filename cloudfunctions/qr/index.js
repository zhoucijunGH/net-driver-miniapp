/**
 * qr —— 扫码归因与进入分流（对应需求 §2.6.5 扫码动作链路的第①②步）
 *
 * action:
 *   resolve  司机扫小程序码进入时调用：解析 scene → 查 qrcodes 命中归因 →
 *            写 scan_logs → 静默注册 users（带来源）→ 计数 scans/registers →
 *            返回落地分支（车队欢迎页 / 通用价值页）所需的展示数据。
 *
 * 设计红线：
 *   - scene 解析失败一律降级为 generic 分支，绝不抛错挡住司机进小程序
 *   - 只写自己的 openid 数据；qrcodes 计数用服务端 inc，前端入参不可信
 *   - 真云上的"生成小程序码"（getUnlimitedQRCode）在 B 端动作里做（见 fleet.js 注释），
 *     本函数只负责 C 端扫码后的归因与分流
 */
const cloud = require('wx-server-sdk')
const { parseScene } = require('./scene')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (event.action !== 'resolve') return { code: -1, msg: '未知 action' }
  if (!OPENID) return { code: -1, msg: '缺少身份' }

  const scene = String(event.scene || '').trim()
  const parsed = parseScene(scene)

  // ---- ① 查码：命中才算渠道归因，查不到按自然进入处理 ----
  const hits = await db.collection('qrcodes').where({ code: scene }).get()
  const row = hits.data[0] || null
  const type = row ? row.type : parsed.valid ? parsed.type : 'generic'

  // ---- ② 扫码日志（渠道效果报表与审计的数据源）----
  await db.collection('scan_logs').add({
    data: {
      code: scene || '(空)',
      codeId: row ? row._id : '',
      type,
      fleetId: row ? row.fleetId || '' : '',
      refOpenid: row && row.type === 'forward' ? row.refOpenid || '' : '',
      openid: OPENID,
      matched: !!row,
      createdAt: Date.now()
    }
  })

  // ---- ③ 静默注册：users 没有这个人就建档，来源写进档案（第②步）----
  const users = await db.collection('users').where({ openid: OPENID }).get()
  let registered = false
  if (!users.data.length) {
    await db.collection('users').add({
      data: {
        openid: OPENID,
        nickname: '',
        source: row ? row.type : 'organic',
        sourceCode: scene || '',
        boundFleetId: '',
        driverName: '',
        plate: '',
        createdAt: Date.now()
      }
    })
    registered = true
    if (row) {
      await db.collection('qrcodes').where({ code: scene }).update({ data: { registers: _.inc(1) } })
    }
  }

  // ---- ④ 扫码计数（命中的码才计）----
  if (row) {
    await db.collection('qrcodes').where({ code: scene }).update({ data: { scans: _.inc(1) } })
  }

  // ---- ⑤ 落地分支数据（第①步：车队码→欢迎页，其余→价值页）----
  const data = {
    matched: !!row,
    type,
    registered,
    fleetId: row ? row.fleetId || '' : '',
    fleetName: '',
    refName: '',
    materialName: row ? row.name || '' : ''
  }

  if (type === 'fleet' && data.fleetId) {
    // 车队欢迎页要展示"XX租车 邀请你加入"
    const metas = await db.collection('fleet_meta').where({ fleetId: data.fleetId }).get()
    data.fleetName = (metas.data[0] && metas.data[0].fleetName) || ''
    if (!data.fleetName) {
      const comps = await db.collection('companies').where({ fleetId: data.fleetId }).get()
      data.fleetName = (comps.data[0] && comps.data[0].name) || ''
    }
  }
  if (type === 'forward' && row && row.refOpenid) {
    // 转发码：落地页展示"来自同行 XXX 的分享"（匿名化，只给昵称）
    const refs = await db.collection('users').where({ openid: row.refOpenid }).get()
    data.refName = (refs.data[0] && (refs.data[0].driverName || refs.data[0].nickname)) || '一位同行司机'
  }

  return { code: 0, data }
}
