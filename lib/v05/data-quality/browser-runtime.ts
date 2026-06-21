"use client";

import { getV05ImportDatabaseName } from "../import/browser-runtime";
import { IndexedDbV2PersistenceStore } from "../persistence/indexeddb-adapter";
import { buildDataQualityViewModel } from "./build-quality";
import type { DataQualityFilters, DataQualityLoadResult } from "./contracts";

const CORRUPTED_INSPECTION_STATUSES = new Set([
  "pointer_corrupted",
  "active_dataset_missing",
  "active_dataset_invalid",
]);

export const loadV05DataQuality = async (
  filters: Partial<DataQualityFilters> | null | undefined,
  databaseName = getV05ImportDatabaseName(),
): Promise<DataQualityLoadResult> => {
  const store = await IndexedDbV2PersistenceStore.open({ databaseName });
  try {
    const inspection = await store.inspectState();
    if (CORRUPTED_INSPECTION_STATUSES.has(inspection.status)) {
      return {
        status: "corrupted",
        viewModel: null,
        issueCodes: inspection.issueCodes,
        message: "本地 V2 数据状态不可安全读取，请返回上传页重新导入。",
      };
    }

    const metadataList = await store.listDatasetMetadata();
    if (metadataList.length === 0) {
      return {
        status: "empty",
        viewModel: null,
        issueCodes: [],
        message: "当前还没有 V2 导入批次。",
      };
    }

    const datasets = [];
    for (const metadata of metadataList) {
      const dataset = await store.loadDataset(metadata.datasetId);
      if (!dataset) {
        return {
          status: "corrupted",
          viewModel: null,
          issueCodes: ["dataset_missing"],
          message: "本地 V2 数据状态不可安全读取，请返回上传页重新导入。",
        };
      }
      datasets.push(dataset);
    }

    const activePointer = await store.getActivePointer();
    const activeDataset = await store.loadActiveDataset();
    const viewModel = buildDataQualityViewModel({
      metadataList,
      datasets,
      activePointer,
      activeDataset,
    }, filters);

    return {
      status: viewModel.isEmpty ? "empty" : "valid",
      viewModel,
      issueCodes: inspection.issueCodes,
      message: viewModel.isEmpty ? "当前还没有 V2 导入批次。" : "数据质量已加载。",
    };
  } catch {
    return {
      status: "error",
      viewModel: null,
      issueCodes: ["data_quality_read_error"],
      message: "读取数据质量状态失败，请刷新页面后重试。",
    };
  } finally {
    store.close();
  }
};
