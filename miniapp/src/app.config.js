// 全局页面注册（对应《MVP 技术落地清单》11 个前端页面的 MVP 子集）
export default defineAppConfig({
  // 开启微信隐私授权系统：不设这个，onNeedPrivacyAuthorization 不会触发，选图/拍照真机会被拦截
  __usePrivacyCheck__: true,
  pages: [
    'pages/index/index',            // 首页驾驶舱（横幅+三卡+多平台合并）
    'pages/bill-import/index',      // 导入账单（微信会话选文件）
    'pages/bills/index',            // 账单列表
    'pages/analysis/index',         // 净时薪分析
    'pages/ledger/index',           // 合规台账
    'pages/costs/index',            // 成本记账（P0 补齐项①）
    'pages/member/index',           // 会员中心（支付+会员信息）
    'pages/consent/index',          // 数据同步授权（司机同意流）
    'pages/profile/index',          // 我的（设置/撤销授权入口）
    'pages/privacy/index',          // 隐私政策（上架必需 + 隐私弹窗跳转）
    'pages/agreement/index'         // 用户协议（上架必需）
  ],
  tabBar: {
    color: '#999999',
    selectedColor: '#FF7E33',
    backgroundColor: '#ffffff',
    // 图标由 PIL 生成的双态 PNG（灰色未选中 / 滴滴橙选中），见 src/assets/
    list: [
      { pagePath: 'pages/index/index', text: '首页', iconPath: 'assets/tab-home.png', selectedIconPath: 'assets/tab-home-active.png' },
      { pagePath: 'pages/bills/index', text: '账单', iconPath: 'assets/tab-bill.png', selectedIconPath: 'assets/tab-bill-active.png' },
      { pagePath: 'pages/analysis/index', text: '分析', iconPath: 'assets/tab-chart.png', selectedIconPath: 'assets/tab-chart-active.png' },
      { pagePath: 'pages/profile/index', text: '我的', iconPath: 'assets/tab-user.png', selectedIconPath: 'assets/tab-user-active.png' }
    ]
  },
  window: {
    navigationBarTitleText: '净司机',
    navigationBarBackgroundColor: '#FF7E33',
    navigationBarTextStyle: 'white',
    backgroundColor: '#F7F8FA'
  },
  cloud: true
})
