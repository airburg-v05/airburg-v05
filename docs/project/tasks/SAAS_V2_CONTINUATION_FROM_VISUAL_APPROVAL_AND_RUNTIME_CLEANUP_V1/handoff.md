# handoff

Status: `PENDING_POST_DEPLOY_OWNER_REVIEW`

This task supersedes the old “wait for /v2/home owner review only” execution path as the current implementation task, but it does not reopen the already completed upload18 deployment work.

Current scope:

- Record `/v2/home` direction acceptance as implementation authority.
- Rebuild the SaaS UI V2 gap matrix.
- Continue the next authorized V2 route slices.
- Inventory obsolete runtime artifacts and record externally executed cleanup evidence without repeating it.
- Validate and deploy only the changed authorized slices.

Current implemented continuation slices:

- `/v2/series-board`
- `/v2/store-board`
- `/v2/product-board`
- `/v2/upload`
- `/v2/upload/history`
- `/v2/data-health`
- `/v2/target-center`
- `/v2/search-assets`
- `/v2/exclusion-rules`
- `/v2/home` metric settings / visible-metric selection / ordering persistence

Current checked route-boundary result:

- The V2 upload/data-health/target-center flow now stays inside `/v2/*`.
- `/v2/upload` no longer mounts the legacy fixed full-screen overlay or V1 sidebar/topbar.
- The V2 page-header return link now points to `/v2/home`, removing the last checked legacy cross-page leak from this slice.
- `/v2/home` empty-state CTA now points to `/v2/upload`.
- `/v2/search-assets` is now a real configuration surface backed by the existing browser-stored brand/center-word configuration path.
- `/v2/exclusion-rules` no longer shows fake inputs or mock rules; it stays explicitly `BLOCKED_BY_MISSING_CONTRACT`.
- Real local system Chrome upload18 regression now proves `/v2/home` metric settings keep the historical behavior: default 17 metrics, subset persistence after refresh, ordering persistence after refresh, and reset-to-default recovery.
- Persisted upload18 local evidence screenshots now live in `docs/project/tasks/SAAS_V2_CONTINUATION_FROM_VISUAL_APPROVAL_AND_RUNTIME_CLEANUP_V1/artifacts/upload18-local-2026-07-20/` (`upload-desktop.png`, `v2-home-desktop.png`, `v2-home-mobile.png`).

Deployment closure:

- Active deployed commit: `5aa2c76`
- Synced release package path: `/opt/airburg/releases/v2-layout-copy-5aa2c76-20260720T212240`
- Active PM2 runtime: `airburg-tmall-v1` with `cwd=/opt/airburg/ecommerce-platform-optimized`
- PM2 rollback snapshots:
  - `/opt/airburg/rollback/airburg-tmall-v1-pre-saas-v2-continuation-1065ddb-20260720T211209.pm2.json`
  - `/opt/airburg/rollback/airburg-tmall-v1-pre-appdir-switch-1065ddb-20260720T211233.pm2.json`
  - `/opt/airburg/rollback/airburg-tmall-v1-pre-v2-layout-copy-5aa2c76-20260720T212240.pm2.json`
- Nginx remains active and config-valid.
- Port `3000` remains loopback-only on `127.0.0.1`; public `123.57.49.121:3000` remained unreachable during timed curl verification.
- Previous runtime commit `1065ddb92805ea7413ca57573f5c249e8d531610` retains the last full public upload18 regression under `docs/project/tasks/SAAS_V2_CONTINUATION_FROM_VISUAL_APPROVAL_AND_RUNTIME_CLEANUP_V1/artifacts/public-regression-2026-07-20/`.
- Final runtime commit `5aa2c76` passed the owner-requested light public copy review: ten authorized public routes returned HTTP 200; screenshots were saved under `docs/project/tasks/SAAS_V2_CONTINUATION_FROM_VISUAL_APPROVAL_AND_RUNTIME_CLEANUP_V1/artifacts/public-copy-refresh-5aa2c76-2026-07-20/`; `/v2/home` empty-state CTA `/v2/upload` remained correct.

Open owner gate:

- New route work remains `PENDING_POST_DEPLOY_OWNER_REVIEW` after technical validation and deployment.

Deletion / browser-state note:

- External evidence now confirms that, in 宗骥 current Chrome at `http://123.57.49.121`, `airburg-runtime-dataset-v1` and `airburg-debug-context-v1` were already deleted.
- Retained objects remain: `airburg-target-drafts-v1`, `airburg-v05`, `airburg:demo-session`, source code, Git, release/rollback materials, original 18 source files, and audit evidence.
- After that cleanup, refreshing `/v2/home` showed `当前尚未导入经营数据`.
- The latest local continuation validators now confirm `/v2/home` empty-state CTA uses `/v2/upload`; this preserves the V2 workspace boundary without promoting all V2 routes to full data-bound status.
- This task repeated the same cleanup requirement after the public regression. Evidence in `artifacts/public-regression-2026-07-20/cleanup-proof.json` proves:
  - before cleanup in the regression browser context: `airburg-runtime-dataset-v1` record counts were `runtimeDatasetActivePointer=1`, `runtimeDatasetSnapshots=1`; `airburg-debug-context-v1` record count was `debugContext=1`
  - after cleanup: those three record counts were all `0`
  - preserved objects stayed present: `airburg-target-drafts-v1`, `airburg-v05`, `airburg:demo-session`
  - refreshed public `/v2/home` returned to empty state and CTA `/v2/upload`
  - the application recreates empty IndexedDB shells for the cleared runtime/debug databases on page load, so database names may still appear even though persisted records are zero
- The later copy-only runtime commit `5aa2c76` did not reopen public upload18; it only required the owner-specified light route/screenshot verification. The prior real-data cleanup evidence therefore remains authoritative for the runtime data path, while the final copy commit adds new screenshots and route smoke only.
