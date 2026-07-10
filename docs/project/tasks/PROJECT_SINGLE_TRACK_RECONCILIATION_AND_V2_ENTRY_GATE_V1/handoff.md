# Project Single-Track Reconciliation Handoff

## What This Project Is

Airburg has a verified Tmall V1 browser-side analytics pipeline and public internal-beta fallback, a broad V0.5 domain/persistence candidate, and a new SaaS UI V2 presentation shell. These are not one maturity state.

## Single Track

- Active product track: **SaaS UI V2**.
- Current SaaS UI V2 state: **STATIC_SHELL**.
- Data-bound: no.
- Visual accepted: no.
- Preview deployed: no.
- Public `/v2/home`: 404 at evidence capture.

## Frozen Fallback

Tmall V1 data is the trusted real-data foundation. Its seven public pages are the frozen stable fallback. Public health passes, but the ECS directory has no Git metadata, so the deployed commit is unknown. The correct status is `PUBLIC_HEALTH_PASS_COMMIT_UNKNOWN`, not `PUBLIC_ALIGNED`.

## Foundation Candidate

V0.5 provides platform/store/domain ownership, repositories, browser persistence, focus management, and hierarchical targets. It is `FOUNDATION_CANDIDATE`: only selected management and data-center surfaces are route-bound; most V0.5 board command centers are not current routes.

## Canonical Next Architecture

`/v2/home` must use `V05_DOMAIN_WITH_V1_METRIC_COMPATIBILITY_ADAPTER`. One typed adapter must combine V0.5 ownership semantics with the verified V1 metric layer. React pages must not import and reconcile V1, V0.5, runtime, targets, and persistence independently.

## Semantic Lock

`geoSearchShare` and `brandKeywordPaidShare` are separate metrics:

- `geoSearchShare`: brand keyword paid buyers / all paid buyers.
- `brandKeywordPaidShare`: brand keyword paid buyers / total search-keyword paid buyers.

The new metric is pending implementation. Do not relabel the old numeric value.

## Known Non-Blocking Gap

The current debug-context validator has one existing failure around temporary product override display options. Its adapter/load-save checks pass. This governance task does not fix it, and the isolated `/v2/home` slice must not claim that unrelated product-page behavior is revalidated.

## Only Next Task

`V2_HOME_REAL_DATA_VERTICAL_SLICE_V1`, status `READY_FOR_USER_AUTHORIZATION`.

It may implement only one complete `/v2/home` real-data loop: active dataset restore or real upload, 17 KPI contract, target overlay, key-series GSV, MTD/DLY, range and comparison structure, browser persistence, 1440/390 Browser E2E, screenshot comparison, and full-page human acceptance.

It may not bind the other eight V2 routes, edit Legacy V1, deploy, or push.

Read first:

1. `docs/project/PROJECT_SSOT.json`
2. `docs/project/current-task.json`
3. `docs/project/tasks/V2_HOME_REAL_DATA_VERTICAL_SLICE_V1/task-contract.json`
4. `docs/project/V2_HOME_DATA_FOUNDATION_DECISION.md`
5. `docs/project/V2_HOME_DATA_CONTRACT.json`
6. `docs/project/METRIC_SEMANTIC_RECONCILIATION_V1.json`

