/**
 * consent —— 司机数据同意态与账号生命周期
 * action:
 *   grant         同意车队数据同步 → 写 driver_consent(grantedAt, scope)
 *   revoke        撤销授权 → 标记 revoked，syncFleet 同步时跳过
 *   deleteAccount 注销即删（隐私红线）：bills/costs/contracts/certs/violations/consent 全清
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { action, scope } = event
  const { OPENID } = cloud.getWXContext()

  if (action === 'grant') {
    // 重新授权：有记录就地复位（revoked=false），没有则新建 —— 避免同一司机堆多条同意记录
    // fleetId 由 B 端推送的授权链接带入（/pages/consent/index?fleetId=xxx）；
    // 没有 fleetId 就只算"同意同步"，B 端仍查不到 —— 因此要原样存下，供 addCost 判断是否可上报
    const fleetId = String(event.fleetId || '').trim()
    const existing = await db.collection('driver_consent').where({ openid: OPENID }).get()
    const wasGranted = !!(existing.data[0] && existing.data[0].granted && !existing.data[0].revoked)
    if (existing.data.length) {
      const patch = { scope: scope || 'fleet_sync', granted: true, grantedAt: Date.now(), revoked: false, revokedAt: 0 }
      // 只在本次带了 fleetId 时才覆盖，避免"我的→去开启"这种没带车队参数的回流把车队绑定冲掉
      if (fleetId) patch.fleetId = fleetId
      await db.collection('driver_consent').where({ openid: OPENID }).update({ data: patch })
    } else {
      await db.collection('driver_consent').add({
        data: { openid: OPENID, scope: scope || 'fleet_sync', fleetId, granted: true, grantedAt: Date.now(), revoked: false }
      })
    }

    // ---- 扫码链路收口（§2.6.5 第⑤步）：授权成功后的档案回写 ----
    if (fleetId) {
      const users = await db.collection('users').where({ openid: OPENID }).get()
      const user = users.data[0] || null
      // ① 用户档案记下车队绑定（B 端据此把"扫码未授权"升级为"已接入"）
      if (user) {
        await db.collection('users').where({ openid: OPENID }).update({
          data: { boundFleetId: fleetId, boundAt: Date.now() }
        })
        // ② 车队成员名单 upsert：B 端司机管理列表立刻出现这位司机（三态=已同步）
        //    name 优先用登记的姓名，没有就用"新司机"，车牌等 B 端补充
        const members = await db.collection('drivers').where({ openid: OPENID }).get()
        if (!members.data.length) {
          const all = await db.collection('drivers').get()
          const nextId = all.data.reduce((m, d) => Math.max(m, Number(d.id) || 0), 0) + 1
          await db.collection('drivers').add({
            data: {
              openid: OPENID, id: nextId,
              name: user.driverName || user.nickname || '新司机',
              plate: user.plate || '',
              source: user.source || 'fleet',
              risk: 0, reasons: [], fleetId,
              createdAt: Date.now()
            }
          })
        }
        // ③ 渠道转化计数：首次授权才 +1（重复授权不重复计），用于 B 端渠道效果报表
        if (!wasGranted && user.sourceCode) {
          await db.collection('qrcodes').where({ code: user.sourceCode }).update({ data: { conversions: _.inc(1) } })
        }
      }
    }
    return { code: 0, data: { granted: true, fleetId } }
  }

  if (action === 'revoke') {
    // 撤回同意（个保法第 15 条）：把该司机的同意记录全部标记 revoked，
    // syncFleet 只同步 granted=true 且 revoked=false 的司机，因此撤销后立即断流。
    // 若从未同意过（无记录），补一条 revoked 记录，避免"撤销了但云端查不到痕迹"。
    const existing = await db.collection('driver_consent').where({ openid: OPENID }).get()
    if (existing.data.length) {
      await db.collection('driver_consent')
        .where({ openid: OPENID })
        .update({ data: { granted: false, revoked: true, revokedAt: Date.now() } })
    } else {
      await db.collection('driver_consent').add({
        data: { openid: OPENID, scope: 'fleet_sync', granted: false, revoked: true, revokedAt: Date.now() }
      })
    }
    return { code: 0, data: { granted: false } }
  }

  if (action === 'deleteAccount') {
    const collections = ['bills', 'costs', 'contracts', 'certs', 'violations', 'driver_consent']
    for (const name of collections) {
      await db.collection(name).where({ openid: OPENID }).remove()
    }
    return { code: 0 }
  }

  return { code: -1, msg: '未知 action' }
}
