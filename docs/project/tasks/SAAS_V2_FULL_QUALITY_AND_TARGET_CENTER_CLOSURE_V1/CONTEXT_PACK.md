# CONTEXT PACK

Authority order:

1. Latest direct user request on `2026-07-20`.
2. `docs/project/PROJECT_SSOT.json`.
3. `docs/project/current-task.json`.
4. Previous task result, validation, and handoff under `SAAS_V2_CONTINUATION_FROM_VISUAL_APPROVAL_AND_RUNTIME_CLEANUP_V1`.
5. Product blueprint, route matrix, target contracts, metric semantic contracts, validators, and current source.
6. Historical memory only as routing/failure context.

Governance used:

- `shiyu-unified-task-intake`
- `project-task-preflight`
- `public-requirements-research` policy check
- `airburg-execution-gatekeeper`
- `ecommerce_data_platform_lead`
- `PROACTIVE_EXECUTION_POLICY.yaml`

Task meaning:

This is for making the current Airburg SaaS V2 data platform coherent enough for a single owner review after deployment. The business purpose is not to produce a polished demo shell; it is to let the platform safely support operating decisions from the already trusted Tmall upload/runtime path while clearly marking gaps.

Evidence read:

- `AGENTS.md`
- `docs/project/PROJECT_SSOT.json`
- `docs/project/current-task.json`
- `docs/project/ROUTE_DATA_SOURCE_MATRIX.json`
- `docs/project/V2_HOME_DATA_CONTRACT.json`
- `docs/project/METRIC_SEMANTIC_RECONCILIATION_V1.json`
- `docs/product-blueprint-v2/AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2.md`
- previous task `result.md`, `validation-report.md`, and `handoff.md`
- Airburg shared data-platform gate rules and pitfall log

Directly observed current truth:

- Current active runtime commit recorded by prior task: `5aa2c76`.
- Previous full public upload18 evidence belongs to `1065ddb92805ea7413ca57573f5c249e8d531610`.
- Final public light route/copy evidence belongs to `5aa2c76`.
- Current SSOT still has conflicting fields: `routeCount=9`, `dataBoundRoutes=["/v2/home"]`, and `remainingStaticShellRouteCount=8`, while ten V2 routes exist and several are now connected through real adapters or explicit blocked states.

Autonomy level:

- A2 implementation and A3 deployment are authorized by the latest direct request.
- Owner gate remains open only for final human/visual acceptance.

Unsafe shortcuts avoided:

- Do not equate route HTTP 200 with feature completion.
- Do not equate target-management embedding with all target semantics being complete.
- Do not reuse one single-month target across multi-month periods.
- Do not leave public upload18 test data in the browser origin after regression.

Archive target:

- `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/`

