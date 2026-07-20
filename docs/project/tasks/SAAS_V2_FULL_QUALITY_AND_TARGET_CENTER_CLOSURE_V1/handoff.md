# Handoff

Status: `XLSX_0203_LOCAL_PASS_DEPLOY_PENDING`

Current next action for Codex:

- Create the xlsx0203 implementation commit.
- Deploy it through the existing Aliyun release flow.
- Run public 18+4+target, ten-route, cleanup, and service/log checks.
- Then update SSOT/result/validation/handoff to `PENDING_POST_DEPLOY_OWNER_REVIEW`.

Current next action for 宗骥 after deployment:

- Open `http://123.57.49.121/v2/home` and complete final post-deploy owner review.
- Owner acceptance is not auto-written.

Xlsx0203 local status:

- Direct dependency `xlsx` now uses official SheetJS 0.20.3 CDN tarball.
- Local xlsx security validator PASS; xlsx high/critical audit findings are gone.
- Remaining Next/PostCSS moderate findings are recorded as `BLOCKED_BY_UPSTREAM_STABLE_FIX_LOW_CURRENT_EXPOSURE`; do not force downgrade, canary/preview upgrade, or override Next internal PostCSS.
- Local same-profile browser regression PASS:
  - `18 success / 0 failed / 0 skipped`
  - V0.5F four-source target foundation PASS
  - target-center save/readback/pause/reactivate PASS
  - ten V2 routes desktop/mobile PASS
  - post-regression runtime/debug cleanup PASS
- Local artifact dirs:
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-xlsx0203-final-2026-07-20/`
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-xlsx0203-final-2026-07-20/`

Previous deployed implementation before xlsx0203 continuation:

- Commit: `bf76c174d12f1bc27b7ca73b9603df4cfa1c8f4a`
- Release: `/opt/airburg/releases/saas-v2-home-boundary-bf76c17-20260720T232834`
- Active app path: `/opt/airburg/ecommerce-platform-optimized`
- Rollback material: `/opt/airburg/rollback/airburg-tmall-v1-pre-saas-v2-home-boundary-bf76c17-20260720T232834.pm2.json`
- Public URL: `http://123.57.49.121/v2/home`

Local evidence already captured:

- Upload18 and `/v2/home` screenshots:
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20/upload-desktop.png`
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20/v2-home-desktop.png`
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20/v2-home-mobile.png`
- Ten-route local screenshots and summary:
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-2026-07-20/`
- Hash fallback local evidence:
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-hash-fallback-2026-07-20/`
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-hash-fallback-2026-07-20/`

Public root-cause note:

- `http://123.57.49.121/v2/upload` was confirmed as `isSecureContext=false` with `crypto.subtle=false`; prior public SHA `56a6369` failed V0.5F four-source import after upload18 succeeded. The fix is the shared SHA-256 provider, not a timeout increase.
- Public cleanup boundary note: preserving `airburg-v05` is correct for the target foundation. `/v2/home` now intentionally does not use V0.5F target foundation as homepage runtime data after runtime cleanup.

Public evidence:

- Public upload18 + target-center:
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-public-bf76c17-2026-07-20/`
  - Result: `18 success / 0 failed / 0 skipped`; four-source target foundation import PASS; target save/readback/pause/reactivate PASS.
- Public ten-route + cleanup:
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-public-bf76c17-2026-07-20/summary.json`
  - Result: ten V2 routes desktop/mobile PASS; console/network business errors 0.
- Post-regression test-data cleanup:
  - Removed: `airburg-runtime-dataset-v1`, `airburg-debug-context-v1`, `airburg_tmall_analysis_v2`.
  - Preserved: `airburg-target-drafts-v1`, `airburg-v05`, `airburg:demo-session`.
  - Final `/v2/home`: empty state visible; CTA href `/v2/upload`.
- Service checks:
  - PM2 `airburg-tmall-v1` online.
  - Nginx active and `nginx -t` PASS.
  - 3000 only listens on `127.0.0.1`.
  - Public `:3000` not reachable.
  - PM2 error/out log new bytes after public regression: 0 / 0.

Important product boundaries:

- 18-file runtime upload and V0.5F target foundation are intentionally separate.
- Do not bridge runtime snapshots into `airburg-v05`.
- V0.5F target center supports new/edit/pause/reactivate only; no hard delete.
- Search-assets is a real current-browser configuration surface; exclusion-rules remains safe blocked without fake controls.
- AI 顾问, non-Tmall real adapters, activity targets, upload overwrite/version rollback remain out of scope.

Owner gates:

- `visualAccepted=false`
- `humanAccepted=false`
- `PENDING_POST_DEPLOY_OWNER_REVIEW`
