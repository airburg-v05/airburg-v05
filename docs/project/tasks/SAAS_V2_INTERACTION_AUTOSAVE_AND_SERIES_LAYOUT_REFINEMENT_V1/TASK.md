# Task

Task ID: SAAS_V2_INTERACTION_AUTOSAVE_AND_SERIES_LAYOUT_REFINEMENT_V1

Status: PUBLIC_E2E_55_OF_55_PASS_PENDING_POST_DEPLOY_OWNER_REVIEW

## Objective

Make the active SaaS V2 dashboard faster and clearer to operate without changing imported facts or BI formulas.

## In Scope

- Make a Home metric-card click select the same primary metric in the shared operating trend.
- Ensure every visible commercial metric has a supported primary chart pairing.
- Change the visible daily trend label from `DLY` to `DAY` across Home, Series, Store and Product while retaining the internal `dly` data mode.
- Move custom date selection outside the Day/Week/Month segmented control so it does not render as a white segment after Month.
- Add brand-scoped browser-local target auto-save with refresh readback and explicit save status.
- Hide the target-center independence explainer and derived-target presentation while retaining the underlying target and derivation contracts.
- Improve selected-month target presentation.
- Remove the visible brand-series store-contribution breakdown and compact the Brand Summary / Store Drilldown lens control.
- Add focused source and browser regression coverage.

## Out of Scope

- ETL, raw upload, business metric formulas or runtime dataset schema changes.
- Cloud accounts, cross-device target synchronization or server-side tenancy.
- Deleting historical target records outside an explicitly cleared input in the current scope.
- Merge or automatic visual/business acceptance.

## Acceptance Evidence

- Clicking each supported Home metric card updates the chart primary selector and selected-card state.
- All 16 visible metrics resolve to a chart pair without inventing a metric value.
- `DAY` is visible and `DLY` is absent from active V2 trend controls on all four boards.
- Custom date remains interactive and no longer receives a white segmented-control active surface after Month.
- Target edits auto-save after a bounded debounce, reload from IndexedDB after refresh, and report dirty/saving/saved/error states.
- Clearing a saved target removes only that current metric/scope/month record; invalid non-empty values are not silently deleted.
- The target-center explainer and auto-derived display are absent, while required target inputs remain.
- The series contribution section is absent and the two analysis lenses remain understandable on desktop and mobile.
- TypeScript, lint, production build, focused validators and isolated browser regression pass locally.
