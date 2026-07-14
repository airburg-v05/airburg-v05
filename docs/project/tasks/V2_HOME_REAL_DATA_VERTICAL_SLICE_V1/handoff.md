# V2 Home Real-Data Vertical Slice Handoff

Status: `LOCAL_E2E_PASS`. The next and only action is user full-page visual review.

## Completed Scope

Only `/v2/home` was moved from `STATIC_SHELL` to `DATA_BOUND` through
`lib/v2/home/v2-home-adapter.ts`. The remaining V2 routes are still static-shell
smoke targets and were not data-bound.

## Proven Loop

```text
real 18 files or restored active dataset
-> V0.5 domain identity + V1 metric compatibility adapter
-> 17 metric contract
-> target overlay
-> key-series GSV
-> MTD/DLY, range, comparisons
-> refresh restore
-> 1440/390 Browser E2E
-> reference comparison and iteration
-> pending human full-page acceptance
```

## Hard Rules

1. One adapter boundary; no direct multi-layer reconciliation in the page.
2. No ETL, BI formula, Target formula, or persistence-schema changes.
3. No edits to Legacy V1.
4. No data binding for any other `/v2/*` route.
5. No deployment or push.
6. Missing/unimplemented metrics show `--`, never synthetic zero.
7. `brandKeywordPaidShare` is not `geoSearchShare` under a new label.
8. Target drafts remain an overlay and never enter runtime data.

## Evidence

- Real 18-file import: `17 success / 0 failed / 1 safe skipped`.
- Reconciled GMV/GSV: `125596 / 85455.96`.
- Refresh, close/reopen, target overlay, context, and key-series restore: `PASS`.
- Round 1 manifest: `/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-v2-home-round1-YpN1fL/manifest.json`.
- Final candidate manifest: `/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-v2-home-round2c-3U0UvR/manifest.json`.
- 390px page-wide overflow: `false`; console business errors: `0`.
- Invalid numeric and sensitive text findings: `0`.

## Current Limits

1. `visualAccepted = false` and `humanAccepted = false` until the user reviews the full page.
2. Stage B commits are local only. Do not push them.
3. Do not deploy V2.
4. Do not start Store, Series, Product, Upload, Data Health, Target Center, Search Assets, or Exclusion Rules binding.
5. `VALIDATOR_REGISTRY.json` was not modified because it is outside this task contract's allowed paths; register the validator in a separate governance task.

## Local Review

Open `http://127.0.0.1:3010/v2/home` and review the complete page, wording,
interactions, chart semantics, and business hierarchy. Stop after reporting the
review result; no next page or deployment is authorized.
