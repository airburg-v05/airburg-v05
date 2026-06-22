# ADR-005: Explicit Target Parent Hierarchy

## Status

Accepted for V0.5F-0.

## Context

V0.5F needs company -> store -> series -> product target allocation. The previous V2 `TargetRecord` only expressed `scope` and ownership fields, so a child target could not be safely tied to a specific parent. Inferring parent relationships from scope, name, metric key, period, or value would mix business intent with implementation guesses and was the reason `V0.5F_1_HIERARCHICAL_TARGET_ALLOCATION_AND_TARGET_DRAWER` remained blocked.

## Decision

Add a backward-compatible optional field to `TargetRecord`:

```ts
parentTargetId?: string | null
```

No separate `TargetAllocationRecord` is introduced. No new IndexedDB object store is introduced. No database version upgrade is introduced.

Each target can have at most one direct parent. The child target's `targetValue` is the allocated value for that child object. Allocation summary is derived by summing child `targetValue` values rather than storing another allocation amount.

## Rules

Only adjacent hierarchy edges are valid:

1. `company -> store`
2. `store -> series`
3. `series -> product`

All other edges are invalid, including jumps such as `company -> series`, `store -> product`, reverse edges, self references, and cycles.

Parent and child targets must share:

1. `metricKey`
2. `periodType`
3. `periodValue`
4. `direction`

Only additive metric keys can participate in allocation. Ratio, average, ROI, fee-rate, and unknown metrics are not allocatable.

## Compatibility

Legacy and old V2 targets without `parentTargetId` remain valid and are treated as standalone targets with `parentTargetId = null`. They are not automatically connected to parents.

`deleted` remains a tombstone status. Deleted targets are not hard-deleted, do not count toward active allocation, and cannot be used as an active parent for active or paused children.

## Consequences

F1-R1 can build a target drawer and hierarchy workflow using explicit relationships. It must write either `parentTargetId: null` or a legal parent target id for newly created targets. It must not infer parentage.

