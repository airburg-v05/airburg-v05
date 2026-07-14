# V2 Home Real-Data Vertical Slice Handoff

Status: `LOCAL_E2E_PASS` with textual-reference visual refinement complete.
Visual status remains `PENDING_HUMAN_REVIEW`. The next and only action is user
full-page visual review.

Latest validated executable commit:
`8b69e46fee532379be5f5f0b2ef4fe44c87a87aa`.

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
3. Legacy V1 remains frozen except for the post-task safe skipped-summary bridge; it does not change layout, ETL, BI, targets, or persistence schema.
4. No data binding for any other `/v2/*` route.
5. No deployment or push.
6. Missing/unimplemented metrics show `--`, never synthetic zero.
7. `brandKeywordPaidShare` is not `geoSearchShare` under a new label.
8. Target drafts remain an overlay and never enter runtime data.

## Evidence

- Real 18-file import: `17 success / 0 failed / 1 safe skipped`.
- V2 Home data-health safe skipped count: `1`.
- Multi-month target behavior: single-month target drafts are not reused; target values show `--` until the range returns to one month.
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
2. Current V2 Home commits are local only. Do not push them without a separate explicit push task.
3. Do not deploy V2.
4. Do not start Store, Series, Product, Upload, Data Health, Target Center, Search Assets, or Exclusion Rules binding.
5. The post-task governance reconciliation has aligned `VALIDATOR_REGISTRY.json`, current task state, the SSOT schema, the status model, and the data contract. See `autonomous-e2e-reconciliation-v1.md`.
6. Do not treat the generated screenshots or contact sheets as
   `VISUAL_ACCEPTED`; explicit user review is still required.
7. Archived static-shell validators may still reject this later authorized Home slice. Completed current validators now inspect their recorded task range, so unrelated future edits no longer create a false scope failure.

## Local Review

Open `http://127.0.0.1:3010/v2/home` and review the complete page, wording,
interactions, chart semantics, and business hierarchy. Stop after reporting the
review result; no next page or deployment is authorized.
