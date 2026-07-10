# Task Execution Protocol V1

本协议用于 Airburg 当前单轨项目后续所有任务。目标是防止长上下文丢失、跨层误改和把本地状态误报为公网状态。

## 当前状态权威

每次任务必须按顺序读取：

1. `docs/project/PROJECT_SSOT.json`，唯一机器可读当前状态权威。
2. `docs/project/current-task.json`，唯一当前任务指针。
3. `current-task.json` 中 `contract` 指向的 `task-contract.json`。

其它文档权威等级：

- `docs/PROJECT_CURRENT_STATE.md`：由 SSOT 派生的人类可读摘要。
- `docs/PAGE_PROBLEM_MATRIX_V2.md`：Legacy V1 历史问题 ledger。
- `docs/UI_BASELINE_LOCK_V2.md`：仅适用于冻结的 Legacy V1 fallback。
- `AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2.md`：产品规格，不代表已实现或已运行。
- V0.5 freeze：归档发布证据，不代表当前所有路由已使用 V0.5。
- `lib/state/system-state.ts`：不是项目状态 SSOT。

每次只能存在一个 current task。Agent / Skill 不得自行创建平行状态源或越过 task contract。

## 每次新任务必须先判断

1. 任务属于哪一层：`ETL` / `BI` / `Target` / `UI` / `Persistence` / `Deploy` / `Audit` / `Docs`。
2. 是否跨层。
3. 是否允许改 ETL。
4. 是否允许改 BI。
5. 是否允许改 Target。
6. 是否允许改 UI。
7. 是否允许改 persistence。
8. 是否需要部署。
9. 是否需要公网回归。
10. 是否需要人工核查。

UI 任务必须先读取：

1. `docs/UI_BASELINE_LOCK_V2.md`
2. `docs/PAGE_PROBLEM_MATRIX_V2.md`
3. `docs/TASK_EXECUTION_PROTOCOL_V1.md`

如果任务会改变 KPI 展示数量、隐藏 KPI、引入新的 UI 层级标签，必须输出 `BLOCKED`，除非用户明确授权。

## 状态定义

- `LOCAL_IMPLEMENTED`：代码或文档已在本地完成，但未完成本地验收。
- `LOCAL_VALIDATED`：本地验收脚本、lint、build 或指定验证已通过。
- `PUBLIC_DEPLOYED`：已经部署到公网 IP 环境，但不等于完成业务回归。
- `SERVER_ALIGNED`：服务器运行版本已与本地目标版本完成哈希或行为对齐，并通过必要公网检查。

上述四个旧执行标签仍可用于 Legacy V1 历史记录；新产品阶段必须使用 `docs/project/STATUS_MODEL_V1.json`。尤其不得用一个 `PASS` 代替 `STATIC_SHELL`、`DATA_BOUND`、`LOCAL_E2E_PASS`、`VISUAL_ACCEPTED`、`PREVIEW_DEPLOYED`、`HUMAN_ACCEPTED` 或 `PUBLIC_ALIGNED`。

不得混用状态：

- 只有本地 PASS，不得说“已上线”。
- 只有部署成功，不得说“公网回归 PASS”。
- 只有公网页面 200，不得说“数据链路 PASS”。
- 只有 Git 工作树存在文件，不得说“baseline 已提交”。

## 跨层修改检查

执行前必须填写：

| check | answer |
|---|---|
| primaryLayer | 待填写 |
| secondaryLayers | 待填写 |
| modifiesETL | yes / no |
| modifiesBI | yes / no |
| modifiesTarget | yes / no |
| modifiesUI | yes / no |
| modifiesPersistence | yes / no |
| needsDeploy | yes / no |
| needsPublicRegression | yes / no |
| needsUserCheck | yes / no |

判定规则：

1. UI 任务如果需要改 ETL / BI / Target，必须拆任务。
2. Target 任务如果需要改 BI 公式，必须先做公式确认。
3. Persistence 任务不得改变 runtime dataset schema，除非任务名称明确授权。
4. Deploy 任务不得顺手改业务代码。
5. Audit / Docs 任务不得修改 `app/**`、`components/**`、`lib/etl/**`、`lib/bi/**`、`lib/persistence/**`。
6. UI 任务不得把全量 KPI 网格回退为 5 KPI、`Hidden KPI chip`、`L1` / `L2` / `L3` / `L4` 或 `Primary` / `Secondary` / `Hidden` 主页面文案，除非用户明确授权。

## 每个任务输出必须包含

1. 修改文件。
2. 新增文件。
3. 是否修改 ETL。
4. 是否修改 BI。
5. 是否修改 Target。
6. 是否修改 UI。
7. 是否修改 persistence。
8. 是否部署。
9. 是否公网回归。
10. 是否需要人工核查。

## 默认禁止路径

除非任务明确授权，否则禁止修改：

- `app/**`
- `components/**`
- `lib/etl/**`
- `lib/bi/**`
- `lib/persistence/**`
- `lib/storage/**`
- `lib/tmall/**`
- `lib/v05/**`
- `package.json`
- `package-lock.json`
- `vercel.json`
- `.vercel/**`
- `private-samples/**`

## 数据口径保护

- ETL 只负责结构化，不负责指标解释。
- BI 是唯一指标解释层。
- DOMAIN 只做 platform / store / series / product 维度分组。
- UI 只做展示和交互，不重新定义指标。
- Target 只作为 overlay，不改变真实实际值。
- IA 只做展示分层，不参与计算。

## 部署和公网回归要求

需要部署时必须单独执行 Deploy 任务，并至少确认：

1. SSH BatchMode PASS。
2. rsync 排除 `.git`、`node_modules`、`.vercel`、`private-samples`、Excel / CSV / key 文件。
3. 远端 `npm ci` PASS。
4. 远端 `npm run build` PASS。
5. PM2 online。
6. Nginx active。
7. 3000 仅监听 `127.0.0.1`。
8. 公网页面 200。
9. 不出现 `NaN` / `Infinity` / `undefined`。
10. 不泄漏敏感字段。
11. 部署源必须是 clean Git commit，禁止 dirty worktree rsync 后宣称 `PUBLIC_ALIGNED`。
12. 部署证据必须记录 commit SHA、SSOT/schema version 和 UI version。
13. 如服务器无法提供部署 commit，只能记录 `PUBLIC_HEALTH_PASS_COMMIT_UNKNOWN`。
14. 后续应新增只读 build identity；本协议不把该建议冒充为已实现能力。

## Git Baseline 敏感扫描要求

Git baseline readiness gate 后续优先运行当前 final baseline validator：

```bash
npx tsx scripts/private-audit/validate-project-execution-guardrails-current-state-v1.ts
npx tsx scripts/private-audit/validate-ui-baseline-lock-current-state-v1.ts
npx tsx scripts/private-audit/validate-git-baseline-sensitive-scan-policy-v2.ts
```

`validate-git-baseline-sensitive-scan-policy-v1.ts` 保留为历史脚本，不再作为当前 baseline 阻断依据。

以下历史阶段 validator 只用于复查当时阶段，不再作为当前 final baseline 阻断依据：

- `scripts/private-audit/validate-project-execution-guardrails-v1.ts`
- `scripts/private-audit/validate-ui-baseline-lock-after-restore-full-kpi-grid-v1.ts`

当前 final baseline 已经是 `human_review_pass` / `PUBLIC_DEPLOYED = true` / `SERVER_ALIGNED = true` 时，必须使用 current-state validator，不能再用 local-only 或 waiting-public-deploy 预期误判当前状态。

`next-env.d.ts` 是 Next.js 生成文件。如果 Git baseline 前只出现 `./.next/types/routes.d.ts` 与 `./.next/dev/types/routes.d.ts` 的路径噪声，必须先还原 `next-env.d.ts`，不得把该生成噪声纳入 baseline commit。

V2 扫描策略必须保持：

1. 真实密钥、真实 token/password、SSH 私钥正文仍为 `HARD_BLOCK`。
2. `private-samples/**`、真实 Excel / CSV、`.vercel/**`、package / vercel / storage / tmall / v05 变更仍为 `HARD_BLOCK`。
3. `docs/agents/**`、`docs/skills/**`、`AGENTS.md`、协议文档中的安全禁止项说明归为安全上下文，不得误判为真实泄漏。
4. `scripts/private-audit/**` 中的负向断言、扫描规则、禁止词列表归为安全上下文，不得误判为真实泄漏。

## 人工核查触发条件

以下情况必须输出 `needs_user_check`：

1. 页面视觉主观体验需要用户确认。
2. 指标公式需要业务口径确认。
3. 页面问题矩阵中 currentStatus 为 `needs_user_check`。
4. 任务要求“是否好看、是否易懂、是否符合使用习惯”。
5. 任何本地验证无法证明真实业务满意度的情况。
