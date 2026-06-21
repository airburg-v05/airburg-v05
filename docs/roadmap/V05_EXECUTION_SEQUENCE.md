# V0.5 Execution Sequence

The V0.5 sequence is locked. Later tasks must not skip stages without user approval.

## V0.5A Platform, Store, And Data Ownership Model

Preconditions:

1. V0.5 governance lock passes.
2. Legacy Tmall data is preserved.

Allowed:

1. Define platform and store entities.
2. Add ownership fields to new contracts.
3. Build migration plan and safe validators.

Forbidden:

1. New homepage redesign.
2. New import UI.
3. AI, backend, database, API, crawler.
4. Clearing old storage.

Exit conditions:

1. Platform/store model validates.
2. Legacy Tmall data can map to Tmall default store.
3. Migration plan is idempotent.

Rollback:

1. Keep all v1 storage unchanged.
2. Disable v2 records if validation fails.

## V0.5B Batch Import And Automatic Analysis

Preconditions:

1. V0.5A PASS.

Allowed:

1. Batch file selection.
2. One import action.
3. Source recognition, parsing, validation, aggregation, and save under platform/store.

Forbidden:

1. Rebuilding home or dashboards.
2. Adding AI or backend.
3. Importing files without `platformCode` and `storeId`.

Exit conditions:

1. Batch import works for Tmall default store.
2. Import batches and files are traceable.
3. Missing source repair remains clear.

Rollback:

1. Keep previous import result readable.
2. Failed import must not overwrite last valid aggregate.

## V0.5C Home Relayout

Preconditions:

1. V0.5B PASS.

Allowed:

1. Redesign home around cross-store metrics, date range, targets, and store completion.
2. Reduce repeated cards.

Forbidden:

1. Store, series, or product deep feature expansion.
2. AI and backend.

Exit conditions:

1. Home answers what to inspect first.
2. Mobile 390px passes.
3. Cross-store aggregation respects ownership.

Rollback:

1. Keep old V0.4E home available until new home passes.

## V0.5D Multi-Store Boards

Preconditions:

1. V0.5C PASS.

Allowed:

1. Store selector.
2. Store-level board scope.
3. Store completion and drilldown.

Forbidden:

1. Cross-store leakage.
2. Product tracking redesign.

Exit conditions:

1. Store board isolates selected store.
2. Company-level aggregation remains explicit.

Rollback:

1. Fall back to Tmall default store view.

## V0.5E Series And Tracked Product Custom Management

Preconditions:

1. V0.5D PASS.

Allowed:

1. User-created series.
2. User-selected tracked products.
3. Store-scoped focus objects.

Forbidden:

1. Auto-publishing all products as tracked products.
2. Cross-store product grouping.

Exit conditions:

1. Series and tracked product storage validates.
2. Pages show only selected focus objects by default.

Rollback:

1. Preserve old series groups and tracked product choices.

## V0.5F Target Allocation And Target Drawer

Preconditions:

1. V0.5E PASS.

Allowed:

1. Company -> store -> series -> product target allocation.
2. Drawer-based target editing.

Forbidden:

1. Changing V0.4C target progress rules without ADR.
2. AI target generation.

Exit conditions:

1. Target hierarchy validates.
2. Completion rate is stable.

Rollback:

1. Preserve old target storage snapshot.

## V0.5G Full Visual Closure And Final Regression

Preconditions:

1. V0.5F PASS.

Allowed:

1. Visual cleanup.
2. Mobile regression.
3. Privacy and storage regression.

Forbidden:

1. New business rules.
2. New storage structures.

Exit conditions:

1. All pages pass.
2. lint and build pass.
3. Browser regression passes.

Rollback:

1. Keep V0.5F stable baseline available.
