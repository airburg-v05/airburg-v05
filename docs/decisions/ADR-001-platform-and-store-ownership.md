# ADR-001: Platform And Store Ownership

## Status

Accepted for V0.5 planning.

## Context

The current system began as a Tmall local analysis tool. V0.5 must evolve toward multi-platform and multi-store analysis. Without explicit platform and store ownership, later imports can mix facts from different stores and make targets, series, products, and cross-store home metrics unreliable.

## Decision

All imported files, import batches, safe aggregate facts, series, tracked products, and non-company targets must carry platform and store ownership.

Required ownership fields:

1. `platformCode`
2. `storeId`

Required fact fields:

1. `platformCode`
2. `storeId`
3. `businessDate`
4. `sourceType`
5. `importBatchId`

Legacy Tmall data migrates into:

1. `platformCode = "tmall"`
2. `storeId = "tmall-default-store"`
3. `storeName = "天猫默认店铺"`

## Consequences

1. New pages must resolve store context before showing store, series, or product data.
2. Cross-store aggregation can only happen on company-level views.
3. Series cannot contain products from multiple stores.
4. Product tracking is store-scoped.
5. Migration cannot clear old data to avoid ownership assignment.

## Rejected Alternatives

1. Keep a single global Tmall store forever.
2. Infer store from file name without a store entity.
3. Let products be global across platforms.
4. Clear localStorage and start clean.

## Validation

V0.5A must include a validator that fails if facts, series, tracked products, or targets can exist without store ownership.
