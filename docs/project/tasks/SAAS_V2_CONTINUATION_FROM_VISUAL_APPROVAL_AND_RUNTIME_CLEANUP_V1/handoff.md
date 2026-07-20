# handoff

Status: `IN_PROGRESS`

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

Open owner gate:

- New route work remains `PENDING_OWNER_REVIEW` after technical validation and deployment.

Deletion / browser-state note:

- External evidence now confirms that, in 宗骥 current Chrome at `http://123.57.49.121`, `airburg-runtime-dataset-v1` and `airburg-debug-context-v1` were already deleted.
- Retained objects remain: `airburg-target-drafts-v1`, `airburg-v05`, `airburg:demo-session`, source code, Git, release/rollback materials, original 18 source files, and audit evidence.
- After that cleanup, refreshing `/v2/home` showed `当前尚未导入经营数据`.
- The latest local continuation validators now confirm `/v2/home` empty-state CTA uses `/v2/upload`; this preserves the V2 workspace boundary without promoting all V2 routes to full data-bound status.
