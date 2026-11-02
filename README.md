# 净司机 · 网约车司机出车管家（小程序）

面向网约车司机的出车记账工具：导入平台账单、算净时薪、看每日收益、管理车队的成本与分成。

## 技术栈

- 前端：Taro 3 + Vue 3（编译到微信小程序）
- 后端：微信云开发（云函数 + 云数据库），共 12 个云函数
- 能力：CSV/Excel 账单解析、剪贴板文本抽取、订阅消息、微信支付会员

## 为什么做这个

网约车司机看到的「流水」不等于「到手」：平台抽成、油/电、租金、保养、罚款都要自己减。这个工具把「净时薪」算清楚，让司机知道自己今天到底赚了多少。

## 目录结构

```
miniapp/             # Taro 3 + Vue3 小程序源码
├── src/
│   ├── pages/       # 首页、账单导入、净时薪、报表、会员
│   └── utils/       # request.js 统一云函数调用
└── config/          # Taro 编译配置

cloudfunctions/      # 云函数
├── parseBill/         # CSV/Excel 账单解析入库
├── clipboardParse/    # 剪贴板文本结构化抽取
├── report/            # 净时薪与报表统计
├── pay/               # 微信支付下单与回调
├── subscribe/         # 一次性订阅消息
├── consent/           # 司机数据同意态管理
├── syncFleet/         # B 端车队数据同步
└── ...                # addCost / fleetCosts / ocrBill / initDb / qr / cloudbase_auth

database/            # 云数据库集合定义与初始化说明
```

## 本地运行

```bash
cd miniapp
npm install
npm run dev:weapp
```

然后用微信开发者工具导入本目录，把 `project.config.json` 里的 `appid` 换成你自己的（本仓库已用 `YOUR_APPID` 占位）。

云函数需在微信开发者工具里逐个「上传并部署（云端安装依赖）」，并在 `src/app.js` 填入自己的云开发环境 ID。

## 合规设计

- 订单原文不跨主体留存，司机注销即删除
- 采集前显式同意（consent 云函数记录同意态）
- 账单解析在云函数内完成，前端不留存明文

## 说明

本仓库为产品源码，`appid`、云环境 ID 与支付商户号均已移除，需自行申请。PC 管理后台（B 端）未包含在本仓库。
