# V2 Home Public Preview Deployment Handoff

## Current Gate

- Task: `V2_HOME_PREVIEW_REMOTE_DEPLOY_AND_PUBLIC_HUMAN_REVIEW_GATE_V1`
- State: `PRE_DEPLOY_AUDIT`
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
