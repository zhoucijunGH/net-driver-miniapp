/**
 * 文件与媒体
 *
 * 只放「跟微信文件/图片 API 打交道」的工具，不涉及业务语义。
 * 对外暴露 uploadReceipt 这一个入口，调用方不需要关心当前是哪种接入模式。
 */
import Taro from '@tarojs/taro'
import { API_BASE, API_MODE } from './config'

/**
 * 从微信会话里选文件（账单导入主入口）
 * 司机习惯让车队/平台客服把账单 CSV 发微信里，这里直接从聊天记录挑。
 * @returns {Promise<{ path: string, name: string, size: number }>} 临时文件对象
 */
export async function chooseMessageFile() {
  const res = await Taro.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['csv', 'xlsx', 'xls']
  })
  return res.tempFiles[0]
}

/**
 * 上传凭证图片，返回可用于入库的 fileID
 *
 * 三种模式走三条路，但对调用方是同一个函数：
 *   cloud → 微信云存储（cloud:// 开头的短地址）
 *   http  → 自己的后端（返回由后端决定的 fileID）
 *   mock  → 不真传，返回占位串
 *
 * 【务必记住】fileID 只是一串短字符串，**图片本体存在对象存储里**，
 * 数据库 costs.picFileID 只存这个地址。切勿把图片 base64 写进数据库——
 * 单条记录会膨胀到几百 KB，查询一路变慢，还会撞上单次出包 16MB 的硬限制。
 *
 * @param {string} filePath 微信临时文件路径
 * @returns {Promise<string>} fileID，失败时返回空串（由调用方决定降级策略）
 */
export async function uploadReceipt(filePath) {
  if (API_MODE === 'mock') {
    return `mock://receipt/${Date.now()}`
  }

  if (API_MODE === 'cloud') {
    const name = filePath.split('/').pop() || `${Date.now()}.jpg`
    const res = await Taro.cloud.uploadFile({
      cloudPath: `costs/${Date.now()}-${name}`,
      filePath
    })
    return res.fileID
  }

  // http 模式：走自己的后端。这里刻意不用 Taro.cloud.uploadFile——
  // 那个要求先 Taro.cloud.init()，而 http 模式下我们压根不初始化微信云。
  const res = await Taro.uploadFile({
    url: `${API_BASE}/api/files`,
    filePath,
    name: 'file',
    formData: { dir: 'costs' }
  })
  const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  if (!body || body.code !== 0) {
    throw new Error((body && body.msg) || `上传失败 HTTP ${res.statusCode}`)
  }
  return body.data.fileID
}

/**
 * 把临时文件（账单 CSV）交给后端并换回 fileID，供导入接口使用。
 * cloud 模式下本来也不支持 xlsx 解析，统一交给后端处理更省事。
 */
export async function uploadBillFile(filePath, name) {
  if (API_MODE === 'mock') return `mock://bill/${name}`

  if (API_MODE === 'cloud') {
    const res = await Taro.cloud.uploadFile({
      cloudPath: `bills/${Date.now()}-${name}`,
      filePath
    })
    return res.fileID
  }

  const res = await Taro.uploadFile({
    url: `${API_BASE}/api/files`,
    filePath,
    name: 'file',
    formData: { dir: 'bills' }
  })
  const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  if (!body || body.code !== 0) throw new Error((body && body.msg) || '文件上传失败')
  return body.data.fileID
}
