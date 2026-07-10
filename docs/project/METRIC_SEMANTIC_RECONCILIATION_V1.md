# Metric Semantic Reconciliation V1

Machine-readable decision: `docs/project/METRIC_SEMANTIC_RECONCILIATION_V1.json`.

## The Conflict

The current V1 metric named `geoSearchShare` is calculated as:

```text
brand keyword paid buyers / total paid buyers
```

Its target denominator is also a total paid-buyer target, derived as `GMV target / average-order-value target`.

The requested SaaS V2 metric is different:

```text
brandKeywordPaidShare
= brand keyword paid buyers / total search-keyword paid buyers
```

The denominators represent different populations. Therefore the values cannot share a metric key and the old value cannot be relabeled.

## Locked Decision

1. Keep `geoSearchShare` as the legacy V1 metric.
2. Add a future independent key `brandKeywordPaidShare`.
3. Mark the new key `PENDING_IMPLEMENTATION` until the single V2 adapter implements its numerator and denominator from search keyword data.
4. Display `--` when the search-keyword denominator is missing or non-positive.
5. Do not provide a target for the new metric yet. A total-search-keyword-paid-buyers target contract does not exist.
6. Do not modify BI or target formulas in this governance task.

## Migration Risk

The highest-risk shortcut is changing the UI label while continuing to supply `geoSearchShare`. The V2 home contract explicitly forbids that shortcut.

