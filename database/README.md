# 云数据库集合清单（12 个）

在微信开发者工具 → 云开发控制台 → 数据库 → 新建以下集合（权限均选"仅创建者可读写"）：

| 集合 | 用途 | 关键字段 | 索引建议 |
|---|---|---|---|
| users | 用户 | openid, companyId(预留), memberUntil | openid 唯一 |
| bills | 账单（标准账单模板） | openid, platform, date, month, gross, net, sourceType(manual/fleet), fleetId | openid+date, fleetId+month |
| costs | 成本台账（C 端「记一笔」） | openid, driverName, fleetId, date, month, category(充电/加油/高速停车/保养维修/罚单/其他), amount, note, hasPic, picFileID, syncToFleet, createdAt | openid+month, fleetId+month |
| contracts | 租车合同 | openid, company, deposit, rent, startDate, endDate | openid |
| certs | 证件台账 | openid, name, dueDate, status(ok/soon/overdue) | openid+dueDate |
| violations | 违章 | openid, date, fine, points, handled | openid+date |
| companies | B 端租车公司 | name, fleetId, admins(管理员 openid 数组), didiApiKeyEnc(加密), authStatus, contact | fleetId |
| fleet_sync_task | 同步任务记录 | companyId, runAt, count, status | companyId+runAt |
| driver_consent | 司机同意记录 | openid, scope, fleetId, granted, grantedAt, revoked, revokedAt | openid |
| subscriptions | 订阅额度 | openid, templateId, remain | openid+templateId |
| ocr_usage | 拍照识别每日配额 | _id(openid_日期), openid, date, count | _id |
| ocr_cache | 票据 OCR 结果缓存 | _id(fileID 的 md5), fileID, result, createdAt | _id |

## 成本数据的双向同步规则（重要）

`costs` 里的 `syncToFleet` 是"这条成本能不能出现在车队后台"的唯一开关，由云函数写入，前端无法伪造：

- 司机已授权（driver_consent.granted=true 且 revoked=false）且 `fleetId` 非空 → `syncToFleet=true`，`fleetCosts` 云函数按 fleetId 汇总时能读到
- 司机撤销授权 / 未绑定车队 → `syncToFleet=false`，记账照常成功（账本是司机自己的），但车队后台永远查不到
- 撤销不清空历史：已同步的记录 `syncToFleet` 保持 true，作为司机的对账依据保留；需要彻底删除走注销账号

## 安全规则要点

- C 端集合按 openid 隔离，任何查询强制带 openid 条件
- companies 仅 B 端后台（PC Web + 独立鉴权）可写，司机端只读聚合视图
- didiApiKeyEnc 必须加密存储，密钥放云函数环境变量，禁止入库明文

---

# 容量与性能规范（目标：5000 用户 / 1500 DAU）

> 平台上限可以轻松承载 5000 用户，真正决定生死的是"每次请求消耗多少次数据库往返"。
> 微信云开发基础套餐的数据库连接数只有 20、单次出包上限 16MB、云函数默认 20s 超时，
> 这三条硬限制决定了：**写错一个查询，几百条数据就能把接口拖挂。**

## 一、必须建立的索引（先于功能上线）

没有索引时数据库会对全集合扫描，数据量翻倍、耗时翻倍，且长时间占用那 20 个连接里的一个，
高峰期连锁雪崩。**建这一步优先于任何功能上线**，别等到慢了再补。

清单与查询路径一一对应，可直接执行 `node create-indexes.js` 一键创建（依赖 tcb CLI），
手动方式见 `indexes.md`：

| 集合 | 索引名 | 字段 | 服务场景 |
|---|---|---|---|
| bills | idx_bill_month_openid | `month + openid` | 按月汇总、车队占比（**最高频**） |
| bills | idx_bill_openid_date | `openid + date` | 近 30 天 / 本周对比范围查询 |
| bills | idx_bill_openid_createdAt | `openid + createdAt` 降序 | 个人账单列表分页 |
| costs | idx_cost_openid_month | `openid + month` | 月度成本汇总、C 端成本列表 |
| costs | idx_cost_openid_date | `openid + date` | 分析页按天汇总成本 |
| costs | idx_cost_fleet_month_sync | `fleetId + month + syncToFleet` | 车队台账聚合过滤 |
| certs | idx_cert_openid_due | `openid + dueDate` | 证件到期取最紧急（首页横幅） |
| driver_consent | idx_consent_openid | `openid` | 每次记账判授权（写路径热查询） |
| companies | idx_company_fleetid | `fleetId` | B 端鉴权取管理员白名单 |

## 二、禁止写法（写新查询前对照）

1. **禁止逐条 `await add`** —— 600 行账单串行写要 18s+，直接撞 20s 超时。
   正解：按 200 条/批、`Promise.all` 控并发 5 写入（见 `parseBill`）。
2. **禁止 `skip` 深分页拉全量** —— `skip(n)` 需要从第一条扫到第 n 条，翻到后面越来越慢，
   且串行几十次请求必超时。正解：聚合管道（`aggregate().match().group().end()`）把计算下推，
   或用「上一页最后一条的排序值」做游标翻页（见 `fleetCosts`）。
3. **禁止在云函数里把全集合读进内存再做统计** —— 单次出包上限 16MB，5000 用户后必然触碰。
   正解：在数据库侧聚合，只回传聚合结果（几十到几百条）。
4. **禁止用日期字符串前缀做 `where` 模糊过滤** —— 无法命中索引。统一冗余 `month`（YYYY-MM）字段。
5. **单次 `match` 的 `$in` 数组长度控制在 100 以内**，超出必须分块（`$in` 条件过大会拖垮查询计划）。

## 三、单请求预算（建议作为 code review 标准）

| 场景 | 数据库往返上限 | 说明 |
|---|---|---|
| report `home` | 4 次（+车队状态 2 次） | 车队两块查询由前端传 `needFleet` 按需跳过 |
| report `analysis` | 3 次 | 按天 / 按平台 / 成本按天分类各一次聚合 |
| C 端其它读（账单列表/台账/成本列表） | ≤ 3 次 | 超了说明该做缓存或合并请求 |
| C 端写（记一笔/导入） | ≤ 6 次 | 含授权判定与批量写 |
| B 端报表（车队台账） | ≤ 6 次 | 250 名司机时 `$in` 分 3 块 + 聚合 1 次 |
| 定时任务（syncFleet） | 按公司串行，单公司 ≤ 10 次 | 加 per-company try/catch，一家失败不影响其他 |

## 四、已知待办

- 凭证图原文体积偏大（单张压缩后约 200KB），建议在云函数侧二次压缩后再存云存储，
  并给 `costs/{openid}/` 目录设置生命周期规则，超出 2 年的凭证自动降级。

## 五、已落地的两道保护（改动前请先看这段）

1. **report 的 home / analysis 已实现**（不再是返回 0 的桩）。两条路径全部走聚合管道：
   计算下推到数据库，只回传几十行的聚合结果。改这两个分支时，请保持"按维度分组、不让明细入内存"的写法。
2. **小程序端有 60 秒读缓存**（`utils/request.js`）。只缓存 `report`；
   任何写操作（addCost / parseBill / syncFleet / consent）执行后会立刻清空缓存，
   所以不会出现"刚记完账看不到"。**新增只读云函数时，记得把它加进 READ_FNS**，
   新增写操作时确认走的是同一个 callFunction（写会自动清缓存）。

另外两个与容量直接相关的事实：
- 账单里的 `month`、`date` 必须归一化为 `YYYY-MM`（`parseBill` 已做）。
  混进一个 `2026/10/28` 格式的日期，那条账单就会从所有时间口径里消失——这是最难查的一类 bug。
- 在线时长落在 `bills.hours`（小时）。CSV 里没有时长列时该值为 0，
  report 会把净时薪**显示成 0 并给出原因**，绝不编一个数字出来。

---

## 六、这些集合/索引具体怎么建（2026-10-28 更新）

按当前所处环境的通道二选一，**不要混用**：

| 环境 | 建集合方式 | 建索引方式 |
|---|---|---|
| **微信云开发**（本次联调） | 部署 `cloudfunctions/initDb` → 云端测试 → **用完删掉该函数** | 控制台手动，按 `indexes.md` 加 9 个（联调阶段可跳过） |
| **腾讯云 CloudBase**（上线前） | `node create-collections.js --env-id <环境ID>` | `node create-indexes.js --env-id <环境ID>` |

完整步骤、权限设置、真机验证清单见 **`code/docs/部署手册-微信云开发联调.md`**。

⚠️ 开腾讯云环境时，**数据库的「类型」这一步是决定性的**：
创建时选「云数据库」→ 有文档型数据库；选「PostgreSQL」→ 只有 PG，且官方明确**不可切换**。
现有 `zhoucijun-d2gete83h2f2bb329` 就是选了 PG 的那类（实例 `pgdb-dl1cdnqz`），
`create-collections.js` / `create-indexes.js` 遇到它会直接报出这条原因并停住，不会假装成功。

**当前代码实际用到其中 9 个**（`grep -E "collection\(" cloudfunctions/*/index.js` 统计）：
`driver_consent`、`bills`、`costs`、`companies`、`certs`、`contracts`、`violations`、`ocr_cache`、`ocr_usage`。
尚未落地的 3 个：`users`、`subscriptions`、`fleet_sync_task`（先建坑位，避免以后增删集合）。
