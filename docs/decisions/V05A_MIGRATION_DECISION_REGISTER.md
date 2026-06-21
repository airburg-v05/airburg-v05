# V0.5A Migration Decision Register

## Status

Decision register status: **approved_for_v0.5a_2**

V0.5A-2 entry allowed: **true**

This register is based only on the V0.5A-1 audit outputs from commit:

`e35359690a44b34c80e7149c7f835ad64b04744c`

## Source Files

1. `docs/audits/V05A_LEGACY_DATA_OWNERSHIP_AUDIT.md`
2. `docs/audits/v0.5a-legacy-data-inventory.json`
3. `docs/architecture/V05A_STORAGE_V2_MIGRATION_DESIGN.md`
4. `docs/architecture/v0.5a-storage-v2-contract.json`
5. `docs/decisions/ADR-002-storage-v2-persistence-and-migration.md`

All five source files remain unchanged from the source audit commit.

## Locked Scope

This register does not implement repository code, validators, Storage V2, migration, localStorage V2 writes, IndexedDB, page changes, parser changes, target diagnostics changes, metric changes, target rule changes, or trend rule changes.

V0.5A-2 is allowed to build only repository interfaces, V2 domain types, validators, pure functions, memory test adapters, and private validation scripts.

## Decision Summary

| Type | Count |
| --- | ---: |
| technical_default | 23 |
| business_decision | 0 |
| contract_gap | 1 |

| Risk | Count |
| --- | ---: |
| critical | 3 |
| high | 14 |
| medium | 6 |
| low | 1 |

There are no unresolved decisions and no remaining V0.5A-2 migration blockers.

## Legacy Key Policies

| Legacy key | Policy | Enters V2 business repository | Auto clear |
| --- | --- | --- | --- |
| `airburg_tmall_analysis_v2` | Preserve original key; later migrate to default Tmall store owned records. | Yes | No |
| `airburg_tmall_series_groups_v1` | Preserve original key; bind series to default Tmall store later. | Yes | No |
| `airburg_tmall_targets_v1` | Preserve original key; bind targets to default Tmall store later without scope upgrade. | Yes | No |
| `airburg:last-analysis` | Deprecated legacy preview artifact; ignore or archive in migration manifest only. | No | No |
| `airburg:demo-session` | Non-business demo session; leave untouched. | No | No |

## Default Tmall Store

Legacy Tmall data maps to:

| Field | Value |
| --- | --- |
| `platformCode` | `tmall` |
| `storeId` | `tmall-default-store` |
| `storeName` | `天猫默认店铺` |

Default store creation must be idempotent.

## Date Policies

Business and promotion fact `date` maps to `businessDate`.

Missing dates must not use the current date. Records with missing or invalid dates must be rejected or must move the migration to `migration_failed`.

After-sales day aggregates must keep an explicit date basis:

1. `apply_date`
2. `success_date`
3. `payment_date`

File-range after-sales summaries must remain derived aggregates with `dateRange`; they must not be written as ordinary single-day facts.

## Identity Policies

Entity IDs are not globally unique across stores.

V2 identity must use:

`platformCode + storeId + entityId`

This applies to product IDs, plan IDs, series IDs, target IDs, and tracked products.

## Target Policies

Legacy store targets remain store targets. They must not be upgraded into company targets.

Product and series targets bind to the default Tmall store.

Existing, valid target period values must be preserved. Unsupported legacy period values are a contract gap and must be rejected or flagged; they must not be rewritten into `daily` or `monthly`.

## Privacy Policies

After-sales raw rows are never migrated into V2 business repositories.

V2 repositories must not expose or persist sensitive after-sales details, file contents, file names, preview rows, or raw rows. Only safe aggregate values may be persisted.

## Persistence Policies

V0.5A-2 must not introduce:

1. localStorage V2 writes
2. IndexedDB
3. active pointer writes
4. real migration
5. page integration

Legacy import batch IDs must be deterministic from:

1. legacy storage key
2. legacy value hash
3. migration version

The same input must always produce the same ID.

## Resolved Migration Blockers

| Source blocker | Resolution |
| --- | --- |
| No active V2 repository contract is implemented yet. | V0.5A-2 implements interfaces and validators only. |
| No migration manifest or active dataset pointer exists yet. | Pointer writes are forbidden until validated activation stages. |
| Legacy facts lack `importBatchId`. | Use deterministic legacy import batch ID policy. |
| Targets and series lack `storeId`. | Bind them to the default Tmall store during later migration. |
| Page-level localStorage reads remain. | Repository integration is deferred to later authorized stages. |

## Decision Register

| ID | Category | Type | Risk | Decision | Blocks V0.5A-2 |
| --- | --- | --- | --- | --- | --- |
| MDR-001 | ownership | technical_default | critical | Core facts must become store-owned V2 facts before multi-store usage. | No |
| MDR-002 | ownership | technical_default | high | Legacy data owner is the default Tmall store. | No |
| MDR-003 | storage | technical_default | critical | `airburg_tmall_analysis_v2` migrates to owned aggregate facts later. | No |
| MDR-004 | series | technical_default | high | Legacy series bind to the default Tmall store without changing IDs. | No |
| MDR-005 | target | technical_default | high | Legacy targets keep V0.4C meaning and gain store ownership. | No |
| MDR-006 | target | contract_gap | high | Target period values must be preserved without lossy rewriting. | No |
| MDR-007 | storage | technical_default | medium | `airburg:last-analysis` is deprecated preview storage, not business repository input. | No |
| MDR-008 | persistence | technical_default | low | `airburg:demo-session` is not business analytics data. | No |
| MDR-009 | persistence | technical_default | high | Legacy `importBatchId` must be deterministic. | No |
| MDR-010 | date | technical_default | high | Missing fact dates must not use the current date. | No |
| MDR-011 | date | technical_default | high | After-sales date basis must remain explicit. | No |
| MDR-012 | privacy | technical_default | high | After-sales raw rows and sensitive details are never migrated. | No |
| MDR-013 | identity | technical_default | critical | Entity IDs are store-scoped, not globally unique. | No |
| MDR-014 | persistence | technical_default | high | Corrupted or partial migration states must not activate. | No |
| MDR-015 | persistence | technical_default | high | Active dataset pointer changes only after full validation. | No |
| MDR-016 | persistence | technical_default | high | V0.5A-2 is interface and validator only. | No |
| MDR-017 | persistence | technical_default | medium | Page-level storage reads are a later repository integration risk. | No |
| MDR-018 | identity | technical_default | medium | Series and tracked products remain user-selected focus objects. | No |
| MDR-019 | storage | technical_default | high | Plan promotion facts stay separate from product promotion facts. | No |
| MDR-020 | storage | technical_default | high | Legacy keys are preserved and never cleared by migration. | No |
| MDR-021 | privacy | technical_default | medium | `ImportFileRecord` must not persist file names or raw previews. | No |
| MDR-022 | target | technical_default | high | Legacy store target is not a company target. | No |
| MDR-023 | persistence | technical_default | medium | First V2 adapter choice does not block V0.5A-2. | No |
| MDR-024 | storage | technical_default | medium | Source health and row counts are safe metadata, not raw data. | No |

## V0.5A-2 Entry Judgment

V0.5A-2 is allowed because:

1. Migration blockers are empty after policy registration.
2. Unresolved decisions are empty.
3. All critical risks have disposition.
4. All high risks have implementation stages and validation requirements.
5. All five legacy key policies are explicit.
6. Default Tmall store mapping is explicit.
7. Target period strategy is lossless.
8. After-sales date semantics are explicit.
9. After-sales raw rows are forbidden.
10. Persistence and migration writes are excluded from V0.5A-2.
11. Active pointer safety is defined.
12. V0.5A remains pending.
13. Fixed governance files and audit inputs remain unchanged.

V0.5A-2 may proceed only as repository interfaces, domain types, validators, pure functions, memory test adapters, and private validation scripts.
