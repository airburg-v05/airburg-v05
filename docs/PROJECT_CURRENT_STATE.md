# Project Current State

> **Authority notice:** This file is a derived human-readable summary. The only machine-readable current-state authority is `docs/project/PROJECT_SSOT.json`. If this summary conflicts with the SSOT, the SSOT wins.

## 单轨统一状态

- 唯一 active product track：`SAAS_UI_V2`。
- SaaS UI V2 当前状态：`PUBLIC_E2E_PASS_AFTER_BOARD_SIMPLIFICATION_PENDING_POST_DEPLOY_OWNER_REVIEW`；技术 PASS 不得称为产品完成。
- Home、系列、店铺、商品、数据健康和导入历史共用当前品牌的活动运行时快照；目标中心独立读写品牌目标。
- `visualAccepted = false`、`previewDeployed = true`、`humanAccepted = false`。
- 冻结 fallback：天猫 V1 公网内测版。
- 可信数据基础：天猫 V1 ETL / Runtime / BI 真实 18 文件链路。
- foundation candidate：V0.5 domain / repository / persistence；当前只部分 route-bound。
- 当前任务：`SAAS_V2_BOARD_SIMPLIFICATION_AND_TARGET_VISIBILITY_V1`，状态 `PENDING_POST_DEPLOY_OWNER_REVIEW`。
- 下一唯一入口：宗骥的公网页面视觉/业务复核；自动化截图不能替代用户确认。
- 当前任务和证据：`docs/project/current-task.json`、`docs/project/tasks/SAAS_V2_BOARD_SIMPLIFICATION_AND_TARGET_VISIBILITY_V1/`。

## SaaS UI V2 公网预览

- 当前分支：`feature/saas-ui-v2-shell`。
- 最新已验证业务实现与公网部署源：`f772af503bcfd29b331798866d9efc2635958bc2`。
- 公网预览：[V2 Home](http://123.57.49.121/v2/home)。
- `/v2/home`：17 个指标、最多 5 个手动选择系列的同构筛选、MTD / DLY 双指标趋势、自定义日期和真实同比/环比状态已公网回归。
- `/v2/series-board`：粘贴商品 ID 绑定、同一套 17 指标/趋势、底部系列卡片编辑删除已公网回归。
- `/v2/store-board` 与 `/v2/product-board`：仅保留紧凑范围、KPI 和趋势决策面。
- 真实经营对账保持不变：GMV `125596`、GSV `85455.96`、访客 `143076`、支付买家 `128`、推广花费 `7625.95`、点击 `6692`、退款金额 `29602.18`。
- 上传结果与数据健康摘要已对齐：`18 success / 0 failed / 0 skipped`，首页安全跳过计数为 `0`。
- 跨月金额目标按月份交集天数折算；比例/均值目标不按天缩小，跨月缺月时保持 unknown。
- 公网系统浏览器回归为 `46/46 PASS`，console 业务错误与 failed business requests 均为 `0`。
- `visualAccepted=false`、`humanAccepted=false`、`visualReviewStatus=PENDING_HUMAN_REVIEW`；当前只等待用户打开公网 `/v2/home` 核查。

## Legacy V1 fallback 定位

当前公网 fallback 是 **天猫 V1 内测排查版**，不是正式多用户生产版。它不再是 active product track，但在 V2 完成逐页纵向切片前必须保持稳定。

它用于内部验证天猫每日经营数据上传、运行时安全聚合、BI 指标、目标草稿、系列/宝贝排查和页面交互闭环。当前不承诺多用户共享、服务端数据库、正式权限体系或正式生产 SLA。

## 当前公网入口

公网 IP 入口：

- `http://123.57.49.121/upload`
- `http://123.57.49.121/home`
- `http://123.57.49.121/series-board`
- `http://123.57.49.121/product-board`
- `http://123.57.49.121/store-board`
- `http://123.57.49.121/upload/history`
- `http://123.57.49.121/upload/quality`

## 已完成且已部署

以下能力已完成，并已通过公网 IP 内测环境部署或回归记录：

- `ETL_FILE_ROUTER V2`
- `Runtime append STRICT V1`
- `Search keyword dedup V2`
- `Brand / center unified resolver`
- Missing metrics：去退费比 / 直接成交占比
- Target required / derived / unsupported
- Runtime Dataset Persistence
- Target Drafts Persistence
- Server alignment full redeploy
- Page Problem V1/V2 layout agent resolution：小范围 UI 文案 / 布局修正已公网部署，仍保持全量 KPI 网格基线
- Page Problem V1/V2 layout public human review：用户已人工核查 7 个公网页面并确认方向可接受
- Home layout polish with open-source reference：`/home` 小范围布局打磨已公网部署并完成公开回归，仍保持全量 KPI 网格基线；当前等待用户人工核查
- Home + Board compact toolbar：`/home`、`/series-board`、`/store-board`、`/product-board` 顶部 compact toolbar 已公网部署并完成公开回归，仍保持全量 KPI 网格基线；当前等待用户人工核查
- `HOME_POST_UPLOAD_TIME_RANGE_DEFAULT_TO_DATASET_RANGE_V1`: `PUBLIC_DEPLOYED` / `SERVER_ALIGNED`
- `HOME_SERIES_FILTER_FROM_DEBUG_CONTEXT_BRIDGE_V1`: `PUBLIC_DEPLOYED` / `SERVER_ALIGNED`
- `CHART_SCOPE_AND_TIME_RANGE_CONSISTENCY_AUDIT_AND_FIX_V1`: `PUBLIC_DEPLOYED` / `SERVER_ALIGNED`
- `LOCAL_GATE_FIX_COMPACT_TOOLBAR_PRODUCT_SELECTOR_AND_HOME_390_KPI_V1`: `PASS` recorded as deployment precondition

## UI baseline 状态

- 当前 UI baseline：`docs/UI_BASELINE_LOCK_V2.md`
  - 基线名称：页面问题梳理第二版 · 全量 KPI 卡片网格基线
  - `RESTORE_FULL_KPI_GRID_FROM_PAGE_PROBLEM_V2_BASELINE_V1`: `PUBLIC_DEPLOYED`
  - `PAGE_PROBLEM_V1_V2_LAYOUT_AGENT_RESOLUTION_PIPELINE_V1`: `PUBLIC_DEPLOYED`
  - `HOME_LAYOUT_POLISH_WITH_OPEN_SOURCE_REFERENCE_V1`: `PUBLIC_DEPLOYED`
  - `HOME_TOP_CONTROL_COMPACT_TOOLBAR_HARD_FIX_V2`: `PUBLIC_DEPLOYED`
  - `BOARD_TOP_CONTROL_COMPACT_TOOLBAR_SYNC_FROM_HOME_V1`: `PUBLIC_DEPLOYED`
  - `HOME_POST_UPLOAD_TIME_RANGE_DEFAULT_TO_DATASET_RANGE_V1`: `PUBLIC_DEPLOYED`
  - `HOME_SERIES_FILTER_FROM_DEBUG_CONTEXT_BRIDGE_V1`: `PUBLIC_DEPLOYED`
  - `CHART_SCOPE_AND_TIME_RANGE_CONSISTENCY_AUDIT_AND_FIX_V1`: `PUBLIC_DEPLOYED`
  - `PAGE_PROBLEM_V1_V2_LAYOUT_PUBLIC_HUMAN_REVIEW_ACCEPTANCE_NOTE`: `RECORDED`
  - `PUBLIC_DEPLOYED = true`
  - `SERVER_ALIGNED = true`
  - `HUMAN_REVIEW_PASS = true`
  - `HOME_LAYOUT_POLISH_PUBLIC_REVIEW`: `public_pass_waiting_human_review`
  - `HOME_AND_BOARD_COMPACT_TOOLBAR_PUBLIC_REVIEW`: `public_pass_waiting_human_review`
  - `TIME_RANGE_SERIES_FILTER_CHART_PUBLIC_REVIEW`: `public_pass_waiting_human_review`
  - 下一步：对 `/home` 小范围布局打磨、Home / Series / Store / Product compact toolbar、timeRange 默认范围、首页系列筛选桥接和图表 scope/timeRange 一致性做用户人工核查；核查前不得记录为 `human_review_pass`。
  - 说明：已完成 ECS 公网部署、页面问题一 + 二小范围 UI 回归、真实 18 文件回归和用户人工页面核查；本轮 `/home` 小范围 polish、Home / Series / Store / Product compact toolbar、timeRange 默认范围、首页系列筛选桥接和图表 scope/timeRange 一致性已公网回归 PASS，但仍需用户人工页面核查。后续 UI 任务仍需先读取 `docs/UI_BASELINE_LOCK_V2.md`。

## 旧 State Layer 审计结果

- `lib/state/system-state.ts`
  - classification：`DEPRECATED_UNBOUND_STATE_ARTIFACT`
  - semanticStatus：`STALE_SEMANTICS`
  - 当前业务 import 数量：`0`
  - 说明：该文件包含过期 IA / KPI lock，未接入当前路由，不能继续称为项目 SSOT。详见 `docs/project/DEPRECATED_STATE_ARTIFACTS.md`。

## 当前已知风险

1. SaaS UI V2 已有多个 data-bound 路由通过公网回归，但数据/配置仍是浏览器本地边界，未证明跨设备共享、服务端多租户、权限体系或云端持久化完成。
2. 页面问题一 + 二小范围 UI 修正已完成人工核查；后续新页面问题仍必须先进入 `PAGE_PROBLEM_MATRIX_V2.md`，不能凭记忆直接修 UI。
3. UI 层存在 IA / KPI / Target 多语义叠加风险，后续 UI 任务必须先读取 `docs/UI_BASELINE_LOCK_V2.md`，并判定是否会误改 BI 或 Target。
4. `/v2/home` 已公网预览部署，但尚未通过用户视觉核查；禁止把自动化截图结果写成视觉验收。
5. 长上下文中容易混淆 validator PASS 与产品成熟度；后续必须使用 `docs/project/STATUS_MODEL_V1.json`。
6. ECS 当前健康，部署源由本地精确 `git archive` SHA 和 release path 证明；服务器 release 目录仍不包含 `.git`，这是预期安全边界。

## 当前禁止事项

- 不改 ETL，除非任务明确是 ETL。
- 不改 BI 公式，除非任务明确是 BI。
- 不改 target persistence schema。
- 不改 runtime append。
- 不改 search dedup。
- 不改 brand / center 语义。
- UI 任务不得改数据口径。
- Target 任务不得反写真实实际值。
- Persistence 任务不得保存原始 Excel / CSV、`rawRows`、`previewRows`、warning 原文或售后敏感明细。
- 未确认部署前不得说已上线。
- 未公网回归前不得说公网 PASS。
- 未 server alignment 前不得说服务器版本已统一。
- 未完成对应任务公网回归前，不得说该任务已公网生效。

## 当前推荐执行顺序

1. 先读取 `docs/project/PROJECT_SSOT.json`。
2. 再读取 `docs/project/current-task.json` 和其中指定的 task contract。
3. 本轮 Home / Series / Store / Product 简化版已 `PUBLIC_E2E_PASS`；下一步是用户视觉/业务核查，核查前不得记录 `VISUAL_ACCEPTED` 或 `HUMAN_ACCEPTED`。
4. Legacy V1 UI 任务仍需读取 `docs/UI_BASELINE_LOCK_V2.md` 和 `PAGE_PROBLEM_MATRIX_V2.md`；V2 不继承其具体布局锁。
5. 如果跨层，拆任务，不允许在页面里自行拼接或重算数据。
6. 每次完成后使用 `STATUS_MODEL_V1.json` 中的精确状态，不能只写一个 `PASS`。
