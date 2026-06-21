# V0.5A Storage V2 Migration Design

## 1. Design Status

Status: design only.

This document does not authorize migration implementation. It defines how legacy single-Tmall browser data should be migrated later without clearing old data, without changing V0.4C target rules, without changing trend rules, and without exposing after-sales sensitive details.

## 2. Migration Owner Defaults

Legacy data belongs to the automatically created default store:

| Field | Value |
| --- | --- |
| `platformCode` | `tmall` |
| `storeId` | `tmall-default-store` |
| `storeName` | `天猫默认店铺` |

The migration must create this store once. Re-running migration must reuse the same platform and store records.

## 3. Legacy Inputs

Legacy keys to inspect:

1. `airburg_tmall_analysis_v2`
2. `airburg_tmall_series_groups_v1`
3. `airburg_tmall_targets_v1`
4. `airburg:last-analysis`
5. `airburg:demo-session`

Only the first three are core business migration inputs. `airburg:last-analysis` is an old prototype analysis key and should be archived or ignored explicitly in the migration manifest. `airburg:demo-session` is not business data and should be left untouched.

## 4. Migration Detection

Migration detection must check:

1. Active dataset pointer exists and points to a valid V2 dataset.
2. Migration manifest exists for `legacy_tmall_v1_to_storage_v2_v1`.
3. Default platform/store records exist.
4. Migrated record counts match manifest counts.
5. Legacy key hashes match the values that were staged.

If all are true, migration returns already migrated and does not duplicate records.

## 5. Prepare Phase

Prepare phase is read-only against active user-facing data.

Steps:

1. Read legacy keys.
2. Compute stable hashes of legacy raw values.
3. Parse legacy analysis, series, and target storage with existing validators.
4. If a legacy key is empty, record an empty source state.
5. If a legacy key is corrupted, record a corrupted source state and stop before activation.
6. Create a staging dataset in memory or a staging persistence area.
7. Create `PlatformRecord` for `tmall` if missing.
8. Create `StoreRecord` for `tmall-default-store` if missing.
9. Create a synthetic `ImportBatchRecord` for the migrated analysis result.
10. Create source-level `ImportFileRecord` entries from safe source health only.
11. Convert facts to owned facts with `platformCode`, `storeId`, `businessDate`, `sourceType`, and `importBatchId`.
12. Convert after-sales aggregates only. Do not reconstruct or save raw after-sales rows.
13. Convert legacy series to store-owned `SeriesRecord`.
14. Convert legacy targets to store-owned `TargetRecord`.
15. Validate all records.
16. Build `MigrationManifest` with status `prepared`.

Prepare phase must not switch the active dataset pointer.

## 6. Activate Phase

Activate phase runs only after prepare validation passes.

Steps:

1. Write staged V2 records.
2. Write migration manifest with staged counts and legacy key hashes.
3. Validate records after persistence readback.
4. Switch `ActiveDatasetPointer` to the new V2 dataset.
5. Mark manifest status `activated`.
6. Keep all legacy keys unchanged.
7. Notify repository subscribers.

Activation must be atomic from the page-read perspective. Pages must either read the old active dataset or the new active dataset, never a partial V2 state.

## 7. Failure Handling

If migration fails:

1. Do not delete legacy keys.
2. Do not update active dataset pointer.
3. Mark migration status `migration_failed`.
4. Store a safe error code and safe notices only.
5. Do not store raw JSON dumps, raw rows, file names, or sensitive after-sales values.
6. Allow retry after the user fixes corrupted legacy storage.

Migration failure is a state, not a reason to clear old data.

## 8. Rollback And Snapshot Strategy

Rollback can be satisfied by keeping original legacy keys unchanged and by recording hashes in the manifest.

If later implementation adds snapshot keys, they must:

1. Be versioned.
2. Store only the original legacy key raw values or safe hashes.
3. Never include newly exposed after-sales raw rows.
4. Never replace the original legacy keys.

Rollback restores the previous active dataset pointer. It does not delete legacy keys.

## 9. Legacy Analysis Mapping

`airburg_tmall_analysis_v2` maps to:

1. `PlatformRecord`
2. `StoreRecord`
3. `ImportBatchRecord`
4. `ImportFileRecord`
5. `OwnedBusinessProductFact`
6. `OwnedAdProductFact`
7. `OwnedAdPlanFact`
8. `OwnedAfterSalesAggregate`
9. `MigrationManifest`

Mapping rules:

1. `platform: "tmall"` -> `platformCode: "tmall"`.
2. `date` -> `businessDate`.
3. source-specific facts get source-specific `sourceType`.
4. all facts get `storeId: "tmall-default-store"`.
5. all facts get the synthetic migration `importBatchId`.
6. no product promotion fact is filled from plan promotion facts.
7. no missing value is coerced to 0.

## 10. Legacy Series Mapping

`airburg_tmall_series_groups_v1` maps to `SeriesRecord`.

Rules:

1. Preserve legacy `id` as `seriesId`.
2. Add `platformCode: "tmall"`.
3. Add `storeId: "tmall-default-store"`.
4. Preserve name, description, productIds, createdAt, and updatedAt.
5. Do not store product names as identity.
6. Do not create default series for all products.

## 11. Legacy Target Mapping

`airburg_tmall_targets_v1` maps to `TargetRecord`.

Rules:

1. Preserve target id as `targetId`.
2. Add `platformCode: "tmall"`.
3. Add `storeId: "tmall-default-store"`.
4. Preserve scope, period, metric, target value, direction, status, createdAt, and updatedAt.
5. Store targets attach to the default store.
6. Product targets attach to the default store and productId.
7. Series targets attach to the default store and seriesId.
8. Preserve V0.4C completion rate rules.
9. Do not create company-level targets from legacy store targets.

## 12. Empty, Corrupted, And Partial Storage

Rules:

1. Empty analysis result: create no owned facts; record empty migration source.
2. Corrupted analysis result: stop before activation.
3. Empty series storage: create no series records.
4. Corrupted series storage: stop if series migration is required for active target integrity; otherwise record partial migration blocked and require user decision.
5. Empty target storage: create no target records.
6. Corrupted target storage: stop before activation when target storage is part of migration scope.
7. Partial four-source data: migrate parsed sources and mark missing/error source states explicitly.

## 13. Idempotence Rules

Migration is idempotent when:

1. Default platform and store records are created once.
2. Import batch id is deterministic for a given legacy analysis hash and migration version.
3. Series ids are preserved.
4. Target ids are preserved.
5. Fact ids or composite keys are deterministic.
6. Re-running migration with unchanged legacy hashes produces the same staged counts.
7. Existing activated manifest prevents duplicate activation.

## 14. Repository Boundary

Pages must not read V2 storage directly.

Future repository interfaces should provide:

1. analysis result access by platform/store/date.
2. import batch access.
3. owned fact query access.
4. series query and mutation access.
5. tracked product query and mutation access.
6. target query and mutation access.
7. migration state access.

The first adapter may still use localStorage, but it must sit behind repositories.

## 15. Persistence Adapter Direction

V0.5A-1 does not choose or implement IndexedDB.

Recommended direction:

1. Implement repository interfaces first.
2. Implement V2 localStorage adapter for small staged migration if authorized.
3. Add IndexedDB only in a later locked task with explicit authorization.
4. Keep page code unchanged when adapter changes.

## 16. Privacy Boundary

V2 must never persist:

1. order identifiers.
2. refund identifiers.
3. Alipay transaction identifiers.
4. phone numbers.
5. addresses.
6. receiver names.
7. logistics numbers.
8. logistics information.
9. buyer refund explanations.
10. seller remarks.
11. operators.
12. subaccounts.
13. raw rows.
14. preview rows.
15. file contents.
16. file names under current contract.

After-sales remains aggregate-only.

## 17. Future Task Split

### V0.5A-2: Repository Interfaces And V2 Validators

Input: this audit, V2 contract JSON, ADR-002.

Output: TypeScript interfaces and validators only.

Allowed: repository type files, validator files, private validation scripts.

Forbidden: page changes, real migration, IndexedDB, business calculation changes.

Rollback: remove new interfaces and validators.

Exit condition: validators prove required ownership fields.

IndexedDB allowed: no.

Page modification allowed: no.

### V0.5A-3: Legacy Snapshot And Dry-run Migration

Input: repository interfaces and validators.

Output: dry-run migration that reads legacy keys, builds staged records, validates, and outputs safe counts.

Allowed: migration dry-run script and tests.

Forbidden: active pointer switch, deleting old keys, page changes, metric rule changes.

Rollback: no persistent activation occurs.

Exit condition: dry-run passes for empty, corrupted, partial, and valid states.

IndexedDB allowed: no unless separately authorized.

Page modification allowed: no.

### V0.5A-4: Default Tmall Store Migration Activation

Input: passing dry-run migration.

Output: guarded activation path with manifest and active pointer.

Allowed: migration activation code and repository adapter changes.

Forbidden: clearing legacy keys, changing V0.4 metrics, adding platforms beyond default migrated Tmall store.

Rollback: restore previous active pointer and keep old keys.

Exit condition: migration can activate once and retry idempotently.

IndexedDB allowed: only if a locked task explicitly authorizes it.

Page modification allowed: limited status display only if authorized.

### V0.5A-5: Owned Fact Repository Integration

Input: activated default Tmall store dataset.

Output: existing pages read through ownership-aware repositories.

Allowed: scoped page and ViewModel reads through repository boundaries.

Forbidden: changing metric formulas, target formulas, trend formulas, privacy boundaries.

Rollback: page reads can fall back to legacy read adapter while keeping V2 records.

Exit condition: all current pages display the same values through owned records.

IndexedDB allowed: no unless separately authorized.

Page modification allowed: yes, read-path only.

### V0.5A-6: Storage V2 Final Regression And V0.5A Freeze

Input: repository integration.

Output: V0.5A freeze report and regression scripts.

Allowed: docs and validation scripts; bugfixes only if authorized.

Forbidden: new business features, multi-platform upload, AI, backend, database.

Rollback: restore previous active pointer and legacy read mode.

Exit condition: lint, build, privacy, migration, idempotence, and page regression pass.

IndexedDB allowed: no unless separately authorized.

Page modification allowed: bugfix only.

## 18. Non-goals

This design does not implement:

1. multi-platform import.
2. multi-store UI.
3. batch import UI.
4. target allocation drawers.
5. IndexedDB.
6. backend API.
7. server database.
8. AI analysis.
9. crawler or platform API.
10. real storage migration.
