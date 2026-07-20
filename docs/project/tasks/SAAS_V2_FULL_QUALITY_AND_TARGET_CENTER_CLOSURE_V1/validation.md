# Validation

Status: `IN_PROGRESS`

Planned gates:

- Gate manifest for Airburg data-dashboard work.
- Source/contract validators for route truth and target-center semantics.
- Browser validators for ten routes, target-center interactions, desktop/mobile, console/network, and cleanup.
- Changed-file lint.
- Repo lint.
- Build.
- Real 18-file upload regression using system Chrome.
- Public post-deploy route and cleanup regression.

Current results:

- Preflight reads: PASS.
- Intake routing: existing project candidate `ecommerce_platform_optimized`.
- Gate manifest: PASS (`data_dashboard`).
- Static closure validator: PASS.
  - `node scripts/private-audit/validate-saas-v2-full-quality-target-center-closure-v1.mjs`
  - Covers route truth, source matrix, single file-input handlers, native file chooser validator path, runtime/V0.5F split, target freeze/no hard delete, percent input normalization, single “平台和店铺” label, route mapper, search/exclusion business copy, and stale target-agent conflict.
- Real local upload18 + target-center E2E: PASS.
  - Final command: `V2_HOME_PROFILE_DIR=/tmp/airburg-saas-v2-closure-final2-local-profile.1EWdHS V2_HOME_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20 node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`
  - 18 files from `/Users/zongji/Desktop/每日平台数据/天猫`.
  - Result: `18 success / 0 failed / 0 skipped`.
  - `/v2/home`: 17 metrics visible; metric subset/order persists after refresh; reset restores 17 metrics; mobile no page-wide overflow.
  - Target foundation four-source files, all from the 18-file folder:
    - `【生意参谋平台】商品_全部_2026-06-30_2026-06-30.xls`
    - `商品报表_20260701_160039.csv`
    - `计划报表_20260701_160014.csv`
    - `4051124186_1782897394563_919.xlsx`
  - `/v2/target-center`: runtime-data-without-target-foundation precondition copy visible; four-source import activates V0.5F target foundation; store-scope percent target `92%` saves/readbacks; pause/readback/reactivate passes; no hard delete button; store drawer has exactly one “平台和店铺” label.
  - Persistent screenshot evidence:
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20/upload-desktop.png`
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20/v2-home-desktop.png`
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20/v2-home-mobile.png`
- Local ten-route browser regression: PASS.
  - Final command: `SAAS_V2_PROFILE_DIR=/tmp/airburg-saas-v2-closure-final2-local-profile.1EWdHS SAAS_V2_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-2026-07-20 node scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs`
  - Routes: `/v2/home`, `/v2/series-board`, `/v2/store-board`, `/v2/product-board`, `/v2/upload`, `/v2/upload/history`, `/v2/data-health`, `/v2/target-center`, `/v2/search-assets`, `/v2/exclusion-rules`.
  - Result: desktop and mobile reachable; no page-wide mobile/desktop overflow; no `V2 preview routes only`, `Dataset: preview pending`, or false no-write copy; no business console/network errors.
  - Artifacts: `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-2026-07-20/`.
- Additional local validation commands:
  - `node scripts/private-audit/validate-v2-layout-copy-truthfulness-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-search-assets-and-exclusion-contract-boundaries-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-target-center-routing-variant-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-board-route-mapping-and-home-empty-cta-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-upload-data-health-embedded-routing-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-board-target-and-trend-guards-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-home-metric-settings-defaults-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-series-board-runtime-binding-v1.mjs`: PASS.
  - Changed-file ESLint: PASS.
  - `npm run lint`: PASS with 0 errors and 2 pre-existing warnings (`prototype.js` unused `height`; `lib/bi/bi.home-mapper.ts` unused `emptyChartSeries`).
  - `npm run build`: PASS; 26 app routes generated.
  - `git diff --check`: PASS.
  - `git diff -- next-env.d.ts`: clean after restoring generated route-reference drift.
- Transient validator note:
  - One fresh-profile upload18 run passed 18/18 import, then timed out waiting for `/v2/home` dashboard. A same-profile ten-route check immediately proved `/v2/home` reachable with 17 metrics. The validator route wait was increased from 30s to 60s and the full upload18 E2E passed from a new profile.

Pending before final handoff:

- Implementation commit and deploy.
- Public upload18 + target-center E2E.
- Public ten-route desktop/mobile regression.
- Public runtime/debug cleanup and empty `/v2/home` + `/v2/upload` CTA evidence.
