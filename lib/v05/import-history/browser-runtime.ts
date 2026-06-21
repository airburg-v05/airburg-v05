"use client";

import { IndexedDbV2PersistenceStore } from "../persistence/indexeddb-adapter";
import { getV05ImportDatabaseName } from "../import/browser-runtime";
import { buildImportHistoryViewModel } from "./build-history";
import type { ImportHistoryFilters, ImportHistoryLoadResult } from "./contracts";

const CORRUPTED_INSPECTION_STATUSES = new Set([
  "pointer_corrupted",
  "active_dataset_missing",
  "active_dataset_invalid",
]);

export const loadV05ImportHistory = async (
  filters: ImportHistoryFilters,
  databaseName = getV05ImportDatabaseName(),
): Promise<ImportHistoryLoadResult> => {
  const store = await IndexedDbV2PersistenceStore.open({ databaseName });
  try {
    const inspection = await store.inspectState();
    if (CORRUPTED_INSPECTION_STATUSES.has(inspection.status)) {
      return {
        status: "corrupted",
        viewModel: null,
        issueCodes: inspection.issueCodes,
        message: "本地 V2 历史数据不可安全读取，请保留当前数据并重新导入。",
      };
    }

    const metadataList = await store.listDatasetMetadata();
    if (metadataList.length === 0) {
      return {
        status: "empty",
        viewModel: null,
        issueCodes: [],
        message: "当前还没有 V2 导入记录。",
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
          message: "本地 V2 历史数据不可安全读取，请保留当前数据并重新导入。",
        };
      }
      datasets.push(dataset);
    }

    const activePointer = await store.getActivePointer();
    const activeDataset = await store.loadActiveDataset();
    const journal = await store.listActivationJournal();
    const viewModel = buildImportHistoryViewModel({
      metadataList,
      datasets,
      activePointer,
      activeDataset,
      journal,
    }, filters);

    return {
      status: viewModel.isEmpty ? "empty" : "valid",
      viewModel,
      issueCodes: inspection.issueCodes,
      message: viewModel.isEmpty ? "当前还没有 V2 导入记录。" : "导入记录已加载。",
    };
  } catch {
    return {
      status: "error",
      viewModel: null,
      issueCodes: ["history_read_error"],
      message: "读取导入记录失败，请刷新页面后重试。",
    };
  } finally {
    store.close();
  }
};
