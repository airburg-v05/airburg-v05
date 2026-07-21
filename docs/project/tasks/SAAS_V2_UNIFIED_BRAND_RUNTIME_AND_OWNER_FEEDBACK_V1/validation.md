# Validation

Status: `LOCAL_PASS_PENDING_PUBLIC_DEPLOYMENT`

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

Pending gate:

- Controlled public deployment, service checks and public browser regression.

Owner gates remain:

- `visualAccepted=false`
- `humanAccepted=false`
