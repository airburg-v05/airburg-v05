# CONTEXT_PACK

## Latest direct request

2026-07-20 handoff truth:

- SSH root cause was the stale single-source TCP 22 security-group rule.
- The rule has already been updated only to the current legitimate management source as `/32`.
- Three post-deploy SSH checks passed.
- Exact deployed implementation commit: `de1a65feafe7f83d678654ccf77d448aa2c71159`.
- Remote `npm ci` / `npm run build` / PM2 / Nginx / `127.0.0.1:3000` binding / public `:3000` isolation / authorized routes all passed.
- Public real 18-file E2E passed with `18 success / 0 failed / 0 skipped`.
- `/v2/home` public state: `17` metrics, `0` business console/network errors.
- Current project state: `PENDING_POST_DEPLOY_OWNER_REVIEW`, `visualAccepted=false`, `humanAccepted=false`.
- Future agents must treat this handoff plus `docs/project/PROJECT_SSOT.json` and `docs/project/current-task.json` as authority.
- Future agents must not redispatch SSH recovery or upload18 deployment for this slice unless newer evidence reopens them.

## Primary owner

- `ecommerce-platform-optimized`

## Authority order

1. Latest direct owner handoff on 2026-07-20
2. `docs/project/PROJECT_SSOT.json`
3. `docs/project/current-task.json`
4. `docs/project/tasks/V2_HOME_UPLOAD18_AD_PLAN_LAYERING_AND_DEPLOY_GATE_V1/handoff.md`
5. Supporting deployment evidence in the same task folder

## Current gate

- Technical / deployment gate: PASS
- Public upload18 gate: PASS
- Human review gate: still open
- Next gate: `V2_HOME_HUMAN_VISUAL_REVIEW`

## Coverage gaps

- This recording turn did not rerun deployment, browser E2E, or SSH checks by direct instruction.
- This turn records and aligns truth only.

## Explicit no-redo boundary

- Do not reopen SSH recovery.
- Do not reopen upload18 deployment.
- Do not reinterpret technical/public PASS as `visualAccepted` or `humanAccepted`.
