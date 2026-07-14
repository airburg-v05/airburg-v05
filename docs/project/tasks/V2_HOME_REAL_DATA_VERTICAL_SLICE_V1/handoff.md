# V2 Home Real-Data Vertical Slice Handoff

Status: `LOCAL_E2E_PASS` with textual-reference visual refinement complete.
Visual status remains `PENDING_HUMAN_REVIEW`. The next and only action is user
full-page visual review.

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
- Textual visual reference: `V2_HOME_TEXTUAL_VISUAL_REFERENCE_V1.md`.
- Visual analysis: `v2-home-visual-analysis-v2.md`.
- Round artifacts: `before-v2`, `visual-v2-round1`, `visual-v2-round2`, and
  `visual-v2-round3`; temporary paths are reported in the completion output and
  are not committed.
- Final measured layout: 4 regions, 103px toolbar, 6-column KPI matrix, 148px
  equal KPI cells, 147px key-series panel, and 398.3125px trend panel.
- 390px page-wide overflow: `false`; console business errors: `0`.
- Failed business requests: `0`.
- Invalid numeric and sensitive text findings: `0`.
- In-app Browser safe empty-state check: `PASS`, console errors `0`, overflow
  `false`; real 18-file acceptance remains the isolated Chrome/CDP run.

## Current Limits

1. `visualAccepted = false` and `humanAccepted = false` until the user reviews the full page.
2. Stage B commits are local only. Do not push them.
3. Do not deploy V2.
4. Do not start Store, Series, Product, Upload, Data Health, Target Center, Search Assets, or Exclusion Rules binding.
5. `VALIDATOR_REGISTRY.json` was not modified because it is outside this task contract's allowed paths; register the validator in a separate governance task.
6. Do not treat the generated screenshots or contact sheets as
   `VISUAL_ACCEPTED`; explicit user review is still required.
7. Archived static-shell and pre-commit-whitelist validators may reject this
   later authorized Home slice. Their runtime assertions were checked
   separately; the current task and real-data validators are authoritative.

## Local Review

Open `http://127.0.0.1:3010/v2/home` and review the complete page, wording,
interactions, chart semantics, and business hierarchy. Stop after reporting the
review result; no next page or deployment is authorized.
