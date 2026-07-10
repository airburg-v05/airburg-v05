# V2 Home Real-Data Vertical Slice Handoff

Status: `READY_FOR_USER_AUTHORIZATION`. Do not execute without a new explicit user instruction.

## Goal

Turn only `/v2/home` from `STATIC_SHELL` into a complete, locally proven vertical slice. Do not spread partial data binding across the remaining V2 routes.

## Required Loop

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
-> human full-page acceptance
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

## Required Evidence Before Acceptance

- real 18-file reconciliation;
- Browser/Playwright interactions and restore;
- 1440px and 390px screenshots;
- reference screenshot/PDF comparison with at least one correction cycle;
- console, overflow, invalid-number, and sensitive-text checks;
- explicit user visual acceptance.

