# V0.5A Legacy Data Ownership Audit

## 1. Audit Scope

This audit covers the current browser-side storage, Tmall four-source stored result, series groups, targets, early single-file analysis storage, demo session storage, page-level readers and writers, data fact ownership, and privacy boundaries.

This task did not run a migration, did not change business pages, did not change parsers, did not change target diagnostics, and did not read private sample files.

## 2. Governance Boundary

V0.5 requires multi-platform and multi-store ownership. Every imported business record must eventually be bound to:

1. `platformCode`
2. `storeId`
3. `businessDate`
4. `sourceType`
5. `importBatchId`

Current V0.5A-1 is audit and design only. If migration implementation is required to finish a task, the correct result is `BLOCKED`, not an unplanned storage rewrite.

## 3. Legacy Storage Inventory

Machine-readable details are stored in:

`docs/audits/v0.5a-legacy-data-inventory.json`

Discovered storage keys:

| Key | Entity | Status | Migration Risk |
| --- | --- | --- | --- |
| `airburg_tmall_analysis_v2` | `TmallStoredAnalysisResult` | Core Tmall aggregate result | high |
| `airburg_tmall_series_groups_v1` | `TmallSeriesGroupStorage` | User-defined series | medium |
| `airburg_tmall_targets_v1` | `TmallTargetStorage` | Store/product/series targets | high |
| `airburg:last-analysis` | Early `AnalysisResult` prototype | Legacy single-file analysis | medium |
| `airburg:demo-session` | `DemoSession` | Demo login state | low |

## 4. localStorage And sessionStorage Audit

No `sessionStorage` usage was found in audited source files. All discovered persistence uses `window.localStorage`.

Storage wrappers:

1. `lib/storage/tmall-analysis-storage.ts`
2. `lib/storage/tmall-analysis-validator.ts`
3. `lib/storage/tmall-series-storage.ts`
4. `lib/storage/tmall-target-storage.ts`
5. `lib/storage/analysis-storage.ts`
6. `lib/storage/use-local-storage.ts`
7. `lib/storage/use-tmall-analysis-result.ts`

The newer Tmall analysis result has a centralized validator. Series and targets also validate envelopes. The early `airburg:last-analysis` and `airburg:demo-session` keys still parse JSON with type assertions and no schema version.

## 5. Analysis Result Storage

Evidence:

1. `lib/storage/tmall-analysis-storage.ts:9`
2. `types/tmall.ts:187`
3. `app/(workspace)/upload/page.tsx:265`

Current shape:

1. `version`
2. `analysisTimestamp`
3. `sourceHealth`
4. `dateRanges`
5. `productDailyFacts`
6. `adProductDailyFacts`
7. `adPlanDailyFacts`
8. `afterSalesAggregates`
9. `joinQuality`
10. optional `reconciliation`
11. `dataQualityWarnings`

Ownership gap:

1. Facts use `platform: "tmall"`, not `platformCode`.
2. Facts use `date`, not `businessDate`.
3. Facts do not contain `storeId`.
4. Facts do not contain `importBatchId`.
5. `sourceType` exists in source health, but not on every owned fact.

Risk: **critical**. Multi-store cannot be safely enabled until the result is read through V2-owned repositories or migrated into owned facts.

## 6. Series Group Storage

Evidence:

1. `lib/storage/tmall-series-storage.ts:1`
2. `app/(workspace)/series-board/page.tsx:153`

Current shape:

1. `id`
2. `name`
3. optional `description`
4. `productIds`
5. `createdAt`
6. `updatedAt`

Ownership gap:

1. No `platformCode`.
2. No `storeId`.
3. Series IDs are only unique in the current implicit Tmall workspace.

Risk: **high** for multi-store. Migration must bind every series to `tmall-default-store` and must not expand all products into default series.

## 7. Target Storage

Evidence:

1. `types/tmall-targets.ts:19`
2. `lib/storage/tmall-target-storage.ts:28`
3. `app/(workspace)/targets/page.tsx:135`

Current scopes:

1. `store`
2. `product`
3. `series`

Ownership gap:

1. Store targets are implicit single Tmall store targets.
2. Product targets use `productId` without store ownership.
3. Series targets use `seriesId` without store ownership.

Risk: **high**. V0.4C completion rules can be preserved, but each target must receive `platformCode` and `storeId` before company -> store -> series -> product hierarchy work begins.

## 8. Prototype Storage Keys

`airburg:last-analysis` stores early one-file analysis with file metadata, headers, preview rows, metrics, ranking, and anomalies.

Evidence:

1. `lib/storage/analysis-storage.ts:3`
2. `lib/analysis/run-analysis.ts:15`

Risk: **medium**. This key may exist in old browsers but is not part of the current four-source workflow. It should be explicitly archived or ignored in migration manifest, not silently cleared.

`airburg:demo-session` stores demo login account and timestamp. It is not business analytics data and does not require V2 ownership migration.

## 9. Reader Writer Clearer Matrix

| Key | Writers | Readers | Clearers |
| --- | --- | --- | --- |
| `airburg_tmall_analysis_v2` | upload page, tmall analysis storage wrapper | upload, home, store, product, series, raw-data, targets | upload page |
| `airburg_tmall_series_groups_v1` | series page, series storage wrapper | home, store, product, series, targets | series page |
| `airburg_tmall_targets_v1` | targets page, target storage wrapper | home, store, product, series, targets | targets page |
| `airburg:last-analysis` | old storage wrapper only | old hook only | old storage wrapper only |
| `airburg:demo-session` | login page | app shell | app shell |

Migration impact: pages still contain direct `window.localStorage.getItem(...)` patterns for target and series snapshots. V2 pages should use repositories so page code does not own persistence details.

## 10. Page Access Audit

Direct or hook-based storage access exists in:

1. `/upload`
2. `/home`
3. `/targets`
4. `/store-board`
5. `/product-board`
6. `/series-board`
7. `/raw-data`
8. `/login`

This is acceptable for current V0.4E but incompatible with the V0.5 repository direction.

## 11. Fact Ownership Gap

Current fact uniqueness is mostly:

1. `date + productId`
2. `date + planId`
3. aggregate date buckets

V0.5 must use composite ownership:

1. `platformCode`
2. `storeId`
3. `businessDate`
4. `sourceType`
5. source-specific entity ID
6. `importBatchId`

Risk: **critical**. Without this, two stores on the same platform with the same product ID can overwrite or merge conceptually separate results.

## 12. Source, Date, And Import Batch Gap

Current upload analyzes four optional files into one result. It keeps `sourceHealth` and `dateRanges`, but does not persist an `ImportBatchRecord` or stable `ImportFileRecord`.

Migration handling:

1. Create one synthetic migration import batch for the legacy stored result.
2. Create source-level file records without file names or raw rows.
3. Preserve source health status and row counts.
4. Use `businessDate` for fact date fields.
5. Mark failed or missing sources explicitly; do not convert them to zero facts.

## 13. Series And Target Ownership Gap

Series and targets are user-owned business configuration. They are not raw imported facts, but they still need store ownership.

Migration handling:

1. Legacy series -> `SeriesRecord` with `platformCode=tmall` and `storeId=tmall-default-store`.
2. Legacy store target -> `TargetRecord` with scope `store` and default store ownership.
3. Legacy product target -> `TargetRecord` with default store plus productId.
4. Legacy series target -> `TargetRecord` with default store plus seriesId.
5. Preserve IDs to keep links stable.

## 14. Privacy And After-sales Boundary

Current saved Tmall result stores only `afterSalesAggregates`, not raw after-sales rows.

Evidence:

1. `lib/storage/tmall-analysis-storage.ts:24`
2. `lib/tmall/aggregators/after-sales-aggregator.ts`
3. `lib/tmall/parsers/after-sales-parser.ts`

The parser reads sensitive source rows only in memory and converts them into safe aggregates. V2 must keep this boundary:

1. Do not persist order IDs.
2. Do not persist refund IDs.
3. Do not persist phone numbers.
4. Do not persist addresses.
5. Do not persist logistics details.
6. Do not persist buyer explanations.
7. Do not persist seller notes.
8. Do not persist operators or subaccounts.
9. Do not persist raw rows or preview rows.

Risk: **high** if V2 attempts to store import file raw records. The V2 contract forbids this.

## 15. Empty, Corrupted, And Migration States

Current Tmall analysis validator supports:

1. `loading`
2. `empty`
3. `valid`
4. `corrupted`

Series and targets support:

1. `empty`
2. `valid`
3. `corrupted`

V2 must additionally support:

1. `migration_failed`
2. staged but not active data
3. active dataset pointer

Migration failure must not delete old keys and must not activate partial V2 records.

## 16. Risk Register

| Level | Risk | Evidence | Impact | Migration Handling | Blocker |
| --- | --- | --- | --- | --- | --- |
| critical | Facts are not store-owned | `types/tmall.ts` | Multi-store aggregation can mix stores | Add owned facts and repository filters | Yes for V0.5B+ |
| high | Targets are implicit single-store | `types/tmall-targets.ts` | Target completion can attach to wrong store | Bind default store in migration | Yes for target hierarchy |
| high | Series are implicit single-store | `lib/storage/tmall-series-storage.ts` | Series membership can mix stores | Bind default store in migration | Yes for multi-store series |
| high | No import batch exists | `run-tmall-four-source-analysis.ts` | Cannot trace source ownership | Create synthetic migration batch | Yes for batch import |
| medium | Prototype analysis may include preview rows | `lib/analysis/run-analysis.ts` | Privacy and shape mismatch | Archive or ignore explicitly | No if documented |
| medium | Page-level storage reads | app workspace pages | Persistence is hard to swap | Introduce repositories later | No for audit |
| low | Demo session not schema-versioned | `analysis-storage.ts` | Auth/session only | Leave untouched | No |

## 17. Storage V2 Mapping Plan

Required V2 record families:

1. `PlatformRecord`
2. `StoreRecord`
3. `ImportBatchRecord`
4. `ImportFileRecord`
5. `OwnedBusinessProductFact`
6. `OwnedAdProductFact`
7. `OwnedAdPlanFact`
8. `OwnedAfterSalesAggregate`
9. `SeriesRecord`
10. `TrackedProductRecord`
11. `TargetRecord`
12. `MigrationManifest`
13. `RepositoryResult`
14. `ActiveDatasetPointer`

The detailed machine-readable contract is:

`docs/architecture/v0.5a-storage-v2-contract.json`

## 18. Required Next Stages And No-go List

Recommended next V0.5A split:

1. V0.5A-2: Repository interfaces and V2 validators.
2. V0.5A-3: Legacy snapshot and dry-run migration.
3. V0.5A-4: Default Tmall store migration activation.
4. V0.5A-5: Owned fact repository integration.
5. V0.5A-6: Storage V2 final regression and V0.5A freeze.

No-go list:

1. Do not clear legacy keys.
2. Do not add multi-store pages before facts are owned.
3. Do not add AI.
4. Do not add server backend or database.
5. Do not introduce IndexedDB without a later locked authorization.
6. Do not store after-sales raw rows.
7. Do not treat missing data as zero.
8. Do not let pages parse V2 storage directly.
