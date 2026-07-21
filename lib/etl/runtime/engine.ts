import {
  clearRuntimeBIDataSet,
  createETLRuntimeContext,
  getRuntimeBIDataSet,
  getRuntimeETLIssues,
  setRuntimeBIDataSet,
  type BIDataSet,
  type ETLRuntimeResult,
  type UploadedFile,
} from "./context";
import { deduplicateBIDataSet } from "../dedup-engine";
import { executeETLPipeline } from "./pipeline";

const recordCount = (dataset: BIDataSet): number =>
  dataset.products.length +
  dataset.productMetrics.length +
  dataset.planMetrics.length +
  dataset.searchTotalKeywords.length +
  dataset.searchProductKeywords.length +
  dataset.afterSalesMetrics.length;

export interface RunETLRuntimeOptions {
  brandId?: string;
  mergeMode?: "replace" | "append";
}

const mergeDataSets = (existing: BIDataSet | null, incoming: BIDataSet): BIDataSet => ({
  products: [...(existing?.products ?? []), ...incoming.products],
  productMetrics: [...(existing?.productMetrics ?? []), ...incoming.productMetrics],
  planMetrics: [...(existing?.planMetrics ?? []), ...incoming.planMetrics],
  searchTotalKeywords: [...(existing?.searchTotalKeywords ?? []), ...incoming.searchTotalKeywords],
  searchProductKeywords: [...(existing?.searchProductKeywords ?? []), ...incoming.searchProductKeywords],
  afterSalesMetrics: [...(existing?.afterSalesMetrics ?? []), ...incoming.afterSalesMetrics],
});

export async function runETLRuntime(
  files: UploadedFile[],
  options: RunETLRuntimeOptions = {},
): Promise<ETLRuntimeResult> {
  const brandId = options.brandId ?? "airburg";
  const mergeMode = options.mergeMode ?? "append";
  const context = createETLRuntimeContext(files);
  const completedContext = await executeETLPipeline(context);
  const existingDataset = mergeMode === "append" ? getRuntimeBIDataSet(brandId) : null;
  const existingIssues = mergeMode === "append" ? getRuntimeETLIssues(brandId) : [];
  const incomingRecordCount = recordCount(completedContext.dataset);

  if (incomingRecordCount > 0) {
    const mergedInput = mergeDataSets(existingDataset, completedContext.dataset);
    const merged = deduplicateBIDataSet(mergedInput);
    completedContext.dataset = merged.dataset;
    completedContext.summary.dedupedRecords += merged.removedCount;
    completedContext.summary.mergedRecords = recordCount(merged.dataset);
    setRuntimeBIDataSet(merged.dataset, [...existingIssues, ...completedContext.issues], brandId);
  } else if (existingDataset) {
    completedContext.dataset = existingDataset;
    completedContext.summary.mergedRecords = recordCount(existingDataset);
  } else {
    completedContext.summary.mergedRecords = 0;
    clearRuntimeBIDataSet();
  }

  return {
    dataset: completedContext.dataset,
    issues: completedContext.issues,
    errorQueue: completedContext.errorQueue,
    summary: completedContext.summary,
  };
}
