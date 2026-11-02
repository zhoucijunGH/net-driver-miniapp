// Taro 编译主配置（webpack5 + vue3）
const config = {
  projectName: 'jingsiji-miniapp',
  date: '2026-10-28',
  designWidth: 750,
  deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  framework: 'vue3',
  compiler: 'webpack5',
  mini: {
    webpackChain(chain) {
      // 如需自定义 webpack 规则在此追加
    },
    // 静态资源原样拷贝：tabBar 图标/默认头像
    // （ec-canvas 组件不需要 copy —— Taro 会自动编译并拷贝 usingComponents 引用的原生组件）
    copy: {
      patterns: [
        { from: 'src/assets/', to: 'dist/assets/' }
      ],
      options: {}
    },
    // 注意：小程序产物文件名不要加 [hash] —— 微信开发者工具的编译器按固定名（app.js/comp.js 等）加载
    postcss: {
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false }
    }
  },
  h5: {
    publicPath: '/',
    outputRoot: 'distH5',
    // 截图用：临时开启 pxtransform，让 750 设计稿在浏览器里按视口等比缩放
    postcss: { pxtransform: { enable: true, config: {} }, autoprefixer: { enable: true } }
  }
}

module.exports = function (merge) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev'))
  }
  return merge({}, config, require('./prod'))
}
