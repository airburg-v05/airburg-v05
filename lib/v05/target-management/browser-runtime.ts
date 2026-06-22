import { IndexedDbV2PersistenceStore } from "../persistence/indexeddb-adapter";
import { buildEmptyTargetManagementViewModel, buildTargetManagementViewModel } from "./build-view-model";
import { saveTargetDatasetMutation } from "./dataset-update";
import type {
  SaveTargetDatasetInput,
  TargetManagementLoadResult,
  TargetRuntimeContextInput,
} from "./contracts";

declare const process: {
  env?: {
    NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME?: string;
  };
};

export const getV05TargetDatabaseName = (): string =>
  process.env?.NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME?.trim() || "airburg-v05";

export const loadTargetManagementContext = async ({
  databaseName = getV05TargetDatabaseName(),
}: TargetRuntimeContextInput = {}): Promise<TargetManagementLoadResult> => {
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
          ...buildEmptyTargetManagementViewModel("本地多店铺数据不可安全读取，请先到数据质量页面处理。"),
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
        viewModel: buildEmptyTargetManagementViewModel("当前没有可用的多店铺数据，请先完成数据导入。"),
        message: "当前没有可用的多店铺数据。",
      };
    }

    const pointer = await store.getActivePointer();
    return {
      status: "valid",
      viewModel: buildTargetManagementViewModel({
        dataset,
        expectedCurrentDatasetId: pointer?.datasetId ?? dataset.datasetId,
      }),
      message: "目标数据可用。",
    };
  } catch {
    return {
      status: "error",
      viewModel: {
        ...buildEmptyTargetManagementViewModel("读取本地多店铺数据失败，请刷新后重试。"),
        mode: "error",
        primaryActions: [{ label: "数据导入", href: "/upload" }],
      },
      message: "读取本地多店铺数据失败。",
    };
  } finally {
    store.close();
  }
};

export const saveTargetManagementChange = async ({
  expectedCurrentDatasetId,
  mutation,
  now = new Date().toISOString(),
  databaseName = getV05TargetDatabaseName(),
}: SaveTargetDatasetInput) => {
  const store = await IndexedDbV2PersistenceStore.open({ databaseName });
  try {
    return await saveTargetDatasetMutation({
      store,
      expectedCurrentDatasetId,
      mutation,
      now,
    });
  } finally {
    store.close();
  }
};
