# V2 Home Public Preview Deployment Handoff

## Current Gate

- Task: `V2_HOME_PREVIEW_REMOTE_DEPLOY_AND_PUBLIC_HUMAN_REVIEW_GATE_V1`
- State: `BLOCKED`
- Branch: `feature/saas-ui-v2-shell`
- Initial HEAD: `803f7c19ec1c6a1affdcd6623f67b6f2de97b8bc`
- Initial divergence: behind `0`, ahead `7`
- Initial working tree: clean

## Task Meaning

Deploy only the already data-bound `/v2/home` as a public preview, preserve legacy V1 as the frozen fallback, keep the other eight V2 routes as static shells, and stop before human visual acceptance.

## Evidence Gate

The governing SSOT, current-task record, V2 Home data contract, metric-semantic contract, route matrix, validator registry, local E2E evidence, visual-review hold, deployment agent/skills, and historical ECS evidence have been read. The exact Git and server facts must still be revalidated in this run.

## Reviewed Legacy Integration Exception

The unpushed `8b69e46` commit touches `components/upload/v1/upload-page-v1-dashboard.tsx` only to append safe skipped issue codes to the existing safe aggregate snapshot. It does not replace `/home`, alter legacy layout, retain original filenames/rows, or change ETL/BI/Target formulas. This exception remains subject to full legacy route and upload regression; any regression requires automatic rollback.

## Unsafe Shortcuts Avoided

- No deployment from the working tree.
- No server-side transfer of real samples.
- No force push, merge, rebase, or remote change.
- No whole-V2 deployment or acceptance claim.
- No visual or human acceptance inferred from screenshots or HTTP 200.

## Validation And Archive

All audit, local, Git, deployment, public browser, real-data, screenshot, and rollback evidence is written to this task directory. Final state must keep `visualAccepted=false`, `humanAccepted=false`, and `visualReviewStatus=PENDING_HUMAN_REVIEW`.

## Local Gate Result

- Sensitive Scan V2: PASS; hard blocks, real secrets, real samples, and forbidden paths are all zero.
- Current single-track/current-state validator: PASS (`24/24`).
- Real 18-file browser E2E: PASS (`17 success / 0 failed / 1 safe skipped`).
- Reconciled totals: GMV `125596`, GSV `85455.96`, visitors `143076`, paid buyers `128`, ad spend `7625.95`, clicks `6692`, refund `29602.18`.
- Missing metrics: refund-fee ratio `13.65%`; direct transaction share `63.4%`.
- Runtime, after-sales, target isolation, active-dataset persistence, debug-context persistence, and target-draft persistence: PASS.
- Textual-reference visual automation: PASS, but human visual acceptance remains pending.
- Lint: PASS with one existing warning. Build: PASS. Generated Git noise: none.

## Git And Deployment Source

- Ordinary Git push: PASS; force push was not used.
- Validated runtime commit on local and remote: `a293db7e75b14853d68d9711e131cc348d2f3ea0`.
- Post-push divergence: behind `0`, ahead `0`; working tree clean.
- Deployment source: exact `git archive` of the validated runtime commit.
- Extracted file count: `769`; forbidden files: `0`.
- Archive SHA-256: `8790c30cadcc7579cfdfe205d70e1e383b1e30ead30dd67045fdda5d9e2747b8`.

## Hard Blocker

SSH TCP port `22` is reachable, but the ECS closes the connection before SSH server identification and authentication. Thirteen BatchMode attempts, including the final post-push attempt with the explicit existing identity and `IdentitiesOnly=yes`, failed before any remote command ran.

Because the SSH deployment gate did not pass:

- No remote sync or release deployment ran.
- No remote `npm ci` or `npm run build` ran.
- PM2 and Nginx were not changed and cannot be revalidated honestly without SSH.
- No rollback is required because no remote mutation occurred.
- `PROJECT_SSOT.json` and `current-task.json` were not advanced to a deployed state.
- `previewDeployed=false`, `visualAccepted=false`, `humanAccepted=false`, and `visualReviewStatus=PENDING_HUMAN_REVIEW` remain authoritative.

## Pre-Deployment Public Health

The existing legacy public version remains reachable: `/home`, `/series-board`, `/store-board`, `/product-board`, `/upload`, `/upload/history`, and `/upload/quality` returned HTTP `200`. Public `/v2/home` returned HTTP `404`, which confirms the preview has not been deployed. Public port `3000` remained unreachable.

## Resume Point

Restore the SSH daemon banner and BatchMode access through Aliyun Workbench or VNC by checking `sshd`, connection-rate or `MaxStartups` limits, host firewall, and security controls. Then rerun this same deployment task from validated runtime commit `a293db7e75b14853d68d9711e131cc348d2f3ea0`; do not rebuild the product slice or advance visual acceptance first.
