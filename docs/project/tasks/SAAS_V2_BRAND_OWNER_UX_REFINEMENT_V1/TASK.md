# TASK: SAAS_V2_BRAND_OWNER_UX_REFINEMENT_V1

Status: `IN_PROGRESS`

Created: `2026-07-21T00:00:00+08:00`

Primary owner: `ecommerce-platform-optimized`

Lead: `ecommerce_data_platform_lead`

Challenger lenses: `brand_product_owner`, `senior SaaS UX reviewer`

## Objective

从品牌负责人的真实使用视角，对已跑完数据与已部署的 SaaS V2 十页进行逐页体验收口：减少重复标题、内部治理语言、空态噪声和点击阻力；保持已经认可的克制白色、黑字、蓝色强调方向；不改变经营公式、ETL、18 文件语义、四源目标底座、目标合同、数据隔离与安全边界。

## Source of authority

- Latest direct instruction from 宗骥 on `2026-07-21`.
- `docs/project/PROJECT_SSOT.json`
- `docs/project/current-task.json`
- Previous closure task evidence:
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/validation.md`
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/result.md`
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/handoff.md`

## Allowed scope

- UI hierarchy, page density, user-facing copy, empty states, main navigation, modal usability, and browser validators for the existing ten V2 routes.
- Shared layout/components first; route-local changes only when the issue is route-specific.
- New validator and evidence artifacts under this task directory.
- Deployment to the existing Aliyun target after local validation.

## Forbidden scope

- Do not read secrets/token/cookie/password/private key.
- Do not change经营公式、ETL、18 文件语义、四源目标底座、目标合同、数据隔离或安全边界。
- Do not push or merge.
- Do not delete 宗骥当前浏览器中的真实经营数据或目标配置.
- Browser validation must use isolated profiles and clean only test runtime/debug state created in those profiles.
- Do not convert automated PASS into 宗骥 visual/human acceptance.
- Do not expand into AI 顾问, non-Tmall real adapters, activity targets, upload overwrite/version rollback, or new business boards.

## Done criteria

- Issue matrix records the owner-provided ten-page live UX audit as evidence.
- Main UI no longer shows duplicate workspace hero on second-level pages.
- Business pages no longer expose developer/internal status terms such as `BLOCKED_BY_MISSING_CONTRACT`, `V0.5F`, `schema`, `mock`, route paths, snake_case, or safe issue codes.
- `/v2/exclusion-rules` is hidden from main nav; direct route remains a concise planned-state business page without fake controls.
- Empty series/store/product boards do not render full blank KPI/trend/table stacks.
- `/v2/home` KPI cards without target use a compact target state instead of four repeated `--` target fields.
- `/v2/search-assets` presents usable configuration only, and its edit modal has a focused one-group flow with fixed header/footer, scrollable content, no duplicated group cards/actions/chips, and footer buttons visible on 390x844.
- Desktop and 390px mobile have no horizontal overflow; buttons and modal footer stay reachable.
- Local validators, lint, build, 18+4+target, and ten-route browser regression PASS.
- New clean implementation commit is deployed to Aliyun; public isolated-profile ten-route and key-click regression PASS.
- PM2/Nginx/loopback/public port 3000/log delta PASS.
- SSOT/current-task/validation/result/handoff updated; evidence commit created; final working tree clean.
- Final status remains `PENDING_POST_DEPLOY_OWNER_REVIEW`, with `visualAccepted=false` and `humanAccepted=false`.
