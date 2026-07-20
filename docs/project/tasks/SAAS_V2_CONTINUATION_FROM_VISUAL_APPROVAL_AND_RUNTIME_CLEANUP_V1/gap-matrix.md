# SaaS UI V2 Gap Matrix

Status: `UPDATED_AFTER_ROUTE_AND_HOME_SETTINGS_CONTINUATION`

Implementation authority evidence recorded on 2026-07-20:

- `/v2/home` current visual direction: `DESIGN_DIRECTION_ACCEPTED_FOR_IMPLEMENTATION`
- Meaning: the owner accepted the current `/v2/home` direction as the forward implementation reference.
- Non-meaning: this does **not** equal `visualAccepted=true` or `humanAccepted=true` for `/v2/home`, and it does not automatically accept any other V2 route.

## Route matrix

| Route | Blueprint priority | Blueprint expectation | Start-of-task state | Reusable real-data path already present | Current continuation state | Remaining gap / gate |
|---|---:|---|---|---|---|---|
| `/v2/home` | 1 | 17 KPI cockpit, focus series, MTD/DLY, compact scope and time controls | Public real-data-bound, upload18 pass, pending owner review | `lib/v2/home/v2-home-adapter.ts` | No new product change this task; direction accepted for implementation | Owner visual review still open |
| `/v2/series-board` | 2 | Series list, ownership, product ID maintenance, KPI, product contribution, trend, target relation | Static shell with mock rows | `loadSeriesBoardContext` + `buildV2SeriesBoardViewModel` + legacy fallback + `/series-board/manage` | `LOCAL_IMPLEMENTED_ROUTE_VALIDATED_PENDING_DEPLOY` — runtime-bound V2 page with explicit missing-manage-route blocking | Needs integrated deploy + public review; series-level search mapping remains explicit gap |
| `/v2/store-board` | 3 | Store selector, store KPI, store comparison, trend, series/product contribution | Static shell with mock rows | `loadStoreBoardContext` + `buildV2StoreBoardViewModel` | `LOCAL_IMPLEMENTED_ROUTE_VALIDATED_PENDING_DEPLOY` — runtime-bound V2 page with explicit V2 link mapping | Needs integrated deploy + public review |
| `/v2/product-board` | 4 | Tracked products, KPI, trend, search, after-sales, exclusion hint | Static shell with mock rows | `loadProductBoardContext` + `buildV2ProductBoardViewModel` + `/product-board/tracked` | `LOCAL_IMPLEMENTED_ROUTE_VALIDATED_PENDING_DEPLOY` — runtime-bound V2 page with explicit missing tracked-manage route blocking | Needs integrated deploy + public review |
| `/v2/upload` | 5 | Real upload entry, success/failed/skipped, template fallback | Static shell copy only | Real `/upload` route + ETL runtime + upload validators | `LOCAL_IMPLEMENTED_BROWSER_VALIDATED_PENDING_DEPLOY` — embedded V2 adapter over the trusted upload flow | Still adapter-based; must preserve upload18 truth and no raw-row leakage |
| `/v2/data-health` | 5 | Coverage calendar, duplicate/skipped/non-computable, read-only safe summaries | Static shell copy only | Hybrid `/upload/history` + `/upload/quality` + V0.5 read-only summaries | `LOCAL_IMPLEMENTED_BROWSER_VALIDATED_PENDING_DEPLOY` — V2 read-only route binding with `/v2/*` return paths | Needs integrated deploy + public review |
| `/v2/target-center` | 6 | Hierarchical required/derived/unsupported targets | Static shell copy only | Public `/targets` V0.5 route-bound target management | `LOCAL_IMPLEMENTED_BROWSER_VALIDATED_PENDING_DEPLOY` — real target-management client routed inside V2 | Must stay target-overlay-only; owner review still open |
| `/v2/search-assets` | 7 | Brand / series / product search asset center | Static shell copy only | Home search semantics and existing brand/center resolver only; existing cross-page search-asset config persistence | `LOCAL_IMPLEMENTED_REAL_CONFIG_BOUND_PENDING_DEPLOY` — real config surface for brand words / center-word groups; mock result tables removed | Search-asset analytics/result pages still `BLOCKED_BY_MISSING_CONTRACT` |
| `/v2/exclusion-rules` | 7 | Product ID exclusion + multi-text capability disclosure | Static shell copy only | Existing product-level exclusion semantics are partial and source-capability-dependent | `LOCAL_IMPLEMENTED_BLOCKED_STATE_PENDING_DEPLOY` — explicit blocked state with no fake controls | Stable cross-page save/read path still missing; must stay `BLOCKED_BY_MISSING_CONTRACT` |

## Cross-cutting gaps recovered from blueprint and history

1. 17 KPI full-grid baseline remains mandatory; no 5 KPI compression, hidden KPI chips, or engineering labels.
2. Day / week / month / custom range remains part of every operating center, but series/store/product still need V2-native binding and browser verification.
3. Search assets and exclusion rules are not just nav items; they require explicit source-capability truth and must not invent missing text fields.
4. Target center must remain overlay-only and must not leak into runtime actuals.
5. AI advisor remains deferred and is out of scope for this continuation task.

## Continuation status after the current local implementation round

- Route slices completed locally in this task:
  - `/v2/series-board`
  - `/v2/store-board`
  - `/v2/product-board`
  - `/v2/upload`
  - `/v2/upload/history`
  - `/v2/data-health`
  - `/v2/target-center`
  - `/v2/search-assets`
  - `/v2/exclusion-rules`
  - `/v2/home` metric settings / visible-metric selection / ordering persistence
- Real local browser evidence now covers:
  - `/v2/upload` + `/v2/upload/history` + `/v2/data-health` + `/v2/target-center` V2 route-boundary behavior
  - `/v2/home` real upload18 flow, 17 KPI default, saved subset persistence, saved ordering persistence, and reset-to-default recovery
- Remaining task gates:
  - one clean commit
  - integrated Aliyun deployment
  - public ten-route regression
  - owner review remains open for all newly changed V2 experiences
