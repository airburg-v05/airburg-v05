# Page Problem Matrix V2

> **Authority and scope:** This is a historical problem ledger for the frozen Legacy V1 fallback. It is not the project SSOT and it does not define SaaS UI V2 runtime state. Current track/task status comes from `docs/project/PROJECT_SSOT.json` and `docs/project/current-task.json`.

本矩阵用于承接“页面问题梳理第二版”，避免 Legacy V1 fallback 后续任务凭印象修 UI 或跨层误改 ETL / BI / Target / Persistence。

状态枚举：

- `unresolved`
- `local_pass`
- `local_pass_waiting_public_deploy`
- `public_pass_waiting_human_review`
- `human_review_pass`
- `public_pass`
- `needs_user_check`
- `blocked`

层级枚举：

- `ETL`
- `BI`
- `Target`
- `UI`
- `Persistence`
- `Deploy`

| problemId | page | originalProblem | layer | currentStatus | evidence | nextAction | forbiddenChanges |
|---|---|---|---|---|---|---|---|
| PVM2-001 | `/home` | 首页时间选择和提示区域信息层级不稳，容易和数据恢复状态、目标状态混在一起。 | UI | public_pass_waiting_human_review | local validation = PASS；public deployment = PASS；真实 18 文件回归 PASS；本轮 timeRange 默认范围公网回归 PASS：旧无交集 `2026-07-01` 自动切回 `2026-06-26 ~ 2026-06-30`，售后 `2026-07-01` 未拖动默认经营范围；截图 manifest 已记录。 | 等待用户人工核查本轮 timeRange 默认范围与 `/home` 顶部状态；核查通过后再改为 human_review_pass。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-002 | `/home` | 首页 KPI 结构和卡片展示仍可能信息过密，Primary / Secondary / Hidden 要保持收敛。 | UI | public_pass_waiting_human_review | local validation = PASS；public deployment = PASS；首页 KPI 17 张，五项布局保留；本轮系列筛选后首页 GMV 从 125,596 收窄为 34,047，KPI 网格未回退。 | 等待用户人工核查本轮 `/home` KPI 网格、compact toolbar 与系列筛选状态；核查通过后再改为 human_review_pass。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-003 | `/home` | 去退费比 / 直接成交占比曾不显示，需要防止后续 UI 改动误判为空。 | BI | public_pass_waiting_human_review | local validation = PASS；public deployment = PASS；去退费比 13.65%，直接成交占比 63.4% 仍在主 KPI 网格展示；本轮 timeRange / series filter / chart scope 公网回归 PASS。 | 等待用户人工核查本轮 `/home` 指标展示；核查通过后再改为 human_review_pass。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-004 | `/home` | 可视化数据、MTD、DLY 和趋势细节重复展示，容易制造理解噪声。 | UI | public_pass_waiting_human_review | local validation = PASS；public deployment = PASS；Home / Series / Store / Product 图表已按当前 timeRange 与 scope 渲染；`/home` DLY / MTD 截图已记录；390px 检查通过。 | 等待用户人工核查本轮图表 scope/timeRange 一致性；核查通过后再改为 human_review_pass。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-005 | `/home` `/series-board` `/product-board` | 品牌词 / 中心词 / 类目词语义容易混淆，P1/P2/P300/ZEN 需要折叠和分组表达。 | UI | human_review_pass | local validation = PASS；public deployment = PASS；center word 语义回归 PASS；中心词弹窗文案用户人工核查通过。 | 保持当前基线，后续仅按新反馈单独立项。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-006 | `/home` `/series-board` `/product-board` | 目标 required / derived / unsupported 需要保持输入、推导、隐藏三层，不得回到全量输入。 | Target | public_pass_waiting_human_review | local validation = PASS；public deployment = PASS；target required / derived / unsupported 回归 PASS；本轮 `/home` target popover 布局和 compact toolbar 公网回归 PASS。 | 等待用户人工核查本轮 `/home` 小范围布局打磨与 compact toolbar；核查通过后再改为 human_review_pass。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-007 | `/series-board` | 系列选择曾缺失，创建 A/B 后需要当前系列筛选并保持 productId-first。 | UI | public_pass_waiting_human_review | local validation = PASS；public deployment = PASS；系列 KPI 15 张，productId-first 不回退；本轮 `/series-board` 临时系列“空气净化器”公网回归 PASS，并桥接到 `/home` 系列筛选。 | 等待用户人工核查本轮系列选择与首页桥接；核查通过后再改为 human_review_pass。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-008 | `/store-board` | 店铺选择与平台/目标/数据恢复状态需要统一入口，不能和首页目标店铺混淆。 | UI | public_pass_waiting_human_review | local validation = PASS；public deployment = PASS；店铺 KPI 15 张，不展示 StoreRecord 等开发术语；本轮 `/store-board` 图表按当前 store scope 回归 PASS。 | 等待用户人工核查本轮 `/store-board` scope 与图表；核查通过后再改为 human_review_pass。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-009 | `/product-board` | 宝贝选择曾出现“所有宝贝”口径，当前应保持单宝贝视图。 | UI | public_pass_waiting_human_review | local validation = PASS；public deployment = PASS；宝贝 KPI 15 张，不恢复“所有宝贝”，productId-first 不回退；本轮 `/product-board` 图表按当前 product scope 回归 PASS。 | 等待用户人工核查本轮 `/product-board` selector 与图表；核查通过后再改为 human_review_pass。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-010 | `/upload` | 上传页平台 Tab 需要产品化，天猫开放，京东/抖音/有赞/拼多多 disabled。 | UI | human_review_pass | local validation = PASS；public deployment = PASS；Upload 产品化入口保持，不回退四固定槽位；上传页平台状态 / skipped 文案用户人工核查通过。 | 保持当前基线，后续仅按新反馈单独立项。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-011 | `/upload` | 上传识别错误需要安全表达，只展示 success / fail / skipped，不暴露技术字段。 | ETL | human_review_pass | local validation = PASS；public deployment = PASS；Upload 不展示 rawRows / previewRows / warning 原文，数据链路回归 PASS；用户人工核查通过。 | 保持当前基线，后续仅按新反馈单独立项。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-012 | `/upload/history` `/upload/quality` | 历史 / 质量页边界必须只读，不展示原始文件、原始行、售后敏感字段。 | Persistence | public_pass | Runtime Dataset Persistence 公网 PASS；history / quality 只读边界保留。 | 后续只增强摘要可读性和筛选体验。 | 不做删除、回滚、覆盖、重新导入；不展示 `rawRows` / `previewRows`。 |
| PVM2-013 | `/home` `/series-board` `/product-board` | Runtime Dataset / Debug Context / Target Drafts 三类持久化状态容易被混称。 | Persistence | public_pass_waiting_human_review | local validation = PASS；public deployment = PASS；UI baseline 明确 PUBLIC_DEPLOYED=true，SERVER_ALIGNED=true；本轮 active dataset 恢复、debug context series bridge、target isolation 和 runtime dataset 无 targets 均公网回归 PASS。 | 等待用户人工核查本轮状态文案与跨页恢复；核查通过后再改为 human_review_pass。 | no ETL change；no BI formula change；no Target formula change；no Persistence schema change；no L1/L2/L3/L4；no Primary/Secondary/Hidden；no Hidden KPI chip |
| PVM2-014 | 全站 | 分批部署造成服务器版本混合风险。 | Deploy | public_pass | Server alignment full redeploy PASS；远端 ETL/BI/Target/UI 关键哈希对齐。 | 后续每次部署后必须做 server alignment 或 public regression。 | 不在未部署时说公网已生效；不开放 3000；不上传 private-samples。 |

## 最新公网小范围 UI 回归记录

- `ALIYUN_ECS_DEPLOY_PAGE_PROBLEM_V1_V2_LAYOUT_AGENT_RESOLUTION_AND_PUBLIC_REGRESSION`: PASS。
- 覆盖 problemId：`PVM2-001`、`PVM2-002`、`PVM2-003`、`PVM2-004`、`PVM2-005`、`PVM2-006`、`PVM2-007`、`PVM2-008`、`PVM2-009`、`PVM2-010`、`PVM2-011`、`PVM2-013`。
- 对应 problemId 状态：`human_review_pass`。
- 页面问题一 + 二小范围 UI 回归：PASS。
- 真实 18 文件上传回归：PASS。
- 首页真实值回归：GMV `125,596`，GSV `85,455.96`，去退费比 `13.65%`，直接成交占比 `63.4%`。
- 仍保持全量 KPI 网格：Home `17`，Series / Store / Product `15`。
- 未出现 `L1` / `L2` / `L3` / `L4`、`Primary` / `Secondary` / `Hidden`、`Hidden KPI chip`。
- 截图 manifest：`/tmp/airburg-page-problem-v1-v2-layout-jBqc19/manifest.json`。
- 真实上传 E2E manifest：`/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-tmall-real-upload-e2e-eZ262U/manifest.json`。
- 用户人工页面核查：PASS。

## 用户人工核查通过记录

- `PAGE_PROBLEM_V1_V2_LAYOUT_PUBLIC_HUMAN_REVIEW_ACCEPTANCE_NOTE`: RECORDED。
- 人工核查通过页面：`/home`、`/series-board`、`/product-board`、`/store-board`、`/upload`、`/upload/history`、`/upload/quality`。
- 全量 KPI 网格方向：确认通过。
- KPI 五项布局：确认通过。
- 时间选择浮层：确认通过。
- 中心词弹窗文案：确认通过。
- 上传页平台状态 / skipped 文案：确认通过。
- 未出现 `L1` / `L2` / `L3` / `L4`。
- 未出现 `Primary` / `Secondary` / `Hidden`。
- 未出现 `Hidden KPI chip`。
- 未回退四固定槽位上传。
- 真实 18 文件回归数据正常。
- 未发现敏感字段泄漏。
- 390px 无明显问题。
- 后续动作：保持当前全量 KPI 网格基线，后续新反馈必须重新绑定 `problemId` 后再执行。

## 使用规则

1. 每个新任务必须先引用本矩阵中的 `problemId`。
2. 一个任务如果覆盖多个 layer，默认拆分；除非用户明确授权跨层任务。
3. `public_pass` 项不允许被“顺手重构”，只能做明确 scoped 的回归或 UI-only 微调。
4. `unresolved` 和 `needs_user_check` 项优先进入审计任务，而不是直接实现。
