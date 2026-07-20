# handoff

Current state:

- Local implementation, remote deployment, and public 18-file E2E validation are complete.
- The obsolete single-source SSH security-group rule was updated only to the current legitimate source as `/32`; the address is intentionally not versioned.
- The deployed runtime is exact implementation commit `de1a65feafe7f83d678654ccf77d448aa2c71159`.
- `visualAccepted=false` and `humanAccepted=false` remain closed.

Next gate:

1. Open `http://123.57.49.121/v2/home` and complete the owner visual review.
2. Keep the other eight V2 routes classified as static shells until separately authorized and data-bound.
3. Do not convert technical, route, or browser PASS into `VISUAL_ACCEPTED` or `HUMAN_ACCEPTED`.

Do not redo locally unless the code changes again:

- `validate-tmall-plan-level-ad-plan-regression-v1`: already PASS
- `validate-tianmao-v1-refactor-pipeline-v2`: already PASS
- `validate-tmall-real-data-metric-reconciliation-v1`: already PASS
- `validate-v2-home-upload18-system-chrome-local-v1`: already PASS
- `npm run build`: already PASS

Deployment and rollback evidence are recorded in `DEPLOYMENT_EVIDENCE_20260720.json`.

Dispatch rule for later turns:

- Treat the 2026-07-20 deployed-state handoff, `docs/project/PROJECT_SSOT.json`, and `docs/project/current-task.json` as the current authority.
- Do not redispatch SSH recovery for this slice.
- Do not redispatch upload18 deployment for this slice.
- Reopen either route only if newer direct owner instruction or newer contradictory runtime evidence appears.
