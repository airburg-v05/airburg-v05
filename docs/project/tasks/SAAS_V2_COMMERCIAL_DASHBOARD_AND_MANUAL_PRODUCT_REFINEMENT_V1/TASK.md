# Task

Task ID: `SAAS_V2_COMMERCIAL_DASHBOARD_AND_MANUAL_PRODUCT_REFINEMENT_V1`

Status: `OWNER_APPROVED_STABLE_VISUAL_BASELINE`

## Objective

Deliver a rollback-safe commercial refinement of the existing SaaS V2 dashboard, series, store, product and target surfaces without changing metric truth or fabricating business completion.

## In Scope

- Home metric display, metric settings, selected-series comparison and responsive layout.
- Store and product center operating indicator coverage.
- Manual brand-local product configuration and square image handling.
- Target month defaults, scope matching, range-aware overlays and empty guidance.
- Focused validators, local production build, browser regression and deployment to a new release.

## Out of Scope

- Raw business data edits, secret access or cross-device account storage.
- New marketplace integrations, permissions or organization tenancy.
- Commercial images, PPT work, push or merge.
- Automatic visual or business acceptance.

## Acceptance Evidence

- Unsupported brand-keyword paid-share is absent from home/series/store/product indicator surfaces.
- Home scope bar has no series switch; metric settings supports zero to five selected series and the same metrics region renders selected-series summaries.
- Sixteen default metrics form a balanced four-column desktop grid and a valid mobile layout.
- Store center uses the shared operating metric contract and correct store target scope.
- Product center is empty until a product is manually added, supports square image upload, and supports select/edit/delete cards.
- Target center defaults to the latest available operating-data month and boards do not apply mismatched months.
- Lint, TypeScript, production build, focused validators and public browser regression pass.
- A new release is deployed while the old release, rollback snapshot and Git rollback tag remain available.
