# V05A IndexedDB Persistence Contract

## Scope

This contract describes the local Storage V2 persistence infrastructure introduced in `V0.5A-4-R1`.

It stores validated V2 datasets in browser IndexedDB. It does not connect pages, does not automatically migrate on app startup, and does not modify legacy localStorage keys.

## Databases

Production database:

`airburg-v05`

Audit database:

`airburg-v05-a4r1-audit`

Validation scripts may only use the audit database and must delete it after smoke testing.

## Object Stores

Required stores:

1. `metadata`
2. `datasetMetadata`
3. `platforms`
4. `stores`
5. `importBatches`
6. `importFiles`
7. `businessProductFacts`
8. `adProductFacts`
9. `adPlanFacts`
10. `afterSalesDailyAggregates`
11. `afterSalesRangeAggregates`
12. `afterSalesOperationalSnapshots`
13. `afterSalesDistributionItems`
14. `series`
15. `trackedProducts`
16. `targets`
17. `legacyTargetCandidates`
18. `migrationManifests`
19. `activationJournal`

## Envelope

Every V2 record store writes records as:

```ts
interface PersistedRecordEnvelope<T> {
  envelopeVersion: string;
  id: string;
  datasetId: string;
  recordKey: string;
  platformCode: string | null;
  storeId: string | null;
  businessDate: string | null;
  value: T;
}
```

The `id` is derived from `datasetId + recordKey`. Individual product IDs, plan IDs, or labels are never standalone primary keys.

## Validation

Before writing:

1. `validateV2Dataset` must pass.
2. Records must not contain `undefined`, `NaN`, or `Infinity`.
3. Records must not contain `fileName`, `rawRows`, `previewRows`, raw file content, or after-sales sensitive fields.
4. The dataset must come from a dry-run result where `status === "ready"`, `futureActivationEligible === true`, `stagingDataset !== null`, and blocking issue codes are empty.

## Activation States

Dataset metadata status:

1. `staging`
2. `validated`
3. `active`
4. `inactive_valid`
5. `failed`

Activation is forbidden for `staging`, `failed`, `ready_partial`, `blocked`, and `migration_failed` states.

## Prepare / Readback / Activate

`prepareV2Dataset` writes records and metadata but never writes the active pointer.

`readBackAndValidateV2Dataset` reloads all staged records, rebuilds the V2 dataset, validates it, and compares dataset ID, fingerprints, record counts, and record keys.

`activatePreparedV2Dataset` writes the active pointer only inside the final activation transaction.

`activateLegacySnapshotToV2` runs the three steps in order.

## Idempotence

Running the same snapshot twice must return `already_active` after the first activation. It must not duplicate business records, platform records, store records, manifests, or journal entries.

## Rollback

Rollback can switch the active pointer to an existing `active` or `inactive_valid` dataset. It must not delete datasets or legacy keys.

## Recovery

`inspectV2PersistenceState` must distinguish:

1. `empty`
2. `active_valid`
3. `staged_incomplete`
4. `failed_staging`
5. `pointer_missing`
6. `pointer_corrupted`
7. `active_dataset_missing`
8. `active_dataset_invalid`

## Privacy

V2 persistence may store only safe aggregates. After-sales raw rows, order identifiers, refund identifiers, contact details, addresses, logistics information, buyer explanations, seller notes, operators, subaccounts, file names, raw rows, preview rows, and raw payloads are forbidden.
