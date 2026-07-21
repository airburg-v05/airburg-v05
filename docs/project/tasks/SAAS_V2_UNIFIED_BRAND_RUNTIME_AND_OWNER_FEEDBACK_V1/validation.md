# Validation

Status: `PUBLIC_E2E_PASS_PENDING_POST_DEPLOY_OWNER_REVIEW`

Passed local gates:

- Airburg data-dashboard gate manifest: `PASS`.
- TypeScript: `npx tsc --noEmit` PASS.
- Lint: `npm run lint` PASS with 0 errors and 2 pre-existing unused-variable warnings outside this task.
- Production build: `npm run build` PASS with 27 static routes, including `/v2/brand-settings`.
- Unified brand/runtime and related V2 contract validators: PASS.
- XLSX/security validator: PASS; 0 high/critical advisories, 2 known upstream Next/PostCSS moderate advisories with low current exposure.
- Isolated production system-Chrome regression: 40/40 PASS on desktop and 390px mobile.
- Clean state: no operating data before upload and no operating data after isolated cleanup.
- Upload: 18/18 success for the first store and 18/18 success for the appended second store.
- Aggregation: GMV `125596` for one store and `251192` for two stores; active Append plus audit-only Replace snapshots visible.
- Shared runtime: home, series, store, product, data-health and import-history all read the active snapshot.
- Targets: brand target save/read/pause/reactivate passed before operating upload.
- Series: six configured, five selected for home, selected series rendered in the KPI section.
- Interactions: custom range, YoY, MoM, metric selection/order persistence and reset passed.

Evidence:

- `artifacts/local/unified-runtime-production-2026-07-21/summary.json`
- `artifacts/local/unified-runtime-production-2026-07-21/upload-desktop.png`
- `artifacts/local/unified-runtime-production-2026-07-21/v2-home-desktop.png`
- `artifacts/local/unified-runtime-production-2026-07-21/v2-home-mobile.png`

Passed deployment and public gates:

- Deployed exact implementation commit: `52cff7bc753743a6aca303c79adfcd1b6b2d29d0`.
- Release: `/opt/airburg/releases/saas-v2-unified-runtime-52cff7b-20260721T173216`.
- Rollback PM2 snapshot: `/opt/airburg/rollback/airburg-tmall-v1-pre-saas-v2-unified-runtime-52cff7b-20260721T173216.pm2.json`.
- Remote dependency install and production build: PASS.
- PM2 `airburg-tmall-v1`: online, restart count stable at 8 after public regression.
- Nginx: active and `nginx -t` PASS.
- Node bind: `127.0.0.1:3000` only.
- Public port 3000: TCP was accepted upstream but returned no HTTP bytes and timed out; the application did not serve a response.
- Public route matrix: 11/11 HTTP 200.
- Public isolated system-Chrome regression: 40/40 PASS, 18/18 Replace plus 18/18 Append, GMV `125596` to `251192`, two snapshot rows, desktop/mobile safe.
- PM2 error-log size: unchanged at 4374 bytes.

Public evidence:

- `artifacts/public/unified-runtime-public-52cff7b-2026-07-21/summary.json`
- `artifacts/public/unified-runtime-public-52cff7b-2026-07-21/upload-desktop.png`
- `artifacts/public/unified-runtime-public-52cff7b-2026-07-21/v2-home-desktop.png`
- `artifacts/public/unified-runtime-public-52cff7b-2026-07-21/v2-home-mobile.png`

Non-gate observation:

- `validate-project-execution-guardrails-current-state-v1.ts` still requires several historical page-matrix rows to be `human_review_pass`. It is not used to claim this task passed because satisfying it would contradict the required open owner-review gate.

Owner gates remain:

- `visualAccepted=false`
- `humanAccepted=false`
