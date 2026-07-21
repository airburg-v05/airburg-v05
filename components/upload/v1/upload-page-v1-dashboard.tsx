"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyHomeBIDataSource,
  loadHomeBIDataSource,
  type BIHomeDataSource,
} from "@/lib/bi/bi.data-source";
import { parseExcelWorkbook } from "@/lib/etl/parse-excel";
import {
  detectFileType,
  restoreRuntimeDatasetFromSnapshot,
  runETLRuntime,
  saveRuntimeDatasetSnapshot,
  type ETLIssue,
  type ETLRuntimeResult,
  type ETLSourceType,
} from "@/lib/etl/runtime";
import { dataCenterHref, type DataCenterRouteVariant } from "@/lib/v05/data-center";
import {
  runtimeDatabaseNameForBrand,
  debugDatabaseNameForBrand,
} from "@/lib/v2/workspace/brand-workspace";
import {
  loadCrossPageDebugContext,
  saveCrossPageDebugContextPatch,
} from "@/lib/persistence/debug-context-persistence";
import { useBrandWorkspace } from "@/lib/v2/workspace/use-brand-workspace";
import {
  V1DimensionScopeBar,
  V1Sidebar,
  V1TopBar,
} from "@/components/visual-system/v1/visual-system";

type PreviewStatus = "待识别" | "已识别" | "重复已剔除" | "识别失败" | "待导入" | "导入成功" | "导入失败";
type ProductUploadStatus = "成功" | "失败" | "skipped";
type ImportMergeMode = "replace" | "append";

interface StoreOption {
  key: string;
  platformCode: string;
  platformName: string;
  storeId: string;
  storeName: string;
  open: boolean;
}

interface PendingUploadFile {
  id: string;
  file: File;
  signature: string;
  safeCode: string;
  fileType: ETLSourceType;
  status: PreviewStatus;
  sheetCount: number;
  rowCount: number;
  warningCount: number;
  duplicate: boolean;
  removed: boolean;
  errorMessage: string | null;
}

const runtimeStoreIds = (dataset: ETLRuntimeResult["dataset"], platformCode: string): string[] =>
  Array.from(new Set([
    ...dataset.products,
    ...dataset.productMetrics,
    ...dataset.planMetrics,
    ...dataset.searchTotalKeywords,
    ...dataset.searchProductKeywords,
    ...dataset.afterSalesMetrics,
  ]
    .filter((record) => record.platformCode === platformCode)
    .map((record) => record.storeId)
    .filter(Boolean)));

interface CoverageConfig {
  fileType: SupportedETLSourceType;
  title: string;
  description: string;
}

type SupportedETLSourceType =
  | "product_dimension"
  | "product_metric"
  | "plan_metric"
  | "search_total"
  | "search_product"
  | "after_sales";

const PLATFORM_OPTIONS = [
  { code: "tmall", name: "天猫", open: true },
  { code: "jd", name: "京东", open: false },
  { code: "douyin", name: "抖音", open: false },
  { code: "youzan", name: "有赞", open: false },
  { code: "pdd", name: "拼多多", open: false },
];

const DEFAULT_STORE: StoreOption = {
  key: "tmall::tmall-default-store",
  platformCode: "tmall",
  platformName: "天猫",
  storeId: "tmall-default-store",
  storeName: "天猫默认店铺",
  open: true,
};

const COVERAGE_CONFIGS: CoverageConfig[] = [
  {
    fileType: "product_dimension",
    title: "商品数据文件",
    description: "商品ID、商品名称、品牌词和型号词等商品基础信息",
  },
  {
    fileType: "product_metric",
    title: "商品经营报表",
    description: "GMV、GSV、访客、支付买家等经营指标",
  },
  {
    fileType: "plan_metric",
    title: "计划报表",
    description: "推广花费、点击、ROI 等计划推广指标",
  },
  {
    fileType: "search_total",
    title: "总搜索词访客表",
    description: "搜索词总访客、支付买家和成交表现",
  },
  {
    fileType: "search_product",
    title: "商品搜索词访客表",
    description: "商品ID与搜索词的访客和支付表现",
  },
  {
    fileType: "after_sales",
    title: "售后退货表",
    description: "只进入退款金额、退款数量和发货/签收状态安全聚合",
  },
];

const FILE_TYPE_LABELS: Record<ETLSourceType, string> = {
  product_dimension: "商品数据文件",
  product_metric: "商品经营报表",
  plan_metric: "计划报表",
  search_total: "总搜索词访客表",
  search_product: "商品搜索词访客表",
  after_sales: "售后退货表",
  unsupported_after_sales: "售后退货表（历史未支持）",
  unsupported_plan_summary: "计划汇总表（暂未支持）",
  unknown: "未识别文件",
};

const SUPPORTED_IMPORT_TYPES = new Set<ETLSourceType>([
  "product_dimension",
  "product_metric",
  "plan_metric",
  "search_total",
  "search_product",
  "after_sales",
]);

const isSupportedImportType = (fileType: ETLSourceType): fileType is SupportedETLSourceType =>
  SUPPORTED_IMPORT_TYPES.has(fileType);

const storeKey = (platformCode: string, storeId: string) => `${platformCode}::${storeId}`;

const signatureFor = (file: File) => `${file.size}:${file.lastModified}:${file.type || "unknown"}`;

const safeCodeFor = (signature: string) => {
  let hash = 0;
  for (let index = 0; index < signature.length; index += 1) {
    hash = (hash * 31 + signature.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 8).toUpperCase();
};

const buildStoreOptions = (source: BIHomeDataSource): StoreOption[] => {
  const stores = new Map<string, StoreOption>();
  source.points.forEach((point) => {
    if (!point.storeId) return;
    const platform = PLATFORM_OPTIONS.find((item) => item.code === point.platformCode);
    const key = storeKey(point.platformCode, point.storeId);
    stores.set(key, {
      key,
      platformCode: point.platformCode,
      platformName: point.platformName?.trim() || platform?.name || point.platformCode,
      storeId: point.storeId,
      storeName: point.storeName?.trim() || point.storeId,
      open: platform?.open ?? false,
    });
  });
  const sorted = Array.from(stores.values()).sort((left, right) =>
    `${left.platformName}${left.storeName}`.localeCompare(`${right.platformName}${right.storeName}`),
  );
  return sorted.length > 0 ? sorted : [DEFAULT_STORE];
};

const summarizeCoverage = (files: PendingUploadFile[]) => {
  const activeFiles = files.filter((file) => !file.removed && !file.duplicate && file.status !== "识别失败");
  return new Set(activeFiles.map((file) => file.fileType).filter(isSupportedImportType));
};

const productStatusFor = (file: PendingUploadFile): ProductUploadStatus => {
  if (file.removed || file.duplicate || file.status === "重复已剔除") return "skipped";
  if (!isSupportedImportType(file.fileType) && file.fileType !== "unknown") return "skipped";
  if (file.status === "识别失败" || file.status === "导入失败") return "失败";
  if (!isSupportedImportType(file.fileType)) return "skipped";
  return "成功";
};

const productStatusTone = (status: ProductUploadStatus) => {
  if (status === "成功") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "失败") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

const productStatusLabel = (status: ProductUploadStatus) => (status === "skipped" ? "跳过" : status);

const productStatusDescription = (file: PendingUploadFile, status: ProductUploadStatus) => {
  if (status === "成功") {
    if (file.status === "导入成功") return "已完成导入";
    if (file.status === "待导入") return "正在导入";
    return "已通过检查";
  }
  if (status === "失败") return "文件未通过检查";
  if (file.duplicate) return "重复文件已跳过";
  if (file.removed) return "已从本次批量上传中移除";
  return "暂未开放或已跳过";
};

const summarizeProductStatuses = (files: PendingUploadFile[]) =>
  files.reduce(
    (summary, file) => {
      const status = productStatusFor(file);
      if (status === "成功") summary.success += 1;
      if (status === "失败") summary.failed += 1;
      if (status === "skipped") summary.skipped += 1;
      return summary;
    },
    { success: 0, failed: 0, skipped: 0 },
  );

const buildSafeSkippedIssues = (files: PendingUploadFile[]): ETLIssue[] =>
  files
    .filter((file) => productStatusFor(file) === "skipped")
    .map((file) => ({
      level: "warning",
      code: file.duplicate
        ? "upload_duplicate_file_skipped"
        : file.fileType === "unsupported_plan_summary"
          ? "upload_unsupported_plan_summary_skipped"
          : "upload_unsupported_file_skipped",
      message: "Input was safely skipped before ETL runtime.",
      fileName: "safe_upload_input",
    }));

const hasDataSetRecords = (result: ETLRuntimeResult) =>
  result.dataset.products.length > 0 ||
  result.dataset.productMetrics.length > 0 ||
  result.dataset.planMetrics.length > 0 ||
  result.dataset.searchTotalKeywords.length > 0 ||
  result.dataset.searchProductKeywords.length > 0 ||
  result.dataset.afterSalesMetrics.length > 0;

function Sidebar() {
  return (
    <V1Sidebar
      activeLabel="数据上传"
      ariaLabel="数据上传导航"
      itemTestId="upload-page-v1-nav-item"
      sidebarTestId="upload-page-v1-sidebar"
    />
  );
}

function TopBar() {
  return <V1TopBar title="数据上传" />;
}

function ControlBar({
  stores,
  selectedStoreKey,
  onSelectStore,
  brandName,
}: {
  stores: StoreOption[];
  selectedStoreKey: string;
  onSelectStore: (key: string) => void;
  brandName: string;
}) {
  const selectedStore = stores.find((store) => store.key === selectedStoreKey);
  const selectedPlatform = selectedStore?.platformName ?? "--";
  const platformText = Array.from(new Set(stores.map((store) => store.platformName))).join("｜") || "暂无数据";
  return (
    <section className="m-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]" data-testid="upload-page-v1-control">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/80 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            LOGO
          </div>
          <div className="min-w-[240px]">
            <p className="mb-2 text-xs font-semibold text-blue-700">当前品牌 · {brandName}</p>
            <label className="block text-xs font-semibold text-slate-600">
              目标店铺
              <select
                data-testid="upload-page-v1-target-store"
                className="mt-1 min-w-[220px] rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-950 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                value={selectedStoreKey}
                onChange={(event) => onSelectStore(event.target.value)}
              >
                {stores.map((store) => (
                  <option key={store.key} value={store.key}>
                    {store.platformName} · {store.storeName}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs font-semibold text-slate-600">
              店铺数量 {stores.length}个 · 已选择 {selectedStore ? 1 : 0}个
            </p>
            <p className="mt-1 break-words text-xs font-semibold text-slate-600">
              涉及平台 {platformText} · 当前平台 {selectedPlatform}
            </p>
          </div>
        </div>
        <div
          role="tablist"
          aria-label="上传平台"
          data-testid="upload-page-v1-platform-tabs"
          className="flex flex-wrap gap-2 text-xs font-semibold"
        >
          {PLATFORM_OPTIONS.map((platform) => (
            <button
              key={platform.code}
              type="button"
              role="tab"
              aria-selected={platform.open}
              disabled={!platform.open}
              className={`rounded-xl border px-4 py-2 text-left transition ${
                platform.open
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "cursor-not-allowed border-slate-200/80 bg-slate-50/80 text-slate-400"
              }`}
            >
              <span className="block text-sm">{platform.name}</span>
              <span className="block text-[11px]">{platform.open ? "已开放" : "暂未开放"}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function CoverageCards({ files }: { files: PendingUploadFile[] }) {
  const covered = summarizeCoverage(files);
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6" data-testid="upload-page-v2-coverage">
      {COVERAGE_CONFIGS.map((config) => {
        const present = covered.has(config.fileType);
        return (
          <article
            key={config.fileType}
            data-testid="upload-page-v2-coverage-card"
            className={`rounded-xl border p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${
              present ? "border-emerald-200 bg-emerald-50" : "border-slate-200/80 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-950">{config.title}</h3>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${present ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {present ? "成功" : "跳过"}
              </span>
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{config.description}</p>
          </article>
        );
      })}
    </section>
  );
}

function RecognitionList({
  files,
  onRemove,
}: {
  files: PendingUploadFile[];
  onRemove: (id: string) => void;
}) {
  if (files.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-600" data-testid="upload-page-v2-recognition-empty">
        尚未选择文件。选择天猫数据文件后，这里只展示文件标识、文件类型和处理状态。
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]" data-testid="upload-page-v2-recognition-list">
      <div className="border-b border-slate-200/80 px-4 py-3">
        <h3 className="text-base font-semibold text-slate-950">文件识别结果</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">只展示成功、失败或跳过，不展示原始名称、原始行或原始提示内容。</p>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {files.map((item) => {
          const productStatus = productStatusFor(item);
          return (
            <article
              key={item.id}
              data-testid="upload-page-v2-recognition-item"
              data-product-status={productStatus}
              className={`rounded-xl border p-4 ${item.removed ? "border-slate-200 bg-slate-50/70 text-slate-400" : "border-slate-200/80 bg-white"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500">文件标识</p>
                  <p className="mt-1 break-all text-sm font-semibold text-slate-950">{item.safeCode}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${productStatusTone(productStatus)}`}>
                  {productStatusLabel(productStatus)}
                </span>
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">文件类型</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{FILE_TYPE_LABELS[item.fileType]}</p>
              </div>
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">{productStatusDescription(item, productStatus)}</p>
              <button
                type="button"
                className="mt-4 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                onClick={() => onRemove(item.id)}
              >
                移除
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ResultSummary({
  result,
  statusCounts,
  persistenceStatus,
  routeVariant,
}: {
  result: "idle" | "success" | "partial" | "failed";
  statusCounts: ReturnType<typeof summarizeProductStatuses>;
  persistenceStatus: "idle" | "saved" | "failed";
  routeVariant: DataCenterRouteVariant;
}) {
  if (result === "idle") return null;
  const tone = result === "failed" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  const title = result === "success" ? "导入成功" : result === "partial" ? "部分成功" : "导入失败";
  const homeHref = routeVariant === "v2" ? "/v2/home" : "/home";
  const historyHref = dataCenterHref("history", null, { routeVariant });
  return (
    <section className={`rounded-xl border p-4 ${tone}`} data-testid="upload-page-v2-result-summary">
      <h3 className="text-base font-semibold">{title}</h3>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm font-semibold">
        <div className="rounded-xl bg-white/70 px-3 py-2">
          <dt className="text-xs text-emerald-700">成功</dt>
          <dd className="mt-1 text-xl text-slate-950">{statusCounts.success}</dd>
        </div>
        <div className="rounded-xl bg-white/70 px-3 py-2">
          <dt className="text-xs text-rose-700">失败</dt>
          <dd className="mt-1 text-xl text-slate-950">{statusCounts.failed}</dd>
        </div>
        <div className="rounded-xl bg-white/70 px-3 py-2">
          <dt className="text-xs text-slate-600">跳过</dt>
          <dd className="mt-1 text-xl text-slate-950">{statusCounts.skipped}</dd>
        </div>
      </dl>
      {persistenceStatus === "saved" ? (
        <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold" data-testid="upload-page-v2-persistence-success">
          已保存本次安全聚合数据，刷新页面后可继续查看；不会保存原始 Excel / CSV、文件名或明细行。
        </p>
      ) : null}
      {persistenceStatus === "failed" ? (
        <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold" data-testid="upload-page-v2-persistence-failed">
          本次导入已完成，但本浏览器安全聚合数据暂未保存；请重新导入后再刷新页面。
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="rounded-xl border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_1px_3px_rgba(15,23,42,0.06)]" href={homeHref}>
          查看经营首页
        </Link>
        <Link className="rounded-xl border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_1px_3px_rgba(15,23,42,0.06)]" href={historyHref}>
          查看历史数据
        </Link>
      </div>
    </section>
  );
}

export function UploadPageV1Dashboard({
  layoutMode = "legacy",
  routeVariant = "legacy",
}: {
  layoutMode?: "legacy" | "embedded";
  routeVariant?: DataCenterRouteVariant;
} = {}) {
  const { brand, hydrated } = useBrandWorkspace();
  const [dataSource, setDataSource] = useState<BIHomeDataSource>(() => createEmptyHomeBIDataSource("loading", "读取中"));
  const [dataSourceBrandId, setDataSourceBrandId] = useState<string | null>(null);
  const [selectedStoreKey, setSelectedStoreKey] = useState(DEFAULT_STORE.key);
  const [manualStores, setManualStores] = useState<StoreOption[]>([]);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreId, setNewStoreId] = useState("");
  const [storeMessage, setStoreMessage] = useState<string | null>(null);
  const [mergeMode, setMergeMode] = useState<ImportMergeMode>("replace");
  const [pendingFiles, setPendingFiles] = useState<PendingUploadFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "partial" | "failed">("idle");
  const [persistenceStatus, setPersistenceStatus] = useState<"idle" | "saved" | "failed">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    loadHomeBIDataSource({
      includeV05Persistence: routeVariant !== "v2",
      brandId: brand.id,
    })
      .then((source) => {
        if (!active) return;
        setDataSource(source);
        setDataSourceBrandId(brand.id);
        const stores = buildStoreOptions(source);
        setSelectedStoreKey((current) => (stores.some((store) => store.key === current) ? current : stores[0]?.key ?? DEFAULT_STORE.key));
      })
      .catch(() => {
        if (!active) return;
        setDataSource(createEmptyHomeBIDataSource("error", "读取失败"));
      });
    return () => {
      active = false;
    };
  }, [brand.id, hydrated, routeVariant]);

  const stores = useMemo(() => {
    const merged = new Map<string, StoreOption>();
    [...buildStoreOptions(dataSource), ...manualStores].forEach((store) => merged.set(store.key, store));
    return Array.from(merged.values());
  }, [dataSource, manualStores]);
  const selectedStore = stores.find((store) => store.key === selectedStoreKey);
  const coveredTypes = summarizeCoverage(pendingFiles);
  const missingTypes = COVERAGE_CONFIGS.filter((config) => !coveredTypes.has(config.fileType)).map((config) => config.title);
  const activeFiles = pendingFiles.filter((file) => !file.removed && !file.duplicate);
  const importableFiles = activeFiles.filter((file) => file.status !== "识别失败" && isSupportedImportType(file.fileType));
  const statusCounts = summarizeProductStatuses(pendingFiles);
  const canImport = hydrated && dataSourceBrandId === brand.id && !!selectedStore && selectedStore.open && importableFiles.length > 0 && !importing;
  const isEmbedded = layoutMode === "embedded";

  const addStore = () => {
    const storeName = newStoreName.trim();
    if (!storeName) {
      setStoreMessage("请输入店铺名称。");
      return;
    }
    const normalizedId = newStoreId
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `tmall-store-${Date.now()}`;
    const key = storeKey("tmall", normalizedId);
    if (stores.some((store) => store.key === key)) {
      setStoreMessage("该店铺 ID 已存在，请直接选择或更换 ID。");
      return;
    }
    const store: StoreOption = {
      key,
      platformCode: "tmall",
      platformName: "天猫",
      storeId: normalizedId,
      storeName,
      open: true,
    };
    setManualStores((current) => [...current, store]);
    setSelectedStoreKey(key);
    setNewStoreName("");
    setNewStoreId("");
    setStoreMessage("新店铺已选为本次上传目标；如需保留已有店铺数据，请选择“追加店铺/批次”。");
    if (dataSource.dataStatus.hasRealData) setMergeMode("append");
  };

  const previewFile = async (file: File, id: string, signature: string, duplicate: boolean): Promise<PendingUploadFile> => {
    const safeCode = safeCodeFor(signature);
    if (duplicate) {
      return {
        id,
        file,
        signature,
        safeCode,
        fileType: "unknown",
        status: "重复已剔除",
        sheetCount: 0,
        rowCount: 0,
        warningCount: 1,
        duplicate: true,
        removed: false,
        errorMessage: null,
      };
    }

    try {
      const sheets = await parseExcelWorkbook(file);
      const rowCount = sheets.reduce((total, sheet) => total + sheet.rows.length, 0);
      const fileType = detectFileType(sheets);
      const supported = isSupportedImportType(fileType);
      const warningCount = supported ? 0 : 1;
      const unsupportedMessage =
        fileType === "unsupported_plan_summary"
            ? "计划汇总表缺少商品ID，已跳过商品级计划指标"
            : "暂未匹配到已开放的天猫文件类型，不影响其它文件导入";
      return {
        id,
        file,
        signature,
        safeCode,
        fileType,
        status: supported ? "已识别" : "识别失败",
        sheetCount: sheets.length,
        rowCount,
        warningCount,
        duplicate: false,
        removed: false,
        errorMessage: supported ? null : unsupportedMessage,
      };
    } catch {
      return {
        id,
        file,
        signature,
        safeCode,
        fileType: "unknown",
        status: "识别失败",
        sheetCount: 0,
        rowCount: 0,
        warningCount: 1,
        duplicate: false,
        removed: false,
        errorMessage: "文件无法解析",
      };
    }
  };

  const handleSelectFiles = async (selectedFiles: FileList | null) => {
    const files = Array.from(selectedFiles ?? []);
    if (files.length === 0) return;
    setResult("idle");
    setPersistenceStatus("idle");

    const seen = new Set(pendingFiles.filter((file) => !file.removed && !file.duplicate).map((file) => file.signature));
    const previews: PendingUploadFile[] = [];
    for (const [index, file] of files.entries()) {
      const signature = signatureFor(file);
      const duplicate = seen.has(signature);
      if (!duplicate) seen.add(signature);
      previews.push(await previewFile(file, `${signature}:${Date.now()}:${index}`, signature, duplicate));
    }
    setPendingFiles((current) => [...current, ...previews]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = (id: string) => {
    setPendingFiles((current) => current.filter((file) => file.id !== id));
    setResult("idle");
    setPersistenceStatus("idle");
  };

  const handleClearAll = () => {
    setPendingFiles([]);
    setResult("idle");
    setPersistenceStatus("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    if (!hydrated || !selectedStore || !selectedStore.open || importableFiles.length === 0) return;
    const previousStoreIds = buildStoreOptions(dataSource)
      .filter((store) => store.platformCode === selectedStore.platformCode)
      .map((store) => store.storeId);
    setImporting(true);
    setResult("idle");
    setPersistenceStatus("idle");
    const importableIds = new Set(importableFiles.map((file) => file.id));
    setPendingFiles((current) => current.map((file) => (importableIds.has(file.id) ? { ...file, status: "待导入" } : file)));

    try {
      if (mergeMode === "append") {
        await restoreRuntimeDatasetFromSnapshot({
          brandId: brand.id,
          databaseName: runtimeDatabaseNameForBrand(brand.id),
        });
      }
      const runtimeResult = await runETLRuntime(
        importableFiles.map((item) => ({
          file: item.file,
          platformCode: selectedStore.platformCode,
          platformName: selectedStore.platformName,
          storeId: selectedStore.storeId,
          storeName: selectedStore.storeName,
        })),
        { brandId: brand.id, mergeMode },
      );
      const safeSkippedIssues = buildSafeSkippedIssues(pendingFiles);
      const hasRecords = hasDataSetRecords(runtimeResult);
      let persisted = false;
      if (hasRecords) {
        const saveResult = await saveRuntimeDatasetSnapshot(
          runtimeResult.dataset,
          [...runtimeResult.issues, ...runtimeResult.errorQueue, ...safeSkippedIssues],
          runtimeResult.summary,
          {
            brandId: brand.id,
            databaseName: runtimeDatabaseNameForBrand(brand.id),
            platformCode: selectedStore.platformCode,
            storeId: selectedStore.storeId,
            mergeMode,
          },
        );
        persisted = saveResult.status === "saved";
        if (persisted && mergeMode === "append") {
          const debugOptions = { databaseName: debugDatabaseNameForBrand(brand.id) };
          const debugResult = await loadCrossPageDebugContext(debugOptions);
          const nextStoreIds = runtimeStoreIds(runtimeResult.dataset, selectedStore.platformCode);
          if (
            debugResult.status === "ok" &&
            debugResult.snapshot.selectedStores.length > 0 &&
            previousStoreIds.length > 0 &&
            previousStoreIds.every((storeId) => debugResult.snapshot.selectedStores.includes(storeId)) &&
            nextStoreIds.length > previousStoreIds.length
          ) {
            await saveCrossPageDebugContextPatch({ selectedStores: nextStoreIds }, debugOptions);
          }
        }
      }
      setPendingFiles((current) =>
        current.map((file) =>
          importableIds.has(file.id)
            ? { ...file, status: hasRecords ? "导入成功" : "导入失败" }
            : file,
        ),
      );
      setPersistenceStatus(hasRecords ? (persisted ? "saved" : "failed") : "idle");
      setResult(hasRecords ? (runtimeResult.summary.filesFailed > 0 || missingTypes.length > 0 ? "partial" : "success") : "failed");
      setDataSource(await loadHomeBIDataSource({ includeV05Persistence: false, brandId: brand.id }));
      setDataSourceBrandId(brand.id);
    } catch {
      setPendingFiles((current) => current.map((file) => (importableIds.has(file.id) ? { ...file, status: "导入失败" } : file)));
      setResult("failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      data-testid="upload-page-v1-dashboard"
      data-layout-mode={layoutMode}
      data-route-variant={routeVariant}
      data-problem-ids="PVM2-010 PVM2-013"
      className={
        isEmbedded
          ? "min-w-0 text-slate-950"
          : "fixed inset-0 z-50 flex overflow-hidden bg-[#F5F7FB] text-slate-950"
      }
    >
      {isEmbedded ? null : <Sidebar />}
      <main className={isEmbedded ? "min-w-0" : "flex min-w-0 flex-1 flex-col overflow-hidden"}>
        {isEmbedded ? null : <TopBar />}
        <div className={isEmbedded ? "min-w-0" : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden"}>
          <ControlBar
            brandName={brand.name}
            stores={stores}
            selectedStoreKey={selectedStoreKey}
            onSelectStore={setSelectedStoreKey}
          />
          {routeVariant === "v2" ? (
            <section className="mx-4 mb-4 rounded-xl border border-slate-200 bg-white p-4" data-testid="v2-upload-brand-store-strategy">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">导入策略</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">默认替换可避免历史经营事实继续混入；只有新增店铺或连续批次确需合并时才使用追加。</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className={`cursor-pointer rounded-lg border p-3 ${mergeMode === "replace" ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}>
                      <input checked={mergeMode === "replace"} onChange={() => setMergeMode("replace")} type="radio" />
                      <span className="ml-2 text-sm font-semibold text-slate-800">替换当前品牌数据</span>
                      <span className="mt-1 block text-xs text-slate-500">推荐。活动快照只包含本次成功导入的数据。</span>
                    </label>
                    <label className={`cursor-pointer rounded-lg border p-3 ${mergeMode === "append" ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}>
                      <input checked={mergeMode === "append"} onChange={() => setMergeMode("append")} type="radio" />
                      <span className="ml-2 text-sm font-semibold text-slate-800">追加店铺/批次</span>
                      <span className="mt-1 block text-xs text-slate-500">用于多店铺汇总；合并后按事实主键安全去重。</span>
                    </label>
                  </div>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">新增天猫店铺</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">多平台数据模型已保留；当前真实文件适配器只开放天猫，京东/抖音仍需独立授权与字段验证。</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <input className="form-input" onChange={(event) => setNewStoreName(event.target.value)} placeholder="店铺名称" value={newStoreName} />
                    <input className="form-input" onChange={(event) => setNewStoreId(event.target.value)} placeholder="店铺 ID（可留空）" value={newStoreId} />
                    <button className="secondary-button justify-center" onClick={addStore} type="button">添加并选择</button>
                  </div>
                  {storeMessage ? <p className="mt-2 text-xs font-medium text-blue-700">{storeMessage}</p> : null}
                </div>
              </div>
            </section>
          ) : null}
          {isEmbedded ? null : (
            <V1DimensionScopeBar
              testId="upload-page-v1-dimension-scope"
              platform={selectedStore?.platformName ?? "天猫"}
              store={selectedStore?.storeName ?? "请选择目标店铺"}
              series="导入后由看板配置"
              product="导入后由看板配置"
            />
          )}
          <section className="mx-auto w-full max-w-[1440px] px-4 pb-8">
            {!selectedStore ? (
              <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm font-semibold text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                请先选择目标店铺。
              </div>
            ) : !selectedStore.open ? (
              <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm font-semibold text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                该平台上传暂未开放。
              </div>
            ) : (
              <div className="space-y-4">
                <section data-testid="upload-page-v1-upload-section" className="space-y-4" data-problem-ids="PVM2-010 PVM2-011">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-950">批量上传</h2>
                  </div>
                <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h1 className="text-xl font-semibold text-slate-950">选择天猫数据文件</h1>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        一次选择多个天猫文件，系统自动识别类型并生成经营看板可读取的数据。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={fileInputRef}
                        data-testid="upload-page-v2-multiple-input"
                        type="file"
                        multiple
                        accept=".xls,.xlsx,.csv"
                        className="hidden"
                        onChange={(event) => void handleSelectFiles(event.currentTarget.files)}
                      />
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200/80 bg-slate-950 px-5 py-2 text-sm font-semibold text-white"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        选择文件
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200/80 bg-white px-5 py-2 text-sm font-semibold text-slate-950 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                        onClick={handleClearAll}
                      >
                        清空本次选择
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm font-semibold text-slate-600">
                    <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">成功：<span>{statusCounts.success}</span></div>
                    <div className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">失败：<span>{statusCounts.failed}</span></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">跳过：<span>{statusCounts.skipped}</span></div>
                  </div>
                </section>

                <CoverageCards files={pendingFiles} />
                <RecognitionList files={pendingFiles} onRemove={handleRemoveFile} />

                <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]" data-testid="upload-page-v2-import-actions">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">导入前检查摘要</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-600">
                        只处理已通过检查的文件；失败或跳过不影响其它文件。
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="upload-page-v2-import-button"
                      disabled={!canImport}
                      className="rounded-xl border border-slate-200/80 bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                      onClick={handleImport}
                    >
                      {importing ? "导入中..." : "批量导入"}
                    </button>
                  </div>
                  <p data-testid="upload-page-v2-duplicate-notice" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    当前批次重复文件会自动跳过；失败或跳过不影响其它已识别文件。
                  </p>
                </section>

                <ResultSummary
                  result={result}
                  statusCounts={statusCounts}
                  persistenceStatus={persistenceStatus}
                  routeVariant={routeVariant}
                />
                </section>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
