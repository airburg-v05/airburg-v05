export type ETLSourceType =
  | "product_dimension"
  | "product_metric"
  | "plan_metric"
  | "search_total"
  | "search_product"
  | "after_sales"
  | "unsupported_after_sales"
  | "unsupported_plan_summary"
  | "unknown";

export interface UploadedFileDescriptor {
  file: File;
  platformCode?: string | null;
  platformName?: string | null;
  storeId?: string | null;
  storeName?: string | null;
}

export type UploadedFile = File | UploadedFileDescriptor;

export interface Product {
  platformCode: string;
  platformName: string | null;
  storeId: string;
  storeName: string | null;
  productId: string;
  name: string;
  brandWord: string | null;
  modelWord: string | null;
}

export interface ProductMetric {
  platformCode: string;
  platformName: string | null;
  storeId: string;
  storeName: string | null;
  productId: string;
  date: string;
  gmv: number | null;
  gsv: number | null;
  visitors: number | null;
  buyers: number | null;
}

export interface PlanMetric {
  platformCode: string;
  platformName: string | null;
  storeId: string;
  storeName: string | null;
  productId: string | null;
  planId?: string | null;
  planName?: string | null;
  date: string;
  spend: number | null;
  clicks: number | null;
  roi: number | null;
  directTransactionAmount?: number | null;
  indirectTransactionAmount?: number | null;
  totalTransactionAmount?: number | null;
}

export interface SearchTotalKeyword {
  platformCode: string;
  platformName: string | null;
  storeId: string;
  storeName: string | null;
  date: string | null;
  keyword: string;
  visitors: number | null;
  buyers: number | null;
  gmv: number | null;
}

export interface SearchProductKeyword {
  platformCode: string;
  platformName: string | null;
  storeId: string;
  storeName: string | null;
  date: string | null;
  productId: string;
  keyword: string;
  visitors: number | null;
  buyers: number | null;
}

export interface AfterSalesMetric {
  platformCode: string;
  platformName: string | null;
  storeId: string;
  storeName: string | null;
  productId: string | null;
  date: string;
  refundAmount: number | null;
  refundCount: number | null;
  shippedRefundAmount: number | null;
  shippedRefundCount: number | null;
  signedRefundAmount: number | null;
  signedRefundCount: number | null;
}

export interface BIDataSet {
  products: Product[];
  productMetrics: ProductMetric[];
  planMetrics: PlanMetric[];
  searchTotalKeywords: SearchTotalKeyword[];
  searchProductKeywords: SearchProductKeyword[];
  afterSalesMetrics: AfterSalesMetric[];
}

export type ETLIssueLevel = "warning" | "error";

export interface ETLIssue {
  level: ETLIssueLevel;
  code: string;
  message: string;
  fileName: string;
  sheetName?: string | null;
  rowIndex?: number | null;
}

export interface ETLRuntimeSummary {
  filesReceived: number;
  filesParsed: number;
  filesFailed: number;
  rowsParsed: number;
  rowsTransformed: number;
  mergedRecords: number;
  dedupedRecords: number;
}

export interface ETLRuntimeResult {
  dataset: BIDataSet;
  issues: ETLIssue[];
  errorQueue: ETLIssue[];
  summary: ETLRuntimeSummary;
}

export interface NormalizedUploadedFile {
  file: File;
  platformCode: string;
  platformName: string | null;
  storeId: string;
  storeName: string | null;
}

export interface ETLRuntimeContext {
  files: NormalizedUploadedFile[];
  dataset: BIDataSet;
  issues: ETLIssue[];
  errorQueue: ETLIssue[];
  summary: ETLRuntimeSummary;
}

const DEFAULT_PLATFORM_CODE = "tmall";
const DEFAULT_PLATFORM_NAME = "天猫";
const DEFAULT_STORE_ID = "tmall-default-store";
const DEFAULT_STORE_NAME = "天猫默认店铺";

export const createEmptyBIDataSet = (): BIDataSet => ({
  products: [],
  productMetrics: [],
  planMetrics: [],
  searchTotalKeywords: [],
  searchProductKeywords: [],
  afterSalesMetrics: [],
});

const normalizeUploadedFile = (uploadedFile: UploadedFile): NormalizedUploadedFile => {
  const isNativeFile = typeof File !== "undefined" && uploadedFile instanceof File;
  if (isNativeFile) {
    return {
      file: uploadedFile,
      platformCode: DEFAULT_PLATFORM_CODE,
      platformName: DEFAULT_PLATFORM_NAME,
      storeId: DEFAULT_STORE_ID,
      storeName: DEFAULT_STORE_NAME,
    };
  }

  const descriptor = uploadedFile as UploadedFileDescriptor;
  return {
    file: descriptor.file,
    platformCode: descriptor.platformCode?.trim() || DEFAULT_PLATFORM_CODE,
    platformName: descriptor.platformName?.trim() || DEFAULT_PLATFORM_NAME,
    storeId: descriptor.storeId?.trim() || DEFAULT_STORE_ID,
    storeName: descriptor.storeName?.trim() || DEFAULT_STORE_NAME,
  };
};

export const createETLRuntimeContext = (files: UploadedFile[]): ETLRuntimeContext => ({
  files: files.map(normalizeUploadedFile),
  dataset: createEmptyBIDataSet(),
  issues: [],
  errorQueue: [],
  summary: {
    filesReceived: files.length,
    filesParsed: 0,
    filesFailed: 0,
    rowsParsed: 0,
    rowsTransformed: 0,
    mergedRecords: 0,
    dedupedRecords: 0,
  },
});

let runtimeBIDataSet: BIDataSet | null = null;
let runtimeIssues: ETLIssue[] = [];

export const setRuntimeBIDataSet = (dataset: BIDataSet, issues: ETLIssue[] = []) => {
  runtimeBIDataSet = structuredClone(dataset);
  runtimeIssues = structuredClone(issues);
};

export const getRuntimeBIDataSet = (): BIDataSet | null =>
  runtimeBIDataSet ? structuredClone(runtimeBIDataSet) : null;

export const getRuntimeETLIssues = (): ETLIssue[] => structuredClone(runtimeIssues);

export const clearRuntimeBIDataSet = () => {
  runtimeBIDataSet = null;
  runtimeIssues = [];
};
