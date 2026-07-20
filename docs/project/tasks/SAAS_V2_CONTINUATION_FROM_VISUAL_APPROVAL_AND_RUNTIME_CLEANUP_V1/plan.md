# Plan

Status: `IN_PROGRESS`

1. Read current SSOT, blueprint, route/data/metric contracts, and historical V2 task contracts.
2. Build an auditable gap matrix for the authorized V2 routes and identify the first blueprint-priority implementation slice.
3. Inventory safe-to-delete obsolete runtime artifacts with counts, dependency checks, risk notes, and post-delete expectation.
4. Continue the authorized V2 route sequence in blueprint order rather than stopping after the first successful slice:
   - `/v2/series-board`
   - `/v2/store-board`
   - `/v2/product-board`
   - `/v2/upload` + `/v2/data-health`
   - `/v2/target-center`
   - `/v2/search-assets` + `/v2/exclusion-rules`
   - `/v2/home` historical requirements for metric settings / visible-metric selection / ordering
5. For each slice, bind trustworthy existing data or contract-backed behavior; if a capability lacks a stable domain/persistence/field contract, keep a safe empty state and record `BLOCKED_BY_MISSING_CONTRACT` instead of shipping mock completion.
6. Do not deploy after only one route. First finish the integrated authorized continuation set that has real support from current contracts and data boundaries.
7. Run local lint, build, changed-slice validators, and required upload18 regression for the integrated continuation set.
8. Deploy the authorized V2 continuation set through the existing Aliyun workflow once integrated local regression passes.
9. Record page-by-page public regression, remaining blocked-by-contract gaps, and owner-review gates in validation and handoff.
