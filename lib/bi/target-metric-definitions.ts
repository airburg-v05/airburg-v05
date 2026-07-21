export type TargetMetricScope = "brand" | "platform" | "series" | "product";

export type TargetMetricFormat = "money" | "integer" | "percent" | "ratio" | "days";

export type TargetMetricDirection = "higher_is_better" | "lower_is_better" | "budget";

export type BoardTargetDirection = "higher" | "lower" | "budget";

export type TargetMetricRule = "required" | "derived" | "unsupported";

export interface TargetMetricDefinition {
  metricKey: string;
  title: string;
  unit: string;
  format: TargetMetricFormat;
  direction: TargetMetricDirection;
  supportedScopes: TargetMetricScope[];
  targetRule: TargetMetricRule;
  deriveFormula: string | null;
  deriveDependencies: string[];
  showInTargetInput: boolean;
  unsupportedReason?: string;
}

export interface BoardTargetKpiDefinition {
  key: string;
  title: string;
  unit: string;
  direction: BoardTargetDirection;
  metricKey: string;
  format: TargetMetricFormat;
  targetRule: TargetMetricRule;
  deriveFormula: string | null;
  deriveDependencies: string[];
  showInTargetInput: boolean;
  unsupportedReason?: string;
}

const ALL_SCOPES: TargetMetricScope[] = ["brand", "platform", "series", "product"];
const PLATFORM_ONLY: TargetMetricScope[] = ["brand", "platform"];

const requiredTarget = {
  targetRule: "required" as const,
  deriveFormula: null,
  deriveDependencies: [],
  showInTargetInput: true,
};

const unsupportedTarget = (unsupportedReason: string) => ({
  targetRule: "unsupported" as const,
  deriveFormula: null,
  deriveDependencies: [],
  showInTargetInput: false,
  unsupportedReason,
});

export const TARGET_METRIC_DEFINITIONS: TargetMetricDefinition[] = [
  {
    metricKey: "gmv",
    title: "GMV",
    unit: "元",
    format: "money",
    direction: "higher_is_better",
    supportedScopes: ALL_SCOPES,
    ...requiredTarget,
  },
  {
    metricKey: "gsv",
    title: "GSV",
    unit: "元",
    format: "money",
    direction: "higher_is_better",
    supportedScopes: ALL_SCOPES,
    ...requiredTarget,
  },
  {
    metricKey: "adSpendRateAfterRefund",
    title: "去退费比",
    unit: "%",
    format: "percent",
    direction: "lower_is_better",
    supportedScopes: ALL_SCOPES,
    targetRule: "derived",
    deriveFormula: "去退费比目标 = (GSV目标 / 投入产出比目标) / (GSV目标 × (1 - 退货率（总）目标))",
    deriveDependencies: ["gsv", "adRoi", "refundRate"],
    showInTargetInput: false,
  },
  {
    metricKey: "brandVisitors",
    title: "品牌词访客",
    unit: "人",
    format: "integer",
    direction: "higher_is_better",
    supportedScopes: ALL_SCOPES,
    ...unsupportedTarget("品牌词访客保留为分析解释指标和诊断上下文展示，不进入目标输入。"),
  },
  {
    metricKey: "brandPaidBuyers",
    title: "品牌词支付人数",
    unit: "人",
    format: "integer",
    direction: "higher_is_better",
    supportedScopes: ALL_SCOPES,
    ...unsupportedTarget("品牌词支付人数保留为分析解释指标和诊断上下文展示，不进入目标输入。"),
  },
  {
    metricKey: "geoSearchShare",
    title: "GEO搜索占比",
    unit: "%",
    format: "percent",
    direction: "higher_is_better",
    supportedScopes: ALL_SCOPES,
    targetRule: "derived",
    deriveFormula: "GEO搜索占比目标 = 品牌词支付人数目标 / (GMV目标 / 客单价目标)",
    deriveDependencies: ["brandPaidBuyers", "gmv", "averageOrderValue"],
    showInTargetInput: false,
  },
  {
    metricKey: "adRoi",
    title: "投入产出比",
    unit: "倍",
    format: "ratio",
    direction: "higher_is_better",
    supportedScopes: ALL_SCOPES,
    ...requiredTarget,
  },
  {
    metricKey: "refundRate",
    title: "退货率（总）",
    unit: "%",
    format: "percent",
    direction: "lower_is_better",
    supportedScopes: ALL_SCOPES,
    ...requiredTarget,
  },
  {
    metricKey: "shippedRefundRate",
    title: "发货退货率",
    unit: "%",
    format: "percent",
    direction: "lower_is_better",
    supportedScopes: ALL_SCOPES,
    ...unsupportedTarget("当前只保留真实发货退货率展示，目标拆分口径暂未确认。"),
  },
  {
    metricKey: "signedRefundRate",
    title: "已签收退货率",
    unit: "%",
    format: "percent",
    direction: "lower_is_better",
    supportedScopes: ALL_SCOPES,
    ...unsupportedTarget("当前只保留真实已签收退货率展示，目标拆分口径暂未确认。"),
  },
  {
    metricKey: "mtdTurnover",
    title: "MTD周转",
    unit: "天",
    format: "days",
    direction: "lower_is_better",
    supportedScopes: PLATFORM_ONLY,
    ...unsupportedTarget("当前没有可靠周转目标数据源或确认公式。"),
  },
  {
    metricKey: "regionalFulfillmentRate",
    title: "同区履约率",
    unit: "%",
    format: "percent",
    direction: "higher_is_better",
    supportedScopes: PLATFORM_ONLY,
    ...unsupportedTarget("当前没有可靠同区履约目标数据源或确认公式。"),
  },
  {
    metricKey: "cpc",
    title: "推广点击单价",
    unit: "元",
    format: "money",
    direction: "lower_is_better",
    supportedScopes: ALL_SCOPES,
    ...unsupportedTarget("理论公式为推广花费目标 / 点击目标；当前没有点击目标。"),
  },
  {
    metricKey: "averageOrderValue",
    title: "客单价",
    unit: "元",
    format: "money",
    direction: "higher_is_better",
    supportedScopes: ALL_SCOPES,
    ...requiredTarget,
  },
  {
    metricKey: "conversionRate",
    title: "转化率",
    unit: "%",
    format: "percent",
    direction: "higher_is_better",
    supportedScopes: ALL_SCOPES,
    ...requiredTarget,
  },
  {
    metricKey: "adSpend",
    title: "推广花费",
    unit: "元",
    format: "money",
    direction: "budget",
    supportedScopes: ALL_SCOPES,
    targetRule: "derived",
    deriveFormula: "推广花费目标 = GSV目标 / 投入产出比目标",
    deriveDependencies: ["gsv", "adRoi"],
    showInTargetInput: false,
  },
  {
    metricKey: "directTransactionShare",
    title: "直接成交占比",
    unit: "%",
    format: "percent",
    direction: "higher_is_better",
    supportedScopes: ALL_SCOPES,
    ...requiredTarget,
  },
];

export const getTargetMetricDefinitionsForScope = (scope: TargetMetricScope): TargetMetricDefinition[] =>
  TARGET_METRIC_DEFINITIONS.filter((definition) => definition.supportedScopes.includes(scope));

export const getTargetMetricDefinitionByKey = (metricKey: string): TargetMetricDefinition | null =>
  TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === metricKey) ?? null;

export const getRequiredTargetMetricDefinitionsForScope = (scope: TargetMetricScope): TargetMetricDefinition[] =>
  getTargetMetricDefinitionsForScope(scope).filter((definition) => definition.targetRule === "required");

export const getDerivedTargetMetricDefinitionsForScope = (scope: TargetMetricScope): TargetMetricDefinition[] =>
  getTargetMetricDefinitionsForScope(scope).filter((definition) => definition.targetRule === "derived");

export const getUnsupportedTargetMetricDefinitionsForScope = (scope: TargetMetricScope): TargetMetricDefinition[] =>
  getTargetMetricDefinitionsForScope(scope).filter((definition) => definition.targetRule === "unsupported");

export const getAllUnsupportedTargetMetricDefinitions = (): TargetMetricDefinition[] =>
  TARGET_METRIC_DEFINITIONS.filter((definition) => definition.targetRule === "unsupported");

export const targetDirectionToBoardDirection = (direction: TargetMetricDirection): BoardTargetDirection => {
  if (direction === "lower_is_better") return "lower";
  if (direction === "budget") return "budget";
  return "higher";
};

export const createBoardTargetKpiDefinitions = (
  scope: TargetMetricScope,
  metricKeyOverrides: Record<string, string> = {},
  titleOverrides: Record<string, string> = {},
): BoardTargetKpiDefinition[] =>
  getTargetMetricDefinitionsForScope(scope).map((definition) => ({
    key: metricKeyOverrides[definition.metricKey] ?? definition.metricKey,
    title: titleOverrides[definition.metricKey] ?? definition.title,
    unit: definition.unit,
    direction: targetDirectionToBoardDirection(definition.direction),
    metricKey: definition.metricKey,
    format: definition.format,
    targetRule: definition.targetRule,
    deriveFormula: definition.deriveFormula,
    deriveDependencies: definition.deriveDependencies,
    showInTargetInput: definition.showInTargetInput,
    unsupportedReason: definition.unsupportedReason,
  }));

export interface DerivedTargetResult {
  value: number | null;
  formula: string | null;
  missingDependencies: string[];
}

export type TargetMetricValues = Record<string, number | null | undefined>;

export const formatTargetMetricValue = (
  value: number | null,
  format: TargetMetricFormat,
): string => {
  if (value === null || !Number.isFinite(value)) return "--";
  const digits = format === "integer" ? 0 : 2;
  const normalized = format === "percent" ? value * 100 : value;
  const formatted = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(normalized) ? 0 : Math.min(digits, 2),
  }).format(normalized);
  if (format === "percent") return `${formatted}%`;
  if (format === "days") return `${formatted}天`;
  return formatted;
};

export const targetMetricValuesFromDrafts = <T extends { metricKey: string; title: string }>(
  definitions: T[],
  targetDrafts: Record<string, number>,
): Record<string, number> => {
  const values: Record<string, number> = {};
  definitions.forEach((definition) => {
    const value = targetDrafts[definition.title] ?? targetDrafts[definition.metricKey];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      values[definition.metricKey] = value;
    }
  });
  return values;
};

const dependencyLabel = (metricKey: string): string =>
  getTargetMetricDefinitionByKey(metricKey)?.title ?? metricKey;

const finitePositive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export const deriveTargetMetricValue = (
  metricKey: string,
  values: TargetMetricValues,
): DerivedTargetResult => {
  const definition = getTargetMetricDefinitionByKey(metricKey);
  const missing = (keys: string[]): string[] =>
    keys.filter((key) => finitePositive(values[key]) === null).map(dependencyLabel);

  if (metricKey === "adSpend") {
    const gsv = finitePositive(values.gsv);
    const adRoi = finitePositive(values.adRoi);
    return {
      value: gsv !== null && adRoi !== null ? gsv / adRoi : null,
      formula: definition?.deriveFormula ?? null,
      missingDependencies: missing(["gsv", "adRoi"]),
    };
  }

  if (metricKey === "geoSearchShare") {
    const brandPaidBuyers = finitePositive(values.brandPaidBuyers);
    const gmv = finitePositive(values.gmv);
    const averageOrderValue = finitePositive(values.averageOrderValue);
    const paidBuyersTarget = gmv !== null && averageOrderValue !== null ? gmv / averageOrderValue : null;
    return {
      value:
        brandPaidBuyers !== null && paidBuyersTarget !== null && paidBuyersTarget > 0
          ? brandPaidBuyers / paidBuyersTarget
          : null,
      formula: definition?.deriveFormula ?? null,
      missingDependencies: missing(["brandPaidBuyers", "gmv", "averageOrderValue"]),
    };
  }

  if (metricKey === "adSpendRateAfterRefund") {
    const gsv = finitePositive(values.gsv);
    const adRoi = finitePositive(values.adRoi);
    const refundRateRaw = values.refundRate;
    const refundRate =
      typeof refundRateRaw === "number" && Number.isFinite(refundRateRaw) && refundRateRaw > 0 && refundRateRaw < 1
        ? refundRateRaw
        : null;
    const adSpendTarget = gsv !== null && adRoi !== null ? gsv / adRoi : null;
    const denominator = gsv !== null && refundRate !== null ? gsv * (1 - refundRate) : null;
    const missingDependencies = missing(["gsv", "adRoi"]);
    if (refundRate === null) missingDependencies.push(dependencyLabel("refundRate"));
    return {
      value:
        adSpendTarget !== null && denominator !== null && denominator > 0
          ? adSpendTarget / denominator
          : null,
      formula: definition?.deriveFormula ?? null,
      missingDependencies: Array.from(new Set(missingDependencies)),
    };
  }

  if (metricKey === "directTransactionShare") {
    return {
      value: null,
      formula: definition?.deriveFormula ?? null,
      missingDependencies: [],
    };
  }

  return {
    value: null,
    formula: definition?.deriveFormula ?? null,
    missingDependencies: definition?.deriveDependencies.map(dependencyLabel) ?? [],
  };
};
