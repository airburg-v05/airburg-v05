# V0.5 Platform And Store Data Contract

## Core Entities

### Platform

```ts
interface Platform {
  platformCode: string;
  name: string;
  status: "active" | "inactive";
}
```

Required initial platform codes:

1. `tmall`
2. `jd`
3. `pdd`
4. `douyin`
5. `youzan`

### Store

```ts
interface Store {
  storeId: string;
  platformCode: string;
  storeName: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}
```

One platform may contain many stores. A `storeId` is unique inside the app and must be paired with `platformCode`.

### ImportBatch

```ts
interface ImportBatch {
  importBatchId: string;
  platformCode: string;
  storeId: string;
  importStartedAt: string;
  importCompletedAt: string | null;
  status: "pending" | "success" | "partial_success" | "failed";
  sourceTypes: string[];
}
```

### ImportFile

```ts
interface ImportFile {
  importFileId: string;
  importBatchId: string;
  platformCode: string;
  storeId: string;
  sourceType: string;
  detectedSourceType: string;
  fileFingerprint: string;
  rowCount: number;
  status: "parsed" | "missing" | "unknown" | "error";
}
```

Do not store raw after-sales sensitive rows in business storage.

## Fact Ownership Fields

Every fact table must include:

1. `platformCode`
2. `storeId`
3. `businessDate`
4. `sourceType`
5. `importBatchId`

Examples:

```ts
interface OwnedFactBase {
  platformCode: string;
  storeId: string;
  businessDate: string;
  sourceType: string;
  importBatchId: string;
}
```

## Series

```ts
interface Series {
  seriesId: string;
  platformCode: string;
  storeId: string;
  name: string;
  productIds: string[];
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}
```

Series belongs to one store. Series may only reference products in the same `platformCode + storeId`.

## TrackedProduct

```ts
interface TrackedProduct {
  trackedProductId: string;
  platformCode: string;
  storeId: string;
  productId: string;
  displayName: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}
```

Tracked products are user-selected focus objects. Do not treat every product in an imported file as tracked.

## Target

```ts
interface Target {
  targetId: string;
  scope: "company" | "store" | "series" | "product";
  platformCode?: string;
  storeId?: string;
  seriesId?: string;
  productId?: string;
  periodType: "daily" | "monthly";
  periodValue: string;
  metricKey: string;
  targetValue: number;
  direction: "higher_is_better" | "lower_is_better";
  status: "active" | "paused";
}
```

Company targets may aggregate across stores. Store, series, and product targets must have store ownership.

## Multi-Store Isolation

1. Store-level facts must never merge across stores unless the page is explicitly company-level.
2. Series cannot reference products from another store.
3. Product board defaults must be scoped to one store.
4. Import batches cannot contain files for different stores.

## Cross-Platform Aggregation

Cross-platform aggregation is allowed only on company-level views. It must:

1. Preserve each fact's original `platformCode` and `storeId`.
2. Aggregate only comparable metrics.
3. Mark metrics with different platform definitions as incomplete or not comparable.
4. Never infer missing platform metrics as zero.

## Delete, Disable, And Migration Rules

1. Prefer `inactive` over hard delete for platform, store, series, and tracked product entities.
2. Deleting a store requires keeping old import batches or a reversible snapshot.
3. Migration must not clear legacy data.
4. Facts migrated from legacy Tmall data must be assigned to the Tmall default store.
