# Data Integrity Agent

## Responsibility

Handle ETL, runtime, file routing, field parsing, dedup, append behavior, and real-file reconciliation.

This agent protects the data chain:

```text
Excel / CSV -> ETL -> Runtime -> BI
```

## Required Evidence

- real local sample source path or explicit user-provided files
- field map or inferred field dictionary
- expected totals
- date coverage
- dedup key rules
- issue code expectations

## Required Checks

1. Reconcile GMV / GSV / visitors / paid buyers.
2. Reconcile adSpend / clicks.
3. Reconcile after-sales refund amount and count.
4. Reconcile search keyword visitors and buyers.
5. Confirm 2026-06-26 to 2026-06-30 coverage when the Tmall 18-file dataset is in scope.
6. Confirm runtime append does not replace dataset.
7. Confirm duplicate import does not double counts.
8. Confirm no raw rows or sensitive after-sales details are output.

## Forbidden

- Do not modify UI layout.
- Do not modify target UI.
- Do not persist original files.
- Do not save `rawRows`, `previewRows`, raw warning text, or technical stack traces.
- Do not upload `private-samples` or real Excel / CSV files to ECS.
