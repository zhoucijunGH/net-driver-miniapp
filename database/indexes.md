# 索引清单与创建方式

这份文档只为一件事服务：**让 5000 用户规模下的查询都能命中索引**。

基础套餐的数据库连接数只有 20。没有索引时，一次查询要扫描整个集合，
耗时从几毫秒涨到几百毫秒甚至几秒，长时间占住那 20 个连接之一，
高峰期几个司机同时打开小程序就会连锁变慢——这不是"以后再优化"的问题，
是上线前必须做完的一步。

## 一键创建（推荐）

```bash
npm i -g @cloudbase/cli       # 只需一次
tcb login                      # 浏览器授权（推荐），或 tcb login --key 用密钥
tcb env use cloud1-xxxxxxxx    # 换成你的环境 ID

cd code/database
node create-indexes.js
```

脚本会按集合分组执行 9 个索引，逐个打印结果。每个集合的索引上限是 20 个，当前用量远低于此。

## 手动创建（控制台）

云开发控制台 → 数据库 → 选中集合 → **索引管理** → 添加索引，填下面的字段与排序：

| 集合 | 索引名 | 字段与排序 | 是否唯一 |
|---|---|---|---|
| bills | idx_bill_month_openid | month 升序、openid 升序 | 否 |
| bills | idx_bill_openid_date | openid 升序、date 升序 | 否 |
| bills | idx_bill_openid_createdAt | openid 升序、createdAt **降序** | 否 |
| costs | idx_cost_openid_month | openid 升序、month 升序 | 否 |
| costs | idx_cost_openid_date | openid 升序、date 升序 | 否 |
| costs | idx_cost_fleet_month_sync | fleetId 升序、month 升序、syncToFleet 升序 | 否 |
| certs | idx_cert_openid_due | openid 升序、dueDate 升序 | 否 |
| driver_consent | idx_consent_openid | openid 升序 | 否 |
| companies | idx_company_fleetid | fleetId 升序 | 否 |

## 单条 tcb 命令示例

想单独补一个索引时，用下面这个格式（`tickets` 换成你的集合名）：

```bash
tcb db nosql execute --command '[{"CommandType":"COMMAND","TableName":"costs","Command":"{\"createIndexes\":\"costs\",\"indexes\":[{\"key\":{\"openid\":1,\"month\":1},\"name\":\"idx_cost_openid_month\"}]}"}]' --json
```

Windows 下引号容易踩坑，优先用上面的 Node 脚本，它内部直接传参数数组，不经过 shell 引号解析。

## 每个索引为什么必须有

| 索引 | 缺失时的后果 |
|---|---|
| idx_bill_month_openid | 车队占比汇总要扫全表，5000 用户后单次查询秒级 |
| idx_bill_openid_date | report 的"近 30 天 / 本周对比"退化为全表扫描 |
| idx_bill_openid_createdAt | 账单列表翻页越翻越慢 |
| idx_cost_openid_month | 首页每次刷新都要扫全部成本记录 |
| idx_cost_openid_date | 分析页趋势图拖垮，且占连接时间最长 |
| idx_cost_fleet_month_sync | B 端车队台账打不开或超时（最重的一条） |
| idx_cert_openid_due | 证件提醒每次都扫，且排序无法下推 |
| idx_consent_openid | 每记一笔都要全表找授权记录，写路径被拖慢 |
| idx_company_fleetid | B 端每次鉴权都扫公司表 |

## 验收

控制台 → 数据库 → 集合 → 索引管理，确认每个索引状态为**已生效**（不是"创建中"）。
数据量为空时索引几乎立刻生效；已有大量数据时后台构建需要几分钟到几十分钟，期间后台跑到。

索引不是越多越好：每个索引都会拖慢写入。上面 9 个都是被真实查询路径用上的，不要凭感觉加。
