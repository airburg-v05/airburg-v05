# Project Current State

> **Authority notice:** This file is a derived human-readable summary. The only machine-readable current-state authority is `docs/project/PROJECT_SSOT.json`. If this summary conflicts with the SSOT, the SSOT wins.

## 单轨统一状态

- 唯一 active product track：`SAAS_UI_V2`。
- SaaS UI V2 当前状态：`HOME_VERTICAL_SLICE_LOCAL_E2E_PASS`。
- `/v2/home` 已通过一个 canonical adapter 绑定真实安全聚合数据；其余 8 个 `/v2/*` 路由仍为 `STATIC_SHELL`。
- `dataBound = true` 仅表示 `/v2/home`；`visualAccepted = false`、`previewDeployed = false`、`humanAccepted = false`。
- 冻结 fallback：天猫 V1 公网内测版。
- 可信数据基础：天猫 V1 ETL / Runtime / BI 真实 18 文件链路。
- foundation candidate：V0.5 domain / repository / persistence；当前只部分 route-bound。
- 当前任务：`V2_HOME_REAL_DATA_VERTICAL_SLICE_V1`，状态 `LOCAL_E2E_PASS`。
- 下一唯一入口：`V2_HOME_HUMAN_VISUAL_REVIEW`；自动化截图不能替代用户视觉确认。
- 当前任务和证据：`docs/project/current-task.json`、`docs/project/tasks/V2_HOME_REAL_DATA_VERTICAL_SLICE_V1/task-contract.json`。

## SaaS UI V2 本地纵向切片

- 当前分支：`feature/saas-ui-v2-shell`。
- 最新已验证可执行实现：`8b69e46fee532379be5f5f0b2ef4fe44c87a87aa`。
- `/v2/home`：17 个指标、真实 18 文件、目标 overlay、重点系列、MTD / DLY、时间范围、刷新恢复、1440px / 390px 浏览器 E2E 均通过。
- 真实经营对账保持不变：GMV `125596`、GSV `85455.96`、访客 `143076`、支付买家 `128`、推广花费 `7625.95`、点击 `6692`、退款金额 `29602.18`。
- 上传结果与数据健康摘要已对齐：`17 success / 0 failed / 1 safe skipped`，首页安全跳过计数为 `1`。
- 跨月范围不会误套用单个月份目标；回到单月后目标正常恢复。
- 当前仅本地提交，未 push、未部署；不得据此声称公网 V2 已更新。

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

1. SaaS UI V2 只有 `/v2/home` 完成真实数据纵向切片，其余 8 个 V2 路由仍是静态壳，不能称为完整工作区或预览部署。
2. 页面问题一 + 二小范围 UI 修正已完成人工核查；后续新页面问题仍必须先进入 `PAGE_PROBLEM_MATRIX_V2.md`，不能凭记忆直接修 UI。
3. UI 层存在 IA / KPI / Target 多语义叠加风险，后续 UI 任务必须先读取 `docs/UI_BASELINE_LOCK_V2.md`，并判定是否会误改 BI 或 Target。
4. 当前 V2 Home 本地提交尚未 push；GitHub 远端和 ECS 不会自动获得这些更新。
5. 长上下文中容易混淆 validator PASS 与产品成熟度；后续必须使用 `docs/project/STATUS_MODEL_V1.json`。
6. ECS 当前健康，但部署目录无 Git 元数据，部署 commit 无法证明；状态只能是 `PUBLIC_HEALTH_PASS_COMMIT_UNKNOWN`。

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
3. `/v2/home` 真实数据纵向切片已经 `LOCAL_E2E_PASS`；下一步是用户视觉核查，核查前不得记录 `VISUAL_ACCEPTED`。
4. Legacy V1 UI 任务仍需读取 `docs/UI_BASELINE_LOCK_V2.md` 和 `PAGE_PROBLEM_MATRIX_V2.md`；V2 不继承其具体布局锁。
5. 如果跨层，拆任务，不允许在页面里自行拼接或重算数据。
6. 每次完成后使用 `STATUS_MODEL_V1.json` 中的精确状态，不能只写一个 `PASS`。
