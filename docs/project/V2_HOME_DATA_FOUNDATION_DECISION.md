# V2 Home Data Foundation Decision

## Decision

`V05_DOMAIN_WITH_V1_METRIC_COMPATIBILITY_ADAPTER`

This is the only selected foundation for `V2_HOME_REAL_DATA_VERTICAL_SLICE_V1`.

## Why This Is The Only Viable Choice

| Decision criterion | V0.5 domain | V1 BI metric layer | Selected adapter outcome |
|---|---|---|---|
| Real 18-file reconciliation | Partial historical evidence | Current PASS | Preserve V1 metric computation |
| 17 home KPI coverage | Compact command-center subset | Current 17-KPI definition | Expose all 17 through one contract |
| Platform / store ownership | Explicit domain ownership | Filter state exists but is V1-specific | Use V0.5 ownership semantics |
| Key-series GSV | Series domain exists | Verified series/product filtering and GSV | Map stable series IDs to V1 metric projection |
| Target overlay | Hierarchical model exists | Required/derived/unsupported registry and drafts are verified | Adapt target output without changing actuals |
| Browser persistence | V0.5 repository contracts exist | Runtime/debug/target IndexedDB adapters are active | Hide both behind one adapter boundary |
| Future multi-platform expansion | Designed into domain | Primarily Tmall V1 | Keep platform/store identity in the contract |

## Rejected Alternatives

### `V05_VIEW_MODEL`

Rejected as the immediate V2 home source because the V0.5 view-model command centers are not mounted by the current board routes and do not independently prove the full 17-metric Tmall reconciliation.

### `V1_BI_VIEW_MODEL_VIA_V2_ADAPTER`

Rejected as the sole long-term foundation because it would carry forward V1-specific scope ownership and bypass the V0.5 platform/store/domain contracts needed for the intended SaaS track.

## Required Boundary

The next task must create one typed V2 home adapter/view model. The `/v2/home` page and its presentation components may consume only that boundary.

Forbidden:

1. The page directly importing V1 BI, V0.5 domain, runtime, target drafts, and persistence independently.
2. Selecting a different source per metric.
3. Recomputing formulas in React components.
4. Renaming an existing numeric value to satisfy a different metric definition.
5. Writing target overlay values into actual BI data or the runtime dataset.

## Adapter Responsibilities

1. Resolve active platform/store from V0.5-compatible domain identity.
2. Load or restore the existing safe active runtime dataset.
3. Invoke the existing V1 BI computation boundary for verified actual metrics.
4. Translate outputs to `docs/project/V2_HOME_DATA_CONTRACT.json` without changing formulas.
5. Apply target drafts as a separate overlay.
6. Expose explicit `UNAVAILABLE`, `PENDING_IMPLEMENTATION`, and `EXPECTED_EMPTY` states rather than synthetic zeros.
7. Expose data identity, dataset range, selected range, and restore status for browser E2E assertions.

## Current State

- Decision status: `SPEC_APPROVED_BY_THIS_GOVERNANCE_GATE`.
- Adapter implemented: `false`.
- `/v2/home` data-bound: `false`.
- V2 status remains: `STATIC_SHELL`.
- Implementation entry gate: `V2_HOME_REAL_DATA_VERTICAL_SLICE_V1` after explicit user authorization.

