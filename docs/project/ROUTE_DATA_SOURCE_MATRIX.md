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
| SaaS UI V2 | `components/saas-v2/data.ts` static constants only | `STATIC_SHELL`, not data-bound, not deployed |

## Critical Boundaries

1. `/v2/home` currently imports no `lib/bi`, `lib/v05`, target, runtime, or persistence module.
2. The next implementation must add one typed adapter/view-model boundary. The page may not import V1 BI, V0.5 domain, and runtime independently.
3. `/home` through `/upload/quality` remain the frozen public fallback. Their HTTP health does not prove the deployed Git commit.
4. V0.5 is a foundation candidate because its domain and repository contracts exist, but most V0.5 board command centers are not the components mounted by current routes.
5. `app/login` and `/raw-data` use legacy `lib/storage/**`; neither is a canonical V2 data source.

The JSON matrix contains the full 23-page inventory, concrete page/component files, first-party data imports, target and persistence sources, route binding, public evidence, and notes.
