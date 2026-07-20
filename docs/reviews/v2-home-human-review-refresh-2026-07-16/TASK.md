# V2 Home Human Review Refresh

## Objective

Refresh the current `/v2/home` preview reachability and visual evidence without changing product source code, running build or lint, deploying, or performing Git writes. Produce a human review packet that lowers owner review cost but does not replace owner acceptance.

## Project Ownership

- Primary project: `ecommerce-platform-optimized`
- Active track: `SAAS_UI_V2`
- Current task authority: `ECS_OUT_OF_BAND_SSH_RECOVERY_AND_RESUME_V2_HOME_PREVIEW_DEPLOY_V1`
- Current gate: `V2_HOME_HUMAN_VISUAL_REVIEW`

## Scope Classification

- Layer: `Audit` + `Docs`
- Risk class: `A1_REVERSIBLE`
- Product code changes: `no`
- Build or lint: `no`
- Deploy: `no`
- Git write: `no`

## Requested Deliverable

1. Confirm remote and local preview reachability.
2. Capture current remote desktop and mobile screenshots when reachable.
3. Record the real data precondition if the page requires the same browser to upload data first.
4. Reuse existing A/B/C concept-review assets as context only.
5. Preserve:
   - `visualAccepted = false`
   - `humanAccepted = false`
   - `visualReviewStatus = PENDING_HUMAN_REVIEW`

## Done Criteria

- Screenshot files are non-empty.
- Capture dimensions are explicit.
- Link, observed time, and data state are traceable.
- Local preview status is explicit.
- Owner reply contract is reduced to stable item IDs and a minimal response format.
