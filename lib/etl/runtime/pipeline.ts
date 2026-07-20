import { deduplicateBIDataSet } from "../dedup-engine";
import { parseBusinessDate } from "../date";
import { parseExcelWorkbook, type ParsedExcelSheet } from "../parse-excel";
import type {
  BIDataSet,
  ETLRuntimeContext,
  ETLSourceType,
  NormalizedUploadedFile,
  AfterSalesMetric,
  Product,
  ProductMetric,
} from "./context";
import { detectFileType, findField } from "./file-router";
import { pushIssue, validateBIDataSet } from "./validator";

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const parseNumber = (value: unknown): number | null => {
  const text = asText(value);
  if (!text || ["--", "-", "—", "null", "undefined", "nan"].includes(text.toLowerCase())) return null;
  const isPercent = text.includes("%");
  const normalized = text.replace(/[,，￥¥元%]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return isPercent ? parsed / 100 : parsed;
};

const readValue = (row: Record<string, unknown>, field: Parameters<typeof findField>[1]): unknown => {
  const actualField = findField(row, field);
  return actualField ? row[actualField] : null;
};

const fallbackDateForFile = (file: File): string | null => {
  const browserRelativePath = (file as { webkitRelativePath?: string }).webkitRelativePath;
  return parseBusinessDate(browserRelativePath) ?? parseBusinessDate(file.name);
};

const dateForRow = (row: Record<string, unknown>, owner: NormalizedUploadedFile): string | null =>
  parseBusinessDate(readValue(row, "date")) ?? fallbackDateForFile(owner.file);

const afterSalesDateForRow = (row: Record<string, unknown>, owner: NormalizedUploadedFile): string | null =>
  parseBusinessDate(readValue(row, "refundCompletedAt")) ??
  parseBusinessDate(readValue(row, "refundAppliedAt")) ??
  dateForRow(row, owner);

const hasAnyValue = (row: Record<string, unknown>): boolean =>
  Object.values(row).some((value) => asText(value) !== null);

const ownerFields = (owner: NormalizedUploadedFile) => ({
  platformCode: owner.platformCode,
  platformName: owner.platformName,
  storeId: owner.storeId,
  storeName: owner.storeName,
});

const pushMissingFieldWarning = (
  context: ETLRuntimeContext,
  safeFileName: string,
  sheetName: string,
  rowIndex: number,
  field: string,
) => {
  pushIssue(context, {
    level: "warning",
    code: "etl_missing_required_field",
    message: `Missing required field: ${field}.`,
    fileName: safeFileName,
    sheetName,
    rowIndex,
  });
};

const productFromRow = (
  row: Record<string, unknown>,
  owner: NormalizedUploadedFile,
): Product | null => {
  const productId = asText(readValue(row, "productId"));
  const name = asText(readValue(row, "productName"));
  if (!productId || !name) return null;
  return {
    ...ownerFields(owner),
    productId,
    name,
    brandWord: name.includes("空气堡") ? "空气堡" : null,
    modelWord: null,
  };
};

const transformProductDimension = (
  context: ETLRuntimeContext,
  sheet: ParsedExcelSheet,
  owner: NormalizedUploadedFile,
  safeFileName: string,
) => {
  sheet.rows.forEach((row, rowIndex) => {
    if (!hasAnyValue(row)) return;
    const product = productFromRow(row, owner);
    if (!product) {
      pushMissingFieldWarning(context, safeFileName, sheet.sheetName, rowIndex, "productId/productName");
      return;
    }
    context.dataset.products.push(product);
    context.summary.rowsTransformed += 1;
  });
};

const transformProductMetric = (
  context: ETLRuntimeContext,
  sheet: ParsedExcelSheet,
  owner: NormalizedUploadedFile,
  safeFileName: string,
) => {
  sheet.rows.forEach((row, rowIndex) => {
    if (!hasAnyValue(row)) return;
    const productId = asText(readValue(row, "productId"));
    const date = dateForRow(row, owner);
    if (!productId || !date) {
      pushMissingFieldWarning(context, safeFileName, sheet.sheetName, rowIndex, "productId/date");
      return;
    }
    const metric: ProductMetric = {
      ...ownerFields(owner),
      productId,
      date,
      gmv: parseNumber(readValue(row, "gmv")),
      gsv: parseNumber(readValue(row, "gsv")),
      visitors: parseNumber(readValue(row, "visitors")),
      buyers: parseNumber(readValue(row, "buyers")),
    };
    const product = productFromRow(row, owner);
    if (product) context.dataset.products.push(product);
    context.dataset.productMetrics.push(metric);
    context.summary.rowsTransformed += 1;
  });
};

const transformPlanMetric = (
  context: ETLRuntimeContext,
  sheet: ParsedExcelSheet,
  owner: NormalizedUploadedFile,
  safeFileName: string,
) => {
  sheet.rows.forEach((row, rowIndex) => {
    if (!hasAnyValue(row)) return;
    const productId = asText(readValue(row, "productId"));
    const planId = asText(readValue(row, "planId"));
    const planName = asText(readValue(row, "planName"));
    const date = dateForRow(row, owner);
    if (!date || (!productId && !planId)) {
      pushMissingFieldWarning(context, safeFileName, sheet.sheetName, rowIndex, "productId|planId/date");
      return;
    }
    context.dataset.planMetrics.push({
      ...ownerFields(owner),
      productId,
      planId,
      planName,
      date,
      spend: parseNumber(readValue(row, "spend")),
      clicks: parseNumber(readValue(row, "clicks")),
      roi: parseNumber(readValue(row, "roi")),
      directTransactionAmount: parseNumber(readValue(row, "directTransactionAmount")),
      indirectTransactionAmount: parseNumber(readValue(row, "indirectTransactionAmount")),
      totalTransactionAmount: parseNumber(readValue(row, "totalTransactionAmount")),
    });
    context.summary.rowsTransformed += 1;
  });
};

const transformSearchTotal = (
  context: ETLRuntimeContext,
  sheet: ParsedExcelSheet,
  owner: NormalizedUploadedFile,
  safeFileName: string,
) => {
  sheet.rows.forEach((row, rowIndex) => {
    if (!hasAnyValue(row)) return;
    const keyword = asText(readValue(row, "keyword"));
    const date = dateForRow(row, owner);
    if (!keyword) {
      pushMissingFieldWarning(context, safeFileName, sheet.sheetName, rowIndex, "keyword");
      return;
    }
    if (!date) {
      pushIssue(context, {
        level: "warning",
        code: "etl_search_keyword_date_missing",
        message: "Search keyword date is missing; trend date will be unavailable.",
        fileName: safeFileName,
        sheetName: sheet.sheetName,
        rowIndex,
      });
    }
    context.dataset.searchTotalKeywords.push({
      ...ownerFields(owner),
      date,
      keyword,
      visitors: parseNumber(readValue(row, "visitors")),
      buyers: parseNumber(readValue(row, "buyers")),
      gmv: parseNumber(readValue(row, "gmv")),
    });
    context.summary.rowsTransformed += 1;
  });
};

const transformSearchProduct = (
  context: ETLRuntimeContext,
  sheet: ParsedExcelSheet,
  owner: NormalizedUploadedFile,
  safeFileName: string,
) => {
  sheet.rows.forEach((row, rowIndex) => {
    if (!hasAnyValue(row)) return;
    const productId = asText(readValue(row, "productId"));
    const keyword = asText(readValue(row, "keyword"));
    const date = dateForRow(row, owner);
    if (!productId || !keyword) {
      pushMissingFieldWarning(context, safeFileName, sheet.sheetName, rowIndex, "productId/keyword");
      return;
    }
    if (!date) {
      pushIssue(context, {
        level: "warning",
        code: "etl_search_keyword_date_missing",
        message: "Search keyword date is missing; trend date will be unavailable.",
        fileName: safeFileName,
        sheetName: sheet.sheetName,
        rowIndex,
      });
    }
    context.dataset.searchProductKeywords.push({
      ...ownerFields(owner),
      date,
      productId,
      keyword,
      visitors: parseNumber(readValue(row, "visitors")),
      buyers: parseNumber(readValue(row, "buyers")),
    });
    context.summary.rowsTransformed += 1;
  });
};

interface AfterSalesAccumulator {
  refundAmount: number;
  refundAmountSeen: boolean;
  refundCount: number;
  shippedRefundAmount: number;
  shippedRefundAmountSeen: boolean;
  shippedRefundCount: number;
  signedRefundAmount: number;
  signedRefundAmountSeen: boolean;
  signedRefundCount: number;
}

const createAfterSalesAccumulator = (): AfterSalesAccumulator => ({
  refundAmount: 0,
  refundAmountSeen: false,
  refundCount: 0,
  shippedRefundAmount: 0,
  shippedRefundAmountSeen: false,
  shippedRefundCount: 0,
  signedRefundAmount: 0,
  signedRefundAmountSeen: false,
  signedRefundCount: 0,
});

const normalizeStatus = (value: unknown): string => asText(value)?.replace(/\s+/g, "") ?? "";

const isSuccessfulRefund = (row: Record<string, unknown>): boolean => {
  const refundStatus = normalizeStatus(readValue(row, "refundStatus"));
  if (refundStatus) return refundStatus.includes("成功");
  return parseBusinessDate(readValue(row, "refundCompletedAt")) !== null;
};

const isShippedRefund = (row: Record<string, unknown>): boolean => {
  const statusText = `${normalizeStatus(readValue(row, "shipmentStatus"))}${normalizeStatus(readValue(row, "signedStatus"))}`;
  if (!statusText || /未发货/.test(statusText)) return false;
  return /已寄回|已收到货|已发货|已退货|已签收|退货退款|退货/.test(statusText);
};

const isSignedRefund = (row: Record<string, unknown>): boolean => {
  const statusText = `${normalizeStatus(readValue(row, "signedStatus"))}${normalizeStatus(readValue(row, "shipmentStatus"))}`;
  return /已收到货|已签收|签收/.test(statusText);
};

const afterSalesMetricFromAccumulator = (
  owner: NormalizedUploadedFile,
  productId: string | null,
  date: string,
  accumulator: AfterSalesAccumulator,
): AfterSalesMetric => ({
  ...ownerFields(owner),
  productId,
  date,
  refundAmount: accumulator.refundAmountSeen ? accumulator.refundAmount : null,
  refundCount: accumulator.refundCount > 0 ? accumulator.refundCount : null,
  shippedRefundAmount: accumulator.shippedRefundAmountSeen ? accumulator.shippedRefundAmount : null,
  shippedRefundCount: accumulator.shippedRefundCount > 0 ? accumulator.shippedRefundCount : null,
  signedRefundAmount: accumulator.signedRefundAmountSeen ? accumulator.signedRefundAmount : null,
  signedRefundCount: accumulator.signedRefundCount > 0 ? accumulator.signedRefundCount : null,
});

const transformAfterSales = (
  context: ETLRuntimeContext,
  sheet: ParsedExcelSheet,
  owner: NormalizedUploadedFile,
  safeFileName: string,
) => {
  const grouped = new Map<string, AfterSalesAccumulator>();

  sheet.rows.forEach((row, rowIndex) => {
    if (!hasAnyValue(row)) return;
    if (!isSuccessfulRefund(row)) return;
    const date = afterSalesDateForRow(row, owner);
    if (!date) {
      pushMissingFieldWarning(context, safeFileName, sheet.sheetName, rowIndex, "refundCompletedAt/date");
      return;
    }

    const productId = asText(readValue(row, "productId"));
    const key = `${owner.platformCode}::${owner.storeId}::${productId ?? "__store__"}::${date}`;
    const accumulator = grouped.get(key) ?? createAfterSalesAccumulator();
    const refundAmount = parseNumber(readValue(row, "refundAmount"));
    accumulator.refundCount += 1;
    if (refundAmount !== null) {
      accumulator.refundAmount += refundAmount;
      accumulator.refundAmountSeen = true;
    }

    if (isShippedRefund(row)) {
      accumulator.shippedRefundCount += 1;
      if (refundAmount !== null) {
        accumulator.shippedRefundAmount += refundAmount;
        accumulator.shippedRefundAmountSeen = true;
      }
    }

    if (isSignedRefund(row)) {
      accumulator.signedRefundCount += 1;
      if (refundAmount !== null) {
        accumulator.signedRefundAmount += refundAmount;
        accumulator.signedRefundAmountSeen = true;
      }
    }

    grouped.set(key, accumulator);
  });

  grouped.forEach((accumulator, key) => {
    const [, , productIdToken, date] = key.split("::");
    context.dataset.afterSalesMetrics.push(
      afterSalesMetricFromAccumulator(
        owner,
        productIdToken === "__store__" ? null : productIdToken,
        date,
        accumulator,
      ),
    );
    context.summary.rowsTransformed += 1;
  });
};

const transformSheet = (
  context: ETLRuntimeContext,
  fileType: ETLSourceType,
  sheet: ParsedExcelSheet,
  owner: NormalizedUploadedFile,
  safeFileName: string,
) => {
  if (sheet.rows.length === 0) {
    pushIssue(context, {
      level: "warning",
      code: "etl_empty_sheet_skipped",
      message: "Empty sheet skipped.",
      fileName: safeFileName,
      sheetName: sheet.sheetName,
    });
    return;
  }

  if (fileType === "product_dimension") transformProductDimension(context, sheet, owner, safeFileName);
  else if (fileType === "product_metric") transformProductMetric(context, sheet, owner, safeFileName);
  else if (fileType === "plan_metric") transformPlanMetric(context, sheet, owner, safeFileName);
  else if (fileType === "search_total") transformSearchTotal(context, sheet, owner, safeFileName);
  else if (fileType === "search_product") transformSearchProduct(context, sheet, owner, safeFileName);
  else if (fileType === "after_sales") transformAfterSales(context, sheet, owner, safeFileName);
};

const recordCount = (dataset: BIDataSet): number =>
  dataset.products.length +
  dataset.productMetrics.length +
  dataset.planMetrics.length +
  dataset.searchTotalKeywords.length +
  dataset.searchProductKeywords.length +
  dataset.afterSalesMetrics.length;

export const executeETLPipeline = async (context: ETLRuntimeContext): Promise<ETLRuntimeContext> => {
  for (const [fileIndex, uploadedFile] of context.files.entries()) {
    const safeFileName = `uploaded_file_${fileIndex + 1}`;
    try {
      const sheets = await parseExcelWorkbook(uploadedFile.file);
      const rowCount = sheets.reduce((total, sheet) => total + sheet.rows.length, 0);
      context.summary.rowsParsed += rowCount;

      if (rowCount === 0) {
        pushIssue(context, {
          level: "warning",
          code: "etl_empty_workbook_skipped",
          message: "Workbook has no rows and was skipped.",
          fileName: safeFileName,
        });
        continue;
      }

      const fileType = detectFileType(sheets);
      console.log("[ETL Runtime] file type detected", { file: safeFileName, fileType });
      console.log("[ETL Runtime] rows parsed count", { file: safeFileName, rows: rowCount });

      if (fileType === "unsupported_plan_summary") {
        context.summary.filesFailed += 1;
        pushIssue(context, {
          level: "error",
          code: "etl_plan_summary_without_product_id_unsupported",
          message: "Plan summary without productId cannot enter product-level plan metrics.",
          fileName: safeFileName,
        });
        continue;
      }

      if (fileType === "unknown") {
        context.summary.filesFailed += 1;
        pushIssue(context, {
          level: "error",
          code: "etl_file_type_unknown",
          message: "File type could not be detected.",
          fileName: safeFileName,
        });
        continue;
      }

      const beforeTransform = recordCount(context.dataset);
      sheets.forEach((sheet) => transformSheet(context, fileType, sheet, uploadedFile, safeFileName));
      const transformed = recordCount(context.dataset) - beforeTransform;
      context.summary.filesParsed += 1;
      console.log("[ETL Runtime] transform success", { file: safeFileName, fileType, records: transformed });
    } catch {
      context.summary.filesFailed += 1;
      pushIssue(context, {
        level: "error",
        code: "etl_parse_failed",
        message: "File could not be parsed.",
        fileName: safeFileName,
      });
    }
  }

  const dedup = deduplicateBIDataSet(context.dataset);
  context.dataset = dedup.dataset;
  context.summary.dedupedRecords = dedup.removedCount;
  console.log("[ETL Runtime] dedup count", { removed: dedup.removedCount });

  const validationIssues = validateBIDataSet(context.dataset);
  context.issues.push(...validationIssues);

  return context;
};
