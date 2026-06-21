import fs from "node:fs";
import path from "node:path";
import {
  parseTmallSeriesGroupStorage,
  toTmallSeriesGroupStorage,
  type TmallSeriesGroup,
} from "../../lib/storage/tmall-series-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildSeriesBoardProductPool,
  getTmallSeriesBoardDates,
} from "../../lib/tmall/view-models/series-board";

const ROOT = process.cwd();

const createFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

const SENSITIVE_FIELD_NAMES = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "卖家真实姓名",
  "买家退款说明",
  "商家备注",
  "操作人",
  "子账号",
  "物流单号",
  "物流信息",
];

const SENSITIVE_VALUE_HEADERS = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "卖家电话",
  "卖家手机",
  "卖家退货地址",
  "物流单号",
  "物流信息",
  "买家退款说明",
  "商家备注",
  "审核操作人",
  "退款操作人",
  "子账号",
  "卖家真实姓名",
];

const normalizeLeafValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const isCheckableSensitiveValue = (value: string): boolean => {
  const placeholders = new Set(["-", "--", "无", "暂无", "空", "null", "NULL", "0"]);
  return value.length >= 4 && !placeholders.has(value);
};

const collectLeafValues = (value: unknown, values = new Set<string>()): Set<string> => {
  const normalized = normalizeLeafValue(value);
  if (normalized !== null) {
    values.add(normalized);
    return values;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectLeafValues(item, values));
    return values;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectLeafValues(item, values));
  }

  return values;
};

const collectSensitiveSourceValues = async (afterSalesFile: File): Promise<Set<string>> => {
  const table = await parseTmallTableFile(afterSalesFile);
  const values = new Set<string>();

  table.rows.forEach((row) => {
    SENSITIVE_VALUE_HEADERS.forEach((header) => {
      const normalized = normalizeLeafValue(row[header]);
      if (normalized && isCheckableSensitiveValue(normalized)) {
        values.add(normalized);
      }
    });
  });

  return values;
};

const hasInvalidNumber = (value: unknown): boolean => {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === "object") return Object.values(value).some(hasInvalidNumber);
  return false;
};

const closeTo = (actual: number, expected: number, precision = 0.01): boolean =>
  Math.abs(actual - expected) <= precision;

const storageContainsOnlyProductIds = (storage: unknown): boolean => {
  const payload = JSON.stringify(storage);
  return (
    !payload.includes("productName") &&
    !payload.includes("商品名称") &&
    !payload.includes("rows") &&
    !payload.includes("previewRows") &&
    !payload.includes("afterSales")
  );
};

const main = async () => {
  const afterSalesFile = createFile("private-samples/tmall/after-sales/当日售后退货表.xlsx");
  const result = await runTmallFourSourceAnalysis({
    businessProductFile: createFile(
      "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
    ),
    adProductFile: createFile("private-samples/tmall/ad-product/商品报表_20260619_110309.csv"),
    adPlanFile: createFile("private-samples/tmall/ad-plan/计划报表_20260619_110330.csv"),
    afterSalesFile,
    analysisTimestamp: "2026-06-19T00:00:00.000Z",
  });

  const beforePayload = JSON.stringify(result);
  const selectedDate = getTmallSeriesBoardDates(result)[0] ?? null;
  const emptyPool = buildSeriesBoardProductPool(result, selectedDate, []);
  const firstTwoProducts = emptyPool.products.slice(0, 2);
  const testGroups: TmallSeriesGroup[] = [
    {
      id: "test_series_1",
      name: "测试系列一",
      description: "验证用系列",
      productIds: firstTwoProducts.map((product) => product.productId),
      createdAt: "2026-06-19T00:00:00.000Z",
      updatedAt: "2026-06-19T00:00:00.000Z",
    },
    {
      id: "test_series_2",
      name: "测试系列二",
      productIds: [firstTwoProducts[0]?.productId].filter(Boolean),
      createdAt: "2026-06-19T00:00:00.000Z",
      updatedAt: "2026-06-19T00:00:00.000Z",
    },
  ];
  const storage = toTmallSeriesGroupStorage(testGroups);
  const parsedStorage = parseTmallSeriesGroupStorage(JSON.stringify(storage));
  const refreshedOverview =
    parsedStorage.status === "valid"
      ? buildSeriesBoardProductPool(result, selectedDate, parsedStorage.groups)
      : null;
  const editedGroups =
    parsedStorage.status === "valid"
      ? parsedStorage.groups.map((group) =>
          group.id === "test_series_1"
            ? {
                ...group,
                productIds: [firstTwoProducts[0]?.productId].filter(Boolean),
                updatedAt: "2026-06-19T01:00:00.000Z",
              }
            : group,
        )
      : [];
  const editedOverview = buildSeriesBoardProductPool(result, selectedDate, editedGroups);
  const deletedGroups = editedGroups.filter((group) => group.id !== "test_series_2");
  const corruptedStorage = parseTmallSeriesGroupStorage("{bad");
  const overview = buildSeriesBoardProductPool(result, selectedDate, testGroups);
  const firstGroup = overview.groups[0];
  const expectedGmv = firstTwoProducts.reduce((total, product) => total + product.gmv, 0);
  const expectedVisitors = firstTwoProducts.reduce((total, product) => total + product.visitors, 0);
  const afterPayload = JSON.stringify(result);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safeLeafValues = collectLeafValues({ overview, storage });
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) => safeLeafValues.has(value));
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    JSON.stringify({ overview, storage }).includes(fieldName),
  );

  const summary = {
    selectedDate,
    productCount: overview.products.length,
    createdGroupCount: overview.groups.length,
    firstGroupProductCount: firstGroup?.productCount ?? 0,
    firstGroupMatchedCount: firstGroup?.matchedProductCount ?? 0,
    firstGroupUnmatchedCount: firstGroup?.unmatchedProductCount ?? 0,
    firstGroupGmv: firstGroup?.matchedGmv ?? 0,
    firstGroupVisitors: firstGroup?.matchedVisitors ?? 0,
    storageContainsOnlyProductIds: storageContainsOnlyProductIds(storage),
    hasInvalidNumber: hasInvalidNumber(overview),
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.selectedDate === "2026-06-18" &&
    summary.productCount === 19 &&
    overview.products.every((product, index, products) => index === 0 || products[index - 1].gmv >= product.gmv) &&
    parsedStorage.status === "valid" &&
    refreshedOverview?.groups.length === 2 &&
    editedOverview.groups[0]?.productCount === 1 &&
    deletedGroups.length === 1 &&
    corruptedStorage.status === "corrupted" &&
    summary.createdGroupCount === 2 &&
    summary.firstGroupProductCount === 2 &&
    summary.firstGroupMatchedCount === 2 &&
    summary.firstGroupUnmatchedCount === 0 &&
    closeTo(summary.firstGroupGmv, expectedGmv) &&
    summary.firstGroupVisitors === expectedVisitors &&
    overview.products.some((product) => product.hasBeenGrouped) &&
    summary.storageContainsOnlyProductIds &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "series_board_validation_failed");
  process.exitCode = 1;
});
