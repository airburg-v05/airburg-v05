import {
  type ActiveDatasetPointer,
  type ImportBatchRecord,
  type OwnedAdPlanFact,
  type OwnedAdProductFact,
  type OwnedAfterSalesDailyAggregate,
  type OwnedBusinessProductFact,
  type StoreScope,
  type V2Dataset,
} from "../domain/models";
import {
  buildAdPlanFactKey,
  buildAdProductFactKey,
  buildAfterSalesDailyAggregateKey,
  buildAfterSalesRangeAggregateKey,
  buildBusinessProductFactKey,
  buildImportBatchKey,
  buildImportFileKey,
  buildSeriesKey,
  buildStoreKey,
  buildTargetRecordKey,
  buildTargetSemanticKey,
  buildTrackedProductKey,
} from "../domain/keys";
import type { ValidationIssue, ValidationResult } from "../domain/results";
import { pushIssue, validateResultFromIssues } from "./core";
import {
  validateActiveDatasetPointer,
  validateImportBatchRecord,
  validateImportFileRecord,
  validateMigrationManifest,
  validateOwnedAdPlanFact,
  validateOwnedAdProductFact,
  validateOwnedAfterSalesDailyAggregate,
  validateOwnedAfterSalesRangeAggregate,
  validateOwnedBusinessProductFact,
  validatePlatformRecord,
  validateSeriesRecord,
  validateStoreRecord,
  validateTargetRecord,
  validateTrackedProductRecord,
} from "./records";

type KeyBuilder<T> = (record: T) => string;

const addDuplicateKeyIssues = <T>(
  records: T[],
  buildKey: KeyBuilder<T>,
  path: string,
  issues: ValidationIssue[],
): Set<string> => {
  const keys = new Set<string>();
  const duplicates = new Set<string>();

  records.forEach((record, index) => {
    const key = buildKey(record);
    if (keys.has(key)) {
      duplicates.add(key);
      pushIssue(issues, "duplicate_key", `${path}[${index}]`, "Duplicate record key.");
    }
    keys.add(key);
  });

  return new Set([...keys].filter((key) => !duplicates.has(key)));
};

const storeKeyFromOwner = (owner: StoreScope): string =>
  buildStoreKey({ platformCode: owner.platformCode, storeId: owner.storeId });

const batchKeyFromRecord = (record: ImportBatchRecord): string =>
  buildImportBatchKey({
    platformCode: record.platformCode,
    storeId: record.storeId,
    importBatchId: record.importBatchId,
  });

const productOwnerKey = (scope: StoreScope, productId: string): string =>
  `${storeKeyFromOwner(scope)}::product::${productId}`;

const planOwnerKey = (scope: StoreScope, planId: string): string =>
  `${storeKeyFromOwner(scope)}::plan::${planId}`;

const addRecordValidationIssues = <T>(
  records: T[],
  validate: (record: unknown, path?: string) => ValidationResult,
  path: string,
  issues: ValidationIssue[],
): void => {
  records.forEach((record, index) => {
    issues.push(...validate(record, `${path}[${index}]`).issues);
  });
};

const validateOwnerReferences = (
  owner: StoreScope,
  importBatchId: string,
  path: string,
  storeKeys: Set<string>,
  batchOwners: Map<string, StoreScope>,
  issues: ValidationIssue[],
): void => {
  const storeKey = storeKeyFromOwner(owner);
  if (!storeKeys.has(storeKey)) {
    pushIssue(issues, "reference_missing", path, "Referenced store does not exist.");
  }

  const batchKey = buildImportBatchKey({ ...owner, importBatchId });
  const batchOwner = batchOwners.get(batchKey);
  if (!batchOwner) {
    pushIssue(issues, "reference_missing", path, "Referenced import batch does not exist.");
    return;
  }

  if (batchOwner.platformCode !== owner.platformCode || batchOwner.storeId !== owner.storeId) {
    pushIssue(issues, "cross_store_reference", path, "Record owner does not match import batch owner.");
  }
};

const buildProductIndexes = (
  businessFacts: OwnedBusinessProductFact[],
): {
  productByOwner: Set<string>;
  productOwnersById: Map<string, Set<string>>;
} => {
  const productByOwner = new Set<string>();
  const productOwnersById = new Map<string, Set<string>>();

  const add = (scope: StoreScope, productId: string) => {
    const ownerKey = storeKeyFromOwner(scope);
    productByOwner.add(productOwnerKey(scope, productId));
    const owners = productOwnersById.get(productId) ?? new Set<string>();
    owners.add(ownerKey);
    productOwnersById.set(productId, owners);
  };

  businessFacts.forEach((fact) => add(fact, fact.productId));

  return { productByOwner, productOwnersById };
};

const validateProductReference = (
  scope: StoreScope,
  productId: string,
  path: string,
  productByOwner: Set<string>,
  productOwnersById: Map<string, Set<string>>,
  issues: ValidationIssue[],
): void => {
  if (productByOwner.has(productOwnerKey(scope, productId))) return;

  const otherOwners = productOwnersById.get(productId);
  if (otherOwners && !otherOwners.has(storeKeyFromOwner(scope))) {
    pushIssue(issues, "cross_store_reference", path, "Product exists under a different store.");
    return;
  }

  pushIssue(issues, "reference_missing", path, "Referenced product does not exist.");
};

const validateActivePointer = (
  pointer: ActiveDatasetPointer | null,
  manifestsById: Map<string, string>,
  issues: ValidationIssue[],
): void => {
  if (!pointer) return;
  issues.push(...validateActiveDatasetPointer(pointer).issues);

  if (pointer.state !== "v2_active") return;
  if (!pointer.migrationManifestId) {
    pushIssue(issues, "migration_state_invalid", "activeDatasetPointer.migrationManifestId", "Active dataset pointer requires a manifest.");
    return;
  }

  if (manifestsById.get(pointer.migrationManifestId) === "failed") {
    pushIssue(issues, "migration_state_invalid", "activeDatasetPointer", "Failed migration manifest cannot be active.");
  }
};

export const validateV2Dataset = (dataset: V2Dataset): ValidationResult => {
  const issues: ValidationIssue[] = [];

  addRecordValidationIssues(dataset.platforms, validatePlatformRecord, "platforms", issues);
  addRecordValidationIssues(dataset.stores, validateStoreRecord, "stores", issues);
  addRecordValidationIssues(dataset.importBatches, validateImportBatchRecord, "importBatches", issues);
  addRecordValidationIssues(dataset.importFiles, validateImportFileRecord, "importFiles", issues);
  addRecordValidationIssues(dataset.businessProductFacts, validateOwnedBusinessProductFact, "businessProductFacts", issues);
  addRecordValidationIssues(dataset.adProductFacts, validateOwnedAdProductFact, "adProductFacts", issues);
  addRecordValidationIssues(dataset.adPlanFacts, validateOwnedAdPlanFact, "adPlanFacts", issues);
  addRecordValidationIssues(dataset.afterSalesDailyAggregates, validateOwnedAfterSalesDailyAggregate, "afterSalesDailyAggregates", issues);
  addRecordValidationIssues(dataset.afterSalesRangeAggregates, validateOwnedAfterSalesRangeAggregate, "afterSalesRangeAggregates", issues);
  addRecordValidationIssues(dataset.series, validateSeriesRecord, "series", issues);
  addRecordValidationIssues(dataset.trackedProducts, validateTrackedProductRecord, "trackedProducts", issues);
  addRecordValidationIssues(dataset.targets, validateTargetRecord, "targets", issues);
  addRecordValidationIssues(dataset.migrationManifests, validateMigrationManifest, "migrationManifests", issues);

  const platformCodes = new Set(dataset.platforms.map((platform) => platform.platformCode));
  const storeKeys = addDuplicateKeyIssues(dataset.stores, buildStoreKey, "stores", issues);
  addDuplicateKeyIssues(dataset.platforms, (platform) => platform.platformCode, "platforms", issues);

  dataset.stores.forEach((store, index) => {
    if (!platformCodes.has(store.platformCode)) {
      pushIssue(issues, "reference_missing", `stores[${index}].platformCode`, "Store platform does not exist.");
    }
  });

  const batchKeys = addDuplicateKeyIssues(dataset.importBatches, batchKeyFromRecord, "importBatches", issues);
  const batchOwners = new Map<string, StoreScope>();
  dataset.importBatches.forEach((batch, index) => {
    if (!storeKeys.has(storeKeyFromOwner(batch))) {
      pushIssue(issues, "reference_missing", `importBatches[${index}]`, "Import batch store does not exist.");
    }
    batchOwners.set(batchKeyFromRecord(batch), batch);
  });

  addDuplicateKeyIssues(
    dataset.importFiles,
    (file) => buildImportFileKey(file),
    "importFiles",
    issues,
  );
  dataset.importFiles.forEach((file, index) => {
    const batchKey = buildImportBatchKey(file);
    if (!batchKeys.has(batchKey)) {
      pushIssue(issues, "reference_missing", `importFiles[${index}].importBatchId`, "Import file batch does not exist.");
      return;
    }
    const batchOwner = batchOwners.get(batchKey);
    if (batchOwner && (batchOwner.platformCode !== file.platformCode || batchOwner.storeId !== file.storeId)) {
      pushIssue(issues, "cross_store_reference", `importFiles[${index}]`, "Import file owner does not match batch owner.");
    }
  });

  addDuplicateKeyIssues(dataset.businessProductFacts, buildBusinessProductFactKey, "businessProductFacts", issues);
  addDuplicateKeyIssues(dataset.adProductFacts, buildAdProductFactKey, "adProductFacts", issues);
  addDuplicateKeyIssues(dataset.adPlanFacts, buildAdPlanFactKey, "adPlanFacts", issues);
  addDuplicateKeyIssues(dataset.afterSalesDailyAggregates, buildAfterSalesDailyAggregateKey, "afterSalesDailyAggregates", issues);
  addDuplicateKeyIssues(dataset.afterSalesRangeAggregates, buildAfterSalesRangeAggregateKey, "afterSalesRangeAggregates", issues);

  const validateFacts = (
    records: Array<OwnedBusinessProductFact | OwnedAdProductFact | OwnedAdPlanFact | OwnedAfterSalesDailyAggregate>,
    path: string,
  ) => {
    records.forEach((fact, index) =>
      validateOwnerReferences(fact, fact.importBatchId, `${path}[${index}]`, storeKeys, batchOwners, issues),
    );
  };

  validateFacts(dataset.businessProductFacts, "businessProductFacts");
  validateFacts(dataset.adProductFacts, "adProductFacts");
  validateFacts(dataset.adPlanFacts, "adPlanFacts");
  validateFacts(dataset.afterSalesDailyAggregates, "afterSalesDailyAggregates");

  dataset.afterSalesRangeAggregates.forEach((aggregate, index) => {
    validateOwnerReferences(aggregate, aggregate.importBatchId, `afterSalesRangeAggregates[${index}]`, storeKeys, batchOwners, issues);
  });

  const { productByOwner, productOwnersById } = buildProductIndexes(dataset.businessProductFacts);
  addDuplicateKeyIssues(dataset.trackedProducts, buildTrackedProductKey, "trackedProducts", issues);
  const trackedProductByOwner = new Set<string>();
  dataset.trackedProducts.forEach((product, index) => {
    if (!storeKeys.has(storeKeyFromOwner(product))) {
      pushIssue(issues, "reference_missing", `trackedProducts[${index}]`, "Tracked product store does not exist.");
    }
    validateProductReference(product, product.productId, `trackedProducts[${index}].productId`, productByOwner, productOwnersById, issues);
    trackedProductByOwner.add(productOwnerKey(product, product.productId));
  });

  const seriesKeys = addDuplicateKeyIssues(dataset.series, buildSeriesKey, "series", issues);
  dataset.series.forEach((series, index) => {
    if (!storeKeys.has(storeKeyFromOwner(series))) {
      pushIssue(issues, "reference_missing", `series[${index}]`, "Series store does not exist.");
    }
    series.productIds.forEach((productId, productIndex) =>
      validateProductReference(series, productId, `series[${index}].productIds[${productIndex}]`, productByOwner, productOwnersById, issues),
    );
  });

  const planByOwner = new Set<string>();
  dataset.adPlanFacts.forEach((fact) => planByOwner.add(planOwnerKey(fact, fact.planId)));
  if (planByOwner.size < dataset.adPlanFacts.length) {
    addDuplicateKeyIssues(dataset.adPlanFacts, buildAdPlanFactKey, "adPlanFacts", issues);
  }

  addDuplicateKeyIssues(dataset.targets, buildTargetRecordKey, "targets", issues);
  const semanticKeys = new Set<string>();
  dataset.targets.forEach((target, index) => {
    const semanticKey = buildTargetSemanticKey(target);
    if (semanticKeys.has(semanticKey)) {
      pushIssue(issues, "semantic_duplicate", `targets[${index}]`, "Duplicate semantic target.");
    }
    semanticKeys.add(semanticKey);

    if (target.scope === "company") return;
    if (!target.platformCode || !target.storeId) return;
    const owner = { platformCode: target.platformCode, storeId: target.storeId };
    if (!storeKeys.has(storeKeyFromOwner(owner))) {
      pushIssue(issues, "reference_missing", `targets[${index}]`, "Target store does not exist.");
    }

    if (target.scope === "series" && target.seriesId) {
      const key = buildSeriesKey({ ...owner, seriesId: target.seriesId });
      if (!seriesKeys.has(key)) {
        pushIssue(issues, "reference_missing", `targets[${index}].seriesId`, "Target series does not exist.");
      }
    }

    if (target.scope === "product" && target.productId) {
      if (!trackedProductByOwner.has(productOwnerKey(owner, target.productId))) {
        validateProductReference(owner, target.productId, `targets[${index}].productId`, productByOwner, productOwnersById, issues);
      }
    }
  });

  dataset.adProductFacts.forEach((fact, index) => {
    validateProductReference(fact, fact.productId, `adProductFacts[${index}].productId`, productByOwner, productOwnersById, issues);
  });

  const manifestsById = new Map(dataset.migrationManifests.map((manifest) => [manifest.migrationManifestId, manifest.status]));
  validateActivePointer(dataset.activeDatasetPointer, manifestsById, issues);

  return validateResultFromIssues(issues);
};
