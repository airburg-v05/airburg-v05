# Route Data Source Matrix

Machine-readable authority: `docs/project/ROUTE_DATA_SOURCE_MATRIX.json`.

## Decision Summary

| Route family | Actual source | State |
|---|---|---|
| Legacy V1 boards | `lib/bi/bi.data-source.ts` plus V1 BI view models, debug context, and target drafts where imported | Data-bound frozen fallback; public health passes but deployed commit is unknown |
| Legacy upload | `parseExcelWorkbook` -> `runETLRuntime` -> safe runtime snapshot | Data-bound frozen fallback |
| History / quality | V0.5 data-center view models plus V1 safe runtime snapshot summaries | Data-bound hybrid fallback |
| V0.5 management routes | V0.5 focus and target domain/repository boundaries | Partially route-bound foundation candidate |
| V0.5 board command centers | V0.5 view-model code exists, but current board routes use V1 components | `NOT_ROUTE_BOUND` |
| SaaS UI V2 home/boards | One active brand runtime through `lib/v2/home/v2-home-adapter.ts`, with explicit target overlays and browser-local series/product configuration | Data-bound; new cross-platform series implementation is public technical PASS pending owner review |

## Critical Boundaries

1. `/v2/home`, `/v2/series-board`, `/v2/store-board` and `/v2/product-board` share one typed V2 adapter instead of independently recomputing BI facts.
2. Home remains the all-platform/all-store brand cockpit. The public series implementation separates all-store brand summary from exactly-one-store execution.
3. Store-series targets apply only to the single-store lens. A brand-series target remains unknown until an explicit contract exists.
4. Manual product records are platform/store listings, not cross-platform brand-product masters; title or image similarity cannot establish identity.
5. The prior V2 stable baseline remains recoverable. The new cross-platform implementation is deployed and passed public technical regression, but is not yet visually or commercially accepted.
6. `/home` through `/upload/quality` remain the frozen V1 fallback. HTTP health alone does not prove deployment identity or product completion.
7. `app/login` and `/raw-data` use legacy `lib/storage/**`; neither is a canonical V2 data source.

The JSON matrix contains the full 23-page inventory, concrete page/component files, first-party data imports, target and persistence sources, route binding, public evidence, and notes.
