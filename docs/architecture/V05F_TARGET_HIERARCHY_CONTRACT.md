# V0.5F Target Hierarchy Contract

## Purpose

This contract unblocks V0.5F by making target parent-child allocation explicit, durable, and machine-validatable.

## Target Record Field

`TargetRecord` adds:

```ts
parentTargetId?: string | null
```

Missing and `null` both mean standalone/unallocated. Existing legacy targets are preserved as standalone targets.

## Legal Hierarchy

Only these direct parent-child relationships are valid:

1. `company -> store`
2. `store -> series`
3. `series -> product`

Invalid relationships include jumps, reverse relationships, same-level relationships, self references, cycles, and product targets acting as parents.

## Ownership Rules

Company targets have no `platformCode`, `storeId`, `seriesId`, or `productId`.

Store children of company targets must have `platformCode` and `storeId`.

Series children of store targets must share the same `platformCode` and `storeId`, and the `seriesId` must belong to that store.

Product children of series targets must share the same `platformCode` and `storeId`, and the `productId` must belong to the parent series' `productIds`.

If a product belongs to more than one series, the user must explicitly choose the parent series target. The system must not infer multiple parents.

## Metric Policy

Only additive metrics can be allocated. Current additive metrics include:

1. `gmv`
2. `gsv`
3. `visitors`
4. `paidBuyers`
5. `adSpend`
6. `refundAmount`
7. `refundSuccessAmount`
8. `refundOrderCount`
9. `refundApplyCount`
10. `refundSuccessCount`
11. `afterSalesApplyCount`

Non-additive or unregistered metrics cannot form parent-child relationships. This includes conversion rate, ROI, average order value, refund rate, click rate, and ad spend rate metrics.

## Field Consistency

Parent and child targets must match:

1. `metricKey`
2. `periodType`
3. `periodValue`
4. `direction`

`targetValue` can differ. The child `targetValue` is the allocated value.

## Allocation Summary

`buildTargetAllocationSummary` derives:

1. parent target value
2. active child count
3. paused child count
4. deleted child count
5. active allocated value
6. paused allocated value
7. remaining value
8. over allocated value
9. allocation status

Only active children count toward active allocation. Paused children retain their parent relationship but do not count toward active allocation. Deleted children do not count toward allocation.

## Compatibility

Old targets without `parentTargetId` remain valid. No automatic parent relation is created from scope, name, metric, period, or value. `airburg_tmall_targets_v1` is not modified.

`deleted` is a soft-delete tombstone and remains valid for historical compatibility. Deleted parents cannot be referenced by active or paused children.

## Persistence

The existing `targets` IndexedDB object store is reused. No object store is added and `V2_INDEXEDDB_VERSION` remains unchanged. Parent relationships must round-trip through prepare, readback, and activate.

## Future UI Requirements

F1-R1 must create targets with explicit `parentTargetId: null` or a legal parent id. Standalone non-company targets must be shown as not included in upper-level allocation.

