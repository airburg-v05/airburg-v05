import type {
  AfterSalesAggregates,
  TmallDateRange,
  TmallFourSourceAnalysisResult,
  TmallSourceHealth,
  TmallSourceType,
} from "../../../types/tmall";
import { aggregateAdPlanDailyFacts } from "../aggregators/ad-plan-daily-aggregator";
import { aggregateAdProductDailyFacts } from "../aggregators/ad-product-daily-aggregator";
import { aggregateAfterSales } from "../aggregators/after-sales-aggregator";
import { aggregateProductDailyFacts } from "../aggregators/product-daily-aggregator";
import {
  calculateJoinQuality,
  calculateReconciliation,
  getDateRange,
  markProductsWithAdData,
} from "../calculations";
import { parseAdPlanSource, type AdPlanRecord } from "../parsers/ad-plan-parser";
import { parseAdProductSource, type AdProductRecord } from "../parsers/ad-product-parser";
import { parseAfterSalesSource, type AfterSalesRecord } from "../parsers/after-sales-parser";
import { parseBusinessProductSource, type BusinessProductRecord } from "../parsers/business-product-parser";
import {
  createMissingSourceHealth,
  type ParserResult,
} from "../parsers/parser-utils";

export interface RunTmallFourSourceAnalysisInput {
  businessProductFile?: File | null;
  adProductFile?: File | null;
  adPlanFile?: File | null;
  afterSalesFile?: File | null;
  analysisTimestamp?: string;
}

const emptyAfterSalesAggregates = (): AfterSalesAggregates => ({
  byApplyDate: [],
  bySuccessDate: [],
  byPaymentDate: [],
  reasonDistribution: [],
  statusDistribution: [],
  productSummary: [],
  unknownStatus: [],
});

const createErrorHealth = (
  expectedSourceType: TmallSourceType,
  file: File,
): TmallSourceHealth => ({
  sourceType: "unknown",
  expectedSourceType,
  status: "error",
  fileName: file.name,
  encoding: null,
  sheetNames: [],
  headerRowNumber: null,
  headers: [],
  rowCount: 0,
  missingRequiredFields: [],
  invalidDateCount: 0,
  invalidIdCount: 0,
  summaryRowCount: 0,
  unknownStatuses: [],
  warningTypes: ["parse_error"],
});

const parseOptionalSource = async <TRecord>(
  expectedSourceType: TmallSourceType,
  file: File | null | undefined,
  parser: (file: File) => Promise<ParserResult<TRecord>>,
): Promise<ParserResult<TRecord>> => {
  if (!file) {
    return {
      health: createMissingSourceHealth(expectedSourceType),
      records: [],
    };
  }

  try {
    return await parser(file);
  } catch {
    return {
      health: createErrorHealth(expectedSourceType, file),
      records: [],
    };
  }
};

const dateRangeFromRecords = <TRecord>(
  records: TRecord[],
  getDate: (record: TRecord) => string | null,
): TmallDateRange => getDateRange(records.map(getDate));

const dateRangeFromFacts = <TFact extends { date: string }>(facts: TFact[]): TmallDateRange =>
  getDateRange(facts.map((fact) => fact.date));

const collectHealthWarnings = (sourceHealth: Record<TmallSourceType, TmallSourceHealth>): string[] =>
  Object.entries(sourceHealth).flatMap(([sourceType, health]) =>
    health.warningTypes.map((warningType) => `${sourceType}:${warningType}`),
  );

const buildDateAlignmentWarnings = (
  productRange: TmallDateRange,
  adProductRange: TmallDateRange,
  adPlanRange: TmallDateRange,
): string[] => {
  const warnings: string[] = [];

  if (productRange.start && adProductRange.start) {
    const productDates = new Set([productRange.start, productRange.end].filter(Boolean));
    if (![adProductRange.start, adProductRange.end].some((date) => date && productDates.has(date))) {
      warnings.push("date_alignment:business_product_ad_product_no_simple_overlap");
    }
  }

  if (adProductRange.start && adPlanRange.start && (adProductRange.start !== adPlanRange.start || adProductRange.end !== adPlanRange.end)) {
    warnings.push("date_alignment:ad_product_ad_plan_range_different");
  }

  return warnings;
};

export const runTmallFourSourceAnalysis = async ({
  businessProductFile,
  adProductFile,
  adPlanFile,
  afterSalesFile,
  analysisTimestamp = new Date().toISOString(),
}: RunTmallFourSourceAnalysisInput): Promise<TmallFourSourceAnalysisResult> => {
  const businessProduct = await parseOptionalSource<BusinessProductRecord>(
    "business_product",
    businessProductFile,
    parseBusinessProductSource,
  );
  const adProduct = await parseOptionalSource<AdProductRecord>(
    "ad_product",
    adProductFile,
    parseAdProductSource,
  );
  const adPlan = await parseOptionalSource<AdPlanRecord>(
    "ad_plan",
    adPlanFile,
    parseAdPlanSource,
  );
  const afterSales = await parseOptionalSource<AfterSalesRecord>(
    "after_sales",
    afterSalesFile,
    parseAfterSalesSource,
  );

  const adProductDailyFacts = aggregateAdProductDailyFacts(adProduct.records);
  const adPlanDailyFacts = aggregateAdPlanDailyFacts(adPlan.records);
  const productDailyFacts = markProductsWithAdData(
    aggregateProductDailyFacts(businessProduct.records),
    adProductDailyFacts,
  );
  const afterSalesAggregates =
    afterSales.records.length > 0 ? aggregateAfterSales(afterSales.records, analysisTimestamp) : emptyAfterSalesAggregates();

  const sourceHealth: Record<TmallSourceType, TmallSourceHealth> = {
    business_product: businessProduct.health,
    ad_product: adProduct.health,
    ad_plan: adPlan.health,
    after_sales: afterSales.health,
  };

  const dateRanges: Record<TmallSourceType, TmallDateRange> = {
    business_product: dateRangeFromFacts(productDailyFacts),
    ad_product: dateRangeFromFacts(adProductDailyFacts),
    ad_plan: dateRangeFromFacts(adPlanDailyFacts),
    after_sales: dateRangeFromRecords(afterSales.records, (record) => record.applyDate),
  };

  const joinQuality = calculateJoinQuality(
    productDailyFacts,
    adProduct.records,
    adPlanDailyFacts,
    afterSales.records.map((record) => record.productId).filter((productId): productId is string => !!productId),
  );
  const reconciliation = calculateReconciliation(adProductDailyFacts, adPlanDailyFacts);
  const dateAlignmentWarnings = buildDateAlignmentWarnings(
    dateRanges.business_product,
    dateRanges.ad_product,
    dateRanges.ad_plan,
  );

  return {
    version: "tmall_four_source_v1",
    analysisTimestamp,
    sourceHealth,
    dateRanges,
    productDailyFacts,
    adProductDailyFacts,
    adPlanDailyFacts,
    afterSalesAggregates,
    joinQuality,
    reconciliation,
    dataQualityWarnings: [
      ...collectHealthWarnings(sourceHealth),
      ...dateAlignmentWarnings,
      ...(afterSalesAggregates.unknownStatus.length > 0 ? ["after_sales:unknown_status"] : []),
      ...(reconciliation.reconciliationStatus === "different" ? ["reconciliation:ad_report_difference"] : []),
    ],
  };
};

