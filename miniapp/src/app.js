// 应用入口：注册 Vue3 应用，启动时初始化云开发
import { createApp } from 'vue'
import Taro from '@tarojs/taro'
import { API_MODE, CLOUD_ENV } from './utils/config'
import { initPrivacy } from './utils/privacy'
import './app.scss'

const App = createApp({
  onShow() {},
  // 只有走云函数模式才需要初始化云环境。
  // mock / http 两种模式与之无关——http 模式打的是自己的后端，压根不经过微信云。
  onLaunch() {
    if (process.env.TARO_ENV === 'weapp') {
      // 隐私授权监听：解决"选图/拍照必崩"——未授权时接口会被微信拦截
      initPrivacy()
      if (API_MODE === 'cloud') {
        Taro.cloud.init({ env: CLOUD_ENV, traceUser: true })
      }
    }
  }
})

export default App
