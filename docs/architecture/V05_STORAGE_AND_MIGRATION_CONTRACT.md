# V0.5 Storage And Migration Contract

## Migration Principles

1. Legacy single-Tmall data must not be cleared.
2. Migration must automatically create one default store:
   - `platformCode`: `tmall`
   - `storeId`: `tmall-default-store`
   - `storeName`: `天猫默认店铺`
3. Current analysis result belongs to the default Tmall store after migration.
4. Current series groups and targets must be supplemented with store ownership.
5. Migration must be idempotent.
6. Migration failure must not damage old data.
7. Migration must keep a rollback snapshot or preserve old storage keys.
8. Storage v1 to v2 must use explicit version fields.
9. Later storage should move toward IndexedDB and repository abstraction.

## Legacy Keys

Current legacy keys:

1. `airburg_tmall_analysis_v2`
2. `airburg_tmall_series_groups_v1`
3. `airburg_tmall_targets_v1`

These keys must not be deleted during V0.5 migration.

## V0.5 Storage Direction

Future v2 storage should separate:

1. platform repository.
2. store repository.
3. import batch repository.
4. owned aggregate fact repository.
5. series repository.
6. tracked product repository.
7. target repository.

Each repository must read and write through a stable abstraction instead of page-level localStorage code.

## Version Strategy

1. Legacy Tmall analysis stays readable.
2. V0.5 migration writes v2 records with `schemaVersion`.
3. Migration records must include `migratedFromKey`, `migratedAt`, and `migrationVersion`.
4. Running migration twice must not duplicate stores, series, targets, or facts.
5. If v2 validation fails, keep old v1 keys and return a corrupted or migration_failed state.

## Rollback Or Snapshot

Before writing v2 records, migration must preserve either:

1. a full copy of the legacy values under snapshot keys, or
2. the original legacy keys unchanged.

Clearing old data to make v2 easier is forbidden.

## Failure Handling

If migration fails:

1. Do not delete legacy keys.
2. Do not partially activate v2 data.
3. Show a repair state.
4. Ask the user to retry or export a backup.

## IndexedDB Direction

IndexedDB may be introduced later when the repository contract is stable. It must not change business ownership rules. Pages must call repositories, not direct storage APIs.
