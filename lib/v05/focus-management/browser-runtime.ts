import { IndexedDbV2PersistenceStore } from "../persistence/indexeddb-adapter";
import {
  buildEmptyFocusViewModel,
  buildFocusManagementViewModel,
  resolveFocusStore,
} from "./context";
import {
  saveFocusDatasetMutation,
} from "./dataset-update";
import type {
  FocusManagementLoadResult,
  FocusRuntimeContextInput,
  SaveFocusDatasetInput,
} from "./contracts";

declare const process: {
  env?: {
    NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME?: string;
  };
};

export const getV05FocusDatabaseName = (): string =>
  process.env?.NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME?.trim() || "airburg-v05";

export const loadFocusManagementContext = async ({
  platformCode,
  storeId,
  databaseName = getV05FocusDatabaseName(),
  basePath,
}: FocusRuntimeContextInput & { basePath: string }): Promise<FocusManagementLoadResult> => {
  const store = await IndexedDbV2PersistenceStore.open({ databaseName });
  try {
    const inspection = await store.inspectState();
    if (
      inspection.status === "pointer_corrupted" ||
      inspection.status === "active_dataset_missing" ||
      inspection.status === "active_dataset_invalid"
    ) {
      return {
        status: "corrupted",
        viewModel: {
          ...buildEmptyFocusViewModel("本地多店铺数据不可安全读取，请先到数据质量页面处理。"),
          mode: "corrupted",
          primaryActions: [{ label: "查看数据质量", href: "/upload/quality" }],
        },
        message: "本地多店铺数据不可安全读取。",
      };
    }

    const dataset = await store.loadActiveDataset();
    if (!dataset) {
      return {
        status: "empty",
        viewModel: buildEmptyFocusViewModel("当前没有 active 多店铺数据，请先完成数据导入。"),
        message: "当前没有 active 多店铺数据。",
      };
    }

    const resolved = resolveFocusStore({ dataset, platformCode, storeId });
    const viewModel = buildFocusManagementViewModel({
      dataset,
      platformCode: resolved.requestedPlatformCode,
      storeId: resolved.requestedStoreId,
      basePath,
    });
    return {
      status: viewModel.mode === "invalid_store" ? "invalid_store" : "valid",
      viewModel,
      message: viewModel.notices[0] ?? "数据可用。",
    };
  } catch {
    return {
      status: "error",
      viewModel: {
        ...buildEmptyFocusViewModel("读取本地多店铺数据失败，请刷新后重试。"),
        mode: "error",
        primaryActions: [{ label: "数据导入", href: "/upload" }],
      },
      message: "读取本地多店铺数据失败。",
    };
  } finally {
    store.close();
  }
};

export const saveFocusManagementChange = async ({
  expectedCurrentDatasetId,
  platformCode,
  storeId,
  mutation,
  now = new Date().toISOString(),
  databaseName = getV05FocusDatabaseName(),
}: SaveFocusDatasetInput) => {
  const store = await IndexedDbV2PersistenceStore.open({ databaseName });
  try {
    return await saveFocusDatasetMutation({
      store,
      expectedCurrentDatasetId,
      platformCode,
      storeId,
      mutation,
      now,
    });
  } finally {
    store.close();
  }
};
