# ADR-002: Storage V2 Persistence And Migration Direction

## Status

Proposed

## Context

V0.4E stores a single-Tmall local analysis result, series groups, targets, and demo session in browser localStorage. V0.5 must support multiple platforms and multiple stores, with every imported fact bound to `platformCode`, `storeId`, `businessDate`, `sourceType`, and `importBatchId`.

The current pages are stable enough to preserve, but page-level localStorage access would become unsafe once multiple stores and migration states are introduced.

## Decision Drivers

1. Preserve legacy data.
2. Avoid clearing old keys to simplify migration.
3. Prevent pages from parsing V2 storage directly.
4. Keep after-sales raw details out of persisted business-facing storage.
5. Keep V0.4C target completion rules unchanged.
6. Keep V0.4B trend rules unchanged.
7. Allow later IndexedDB without rewriting every page.
8. Support migration dry-run, staged activation, rollback, and corrupted states.

## Options Considered

### Option 1: Keep One Large localStorage Object

Description: Store all V2 data in one new browser key.

Pros:

1. Simple to write.
2. Easy to snapshot.
3. Minimal storage API surface.

Cons:

1. Poor fit for growing multi-store facts.
2. High risk of large writes and accidental full-object corruption.
3. Difficult to query by platform, store, date, and source.
4. Encourages pages to depend on storage shape.

Assessment: Not recommended.

### Option 2: Split localStorage Keys By Entity

Description: Keep localStorage but split V2 data into keys for platforms, stores, import batches, facts, series, targets, and manifests.

Pros:

1. Easier to reason about than one huge object.
2. Can support staged migration and active pointer.
3. No new browser storage technology.

Cons:

1. Still size-limited.
2. Still synchronous.
3. Needs careful atomic activation design.
4. Still easy for pages to import keys directly if no repository boundary exists.

Assessment: Acceptable as a first adapter after repositories are designed, but not enough by itself.

### Option 3: Move Directly To IndexedDB

Description: Implement IndexedDB as the V2 persistence layer now.

Pros:

1. Better capacity.
2. Better structured storage for fact tables.
3. More suitable for multi-day and multi-store data.

Cons:

1. Current governance forbids IndexedDB until a later locked task explicitly authorizes it.
2. Adds migration complexity too early.
3. Risks coupling pages to a low-level persistence API.
4. Harder to validate during the current audit-only stage.

Assessment: Good future direction, but not authorized in V0.5A-1.

### Option 4: Repository Interfaces With Replaceable Persistence Adapter

Description: Define stable repositories for analysis, import batches, owned facts, series, tracked products, targets, and migration state. Implement persistence behind adapters. Start with a legacy read adapter and a later V2 adapter. IndexedDB can become a future adapter.

Pros:

1. Pages do not parse storage directly.
2. Migration can expose `empty`, `valid`, `corrupted`, and `migration_failed` consistently.
3. Adapters can change without changing page responsibilities.
4. Legacy localStorage can remain readable.
5. V2 localStorage or IndexedDB can be introduced in separate locked tasks.
6. Easier to enforce platform/store ownership at query boundaries.

Cons:

1. Requires more design work before feature work.
2. Needs validation scripts to prevent bypassing repositories.
3. Requires careful staging to preserve current pages.

Assessment: Recommended.

## Proposed Decision

Use repository interfaces with replaceable persistence adapters.

The next authorized implementation stages should:

1. Add repository and validator contracts first.
2. Add a legacy localStorage read adapter.
3. Add V2 persistence adapter only after V2 validation exists.
4. Keep pages away from direct V2 storage keys.
5. Preserve old keys during migration.
6. Add IndexedDB only in a later locked task with explicit authorization.

## Migration Direction

Legacy localStorage read adapter:

1. Reads `airburg_tmall_analysis_v2`.
2. Reads `airburg_tmall_series_groups_v1`.
3. Reads `airburg_tmall_targets_v1`.
4. Parses with existing validators.
5. Returns safe repository states.
6. Does not delete or rewrite old keys.

V2 persistence adapter:

1. Stores owned V2 records.
2. Stores migration manifest.
3. Stores active dataset pointer.
4. Supports staged prepare and atomic activate.
5. Returns `migration_failed` without switching active pointer on failure.

## Page Boundary

Pages must call repositories or ViewModels that receive repository data. Pages must not:

1. read V2 localStorage keys directly.
2. parse V2 JSON directly.
3. clear migration data directly.
4. infer store ownership from product ID or series ID.
5. repair corrupted storage without a repository action.

## Privacy Boundary

Repositories must not expose:

1. after-sales raw rows.
2. order identifiers.
3. refund identifiers.
4. transaction identifiers.
5. phone numbers.
6. addresses.
7. logistics details.
8. buyer explanations.
9. seller remarks.
10. operators or subaccounts.
11. file contents.
12. preview rows.

## Consequences

Positive:

1. Multi-platform and multi-store work can proceed without rewriting every page repeatedly.
2. Storage migration can be staged and rolled back.
3. Legacy data remains readable.
4. Missing data, zero data, parse failures, and migration failures can stay distinct.

Negative:

1. V0.5A needs more infrastructure before visible feature work.
2. Some current page-level storage access must later be refactored.
3. Validation scripts must enforce repository boundaries.

## Open Questions

1. Whether V2 first adapter should use split localStorage keys or wait for IndexedDB authorization.
2. Whether `airburg:last-analysis` should be archived under a legacy-unowned manifest entry or ignored with a user-visible notice.
3. Whether migrated import batch IDs should be one per legacy result or one per source type.

## Decision Review Trigger

Review this ADR before:

1. implementing V0.5A-2 repository interfaces.
2. introducing V2 persistence.
3. introducing IndexedDB.
4. building V0.5B batch import.
5. changing storage ownership rules.
