import { loadActiveRuntimeDatasetSnapshot } from "../../persistence/runtime-dataset-persistence";
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

const targetFoundationEmptyResult = async (): Promise<TargetManagementLoadResult> => {
  const runtimeSnapshot = await loadActiveRuntimeDatasetSnapshot();
  const runtimeHasBusinessData = runtimeSnapshot.status === "ok";
  const notice = runtimeHasBusinessData
    ? "已检测到经营首页和看板使用的 18 文件经营数据；目标设置需要先初始化四类目标基础报表。请在数据接入页完成“目标中心数据底座”导入，再设置公司、店铺、系列和商品目标。"
    : "当前没有可用的目标中心数据底座。请先在数据接入页完成“目标中心数据底座”导入，再设置公司、店铺、系列和商品目标。";

  return {
    status: "empty",
    viewModel: buildEmptyTargetManagementViewModel(notice, [
      { label: "前往数据接入", href: "/upload" },
      { label: "查看数据健康", href: "/upload/quality" },
    ]),
    message: runtimeHasBusinessData
      ? "经营数据已导入，但目标中心数据底座尚未初始化。"
      : "目标中心数据底座尚未初始化。",
  };
};

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
      return await targetFoundationEmptyResult();
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
