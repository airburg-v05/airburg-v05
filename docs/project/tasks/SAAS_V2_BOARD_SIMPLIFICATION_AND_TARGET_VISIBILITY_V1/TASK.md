# Task

Task ID: `SAAS_V2_BOARD_SIMPLIFICATION_AND_TARGET_VISIBILITY_V1`

Status: `PENDING_POST_DEPLOY_OWNER_REVIEW`

## Outcome

Simplify the SaaS V2 series, store and product boards around one compact scope bar, decision metrics and a home-aligned trend surface. Make the home 17-metric area filterable by configured series, replace checkbox-heavy series maintenance with pasted product IDs, and make monthly targets visible for date ranges that cross month boundaries without inventing a single-month total.

## Allowed

- SaaS V2 home, series, store, product and compact page-header components.
- Brand-series browser-local configuration and V2 home adapter contracts.
- Target overlay range logic; metric formulas remain unchanged.
- Task evidence, validators, local build, controlled deployment and public regression.

## Forbidden

- Raw upload rows, secrets, cookies or browser-storage inspection.
- Fake JD/Douyin integration or claims of cloud multi-tenancy.
- Changes to verified metric formulas without primary evidence.
- Push, merge or automatic human/visual acceptance.

## Acceptance

- Series page has no redundant page header, return-home button or removed legacy sections.
- Series maintenance is compact and binds validated pasted product IDs.
- Selected series drives the same 17 metric contracts and chart controls as home.
- Home has no separate key-series block and exposes a series filter in the metric area.
- Store and product pages retain only compact scope, KPI and trend decision surfaces.
- A June target contributes to a `2026-06-29` through `2026-07-05` range by overlap; cross-month total target is not presented as one monthly total.
- YoY/MoM remains unavailable when reference-period data is absent.
- TypeScript, lint, build, focused validators and isolated browser regression pass before deployment.

## Owner Gate

`PENDING_POST_DEPLOY_OWNER_REVIEW` after technical and public validation.
