# UI Baseline Lock V2

## 当前 UI 基线名称

**页面问题梳理第二版 · 全量 KPI 卡片网格基线**

## 当前状态

- `RESTORE_FULL_KPI_GRID_FROM_PAGE_PROBLEM_V2_BASELINE_V1`: `PUBLIC_DEPLOYED`
- `PAGE_PROBLEM_V1_V2_LAYOUT_AGENT_RESOLUTION_PIPELINE_V1`: `PUBLIC_DEPLOYED`
- `PAGE_PROBLEM_V1_V2_LAYOUT_PUBLIC_HUMAN_REVIEW_ACCEPTANCE_NOTE`: `RECORDED`
- `PUBLIC_DEPLOYED = true`
- `SERVER_ALIGNED = true`
- `HUMAN_REVIEW_PASS = true`

当前基线已部署到 ECS 公网 IP 内测环境，并已完成公网 18 文件真实上传回归、390px 检查、截图验收和用户人工页面核查。本轮页面问题一 + 页面问题二小范围 UI 文案 / 布局修正方向已由用户确认可接受。

## 必须保持的页面结构

### 首页

- 全量 KPI 网格。
- KPI 数量 `>= 15`，当前为 `17`。
- 不展示 `L1` / `L2` / `L3` / `L4`。
- 不展示 `Primary` / `Secondary` / `Hidden`。
- 不展示 `Hidden KPI chip`。
- KPI 卡片展示：
  - 当前值
  - MTD目标
  - 总目标
  - 差值
  - 完成率
  - 进度条
- 去退费比、直接成交占比必须在主 KPI 网格中展示。
- `derived` / `unsupported` 对应 KPI 不隐藏，只是目标输入规则不同。

### 系列看板

- 全量 KPI 网格。
- KPI 数量 `>= 15`。
- 当前系列选择保留。
- `productId-first` 不回退。
- 不展示 `L1` / `L2` / `L3` / `L4`。
- 不展示 `Primary` / `Secondary` / `Hidden`。
- 不展示 `Hidden KPI chip`。

### 店铺看板

- 全量 KPI 网格。
- KPI 数量 `>= 15`。
- 当前店铺选择保留。
- 不展示 `StoreRecord` 等开发术语。
- 不展示 `L1` / `L2` / `L3` / `L4`。
- 不展示 `Primary` / `Secondary` / `Hidden`。

### 宝贝看板

- 全量 KPI 网格。
- KPI 数量 `>= 15`。
- 当前宝贝只展示用户手动添加宝贝。
- 不恢复“所有宝贝”。
- `productId-first` 不回退。
- 不展示 `ProductRecord` / `TrackedProductRecord`。
- 不展示 `L1` / `L2` / `L3` / `L4`。
- 不展示 `Primary` / `Secondary` / `Hidden`。

### 上传页

- 保持产品化批量上传入口。
- 不回退四固定槽位。
- 平台按钮化保留。
- 不展示 `rawRows` / `previewRows` / warning 原文。

## 后续任务明确禁止引入

- `L1` / `L2` / `L3` / `L4` 大块结构。
- `Primary` / `Secondary` / `Hidden` 主页面文案。
- `Hidden KPI chip`。
- 将 `derived` / `unsupported` KPI 从主网格隐藏。
- 用 5 个主 KPI 替代全量 KPI 网格。
- 在 UI 任务中修改 ETL / BI 公式 / Target 公式 / Persistence schema。

如果后续任务会改变 KPI 展示数量、隐藏 KPI、引入新的 UI 层级标签，必须输出 `BLOCKED`，除非用户明确授权。

## 当前验证事实

- `validate-restore-full-kpi-grid-from-page-problem-v2-baseline-v1.ts`: PASS。
- `validate-tianmao-v1-refactor-pipeline-v2.ts`: PASS。
- `validate-tmall-missing-metrics-implementation-v1.ts`: PASS。
- `validate-target-required-derived-metric-rules-implementation-v1.ts`: PASS。
- `validate-page-problem-v1-v2-layout-agent-resolution-v1.ts`: PASS。
- `validate-tmall-real-upload-to-home-series-e2e.ts`: PASS。
- `npm run lint`: PASS。
- `npm run build`: PASS。

## 公网部署记录

- `ALIYUN_ECS_DEPLOY_RESTORE_FULL_KPI_GRID_FROM_PAGE_PROBLEM_V2_BASELINE_AND_PUBLIC_REGRESSION`: PASS。
- `ALIYUN_ECS_DEPLOY_PAGE_PROBLEM_V1_V2_LAYOUT_AGENT_RESOLUTION_AND_PUBLIC_REGRESSION`: PASS。
- 公网入口：`http://123.57.49.121/home`、`/series-board`、`/product-board`、`/store-board`、`/upload`、`/upload/history`、`/upload/quality`。
- 真实 18 文件上传回归：PASS。
- 截图 manifest：`/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-full-kpi-public-deploy-regression-wxvaub/manifest.json`。
- 页面问题一 + 二小范围 UI 回归 manifest：`/tmp/airburg-page-problem-v1-v2-layout-jBqc19/manifest.json`。
- 真实上传 E2E manifest：`/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-tmall-real-upload-e2e-eZ262U/manifest.json`。

## 用户人工核查记录

- `PAGE_PROBLEM_V1_V2_LAYOUT_PUBLIC_HUMAN_REVIEW_ACCEPTANCE_NOTE`: RECORDED。
- 人工核查通过页面：`/home`、`/series-board`、`/product-board`、`/store-board`、`/upload`、`/upload/history`、`/upload/quality`。
- 全量 KPI 网格方向确认通过。
- KPI 五项布局确认通过。
- 时间选择浮层确认通过。
- 中心词弹窗文案确认通过。
- 上传页平台状态 / skipped 文案确认通过。
- 未出现 `L1` / `L2` / `L3` / `L4`。
- 未出现 `Primary` / `Secondary` / `Hidden`。
- 未出现 `Hidden KPI chip`。
- 未回退四固定槽位上传。
- 真实 18 文件回归数据正常。
- 未发现敏感字段泄漏。
- 390px 无明显问题。

## 下一步

保持当前全量 KPI 网格基线；后续 UI 任务仍必须先读取本文件，并且不得隐藏 KPI、引入 `L1` / `L2` / `L3` / `L4` 或 `Primary` / `Secondary` / `Hidden` 主页面文案，除非用户明确授权。
