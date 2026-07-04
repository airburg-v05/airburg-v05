import type {
  BaseEntity,
  BIDataPoint,
  BIEntityLevel,
  BIMetricKey,
  BIMetricMap,
  BIMetricValue,
  BITimeRange,
  ChartModel,
  ChartSeries,
  KPICard,
  KPICardTone,
  PlatformAgg,
  SeriesAgg,
  UIState,
} from "./bi.types";

interface AggregateAccumulator {
  gmv: number;
  gsv: number;
  visitors: number;
  paidBuyers: number;
  adSpend: number;
  adRevenue: number;
  refundAmount: number;
  refundCount: number;
  hasRefundAmount: boolean;
  hasRefundCount: boolean;
  shippedRefundAmount: number;
  shippedRefundCount: number;
  hasShippedRefundAmount: boolean;
  hasShippedRefundCount: boolean;
  signedRefundAmount: number;
  signedRefundCount: number;
  hasSignedRefundAmount: boolean;
  hasSignedRefundCount: boolean;
  custom: Record<string, number>;
}

export interface KPICardConfig {
  metricKey: BIMetricKey;
  title: string;
  description?: string | null;
  formatter?: (value: BIMetricValue) => string;
  tone?: KPICardTone;
}

export interface BuildChartModelOptions {
  metricKey: BIMetricKey;
  title?: string;
  groupBy?: Exclude<BIEntityLevel, "date" | "product">;
  state?: UIState;
}

const DEFAULT_KPI_CONFIGS: KPICardConfig[] = [
  { metricKey: "gmv", title: "GMV" },
  { metricKey: "gsv", title: "GSV" },
  { metricKey: "visitors", title: "商品访客" },
  { metricKey: "paidBuyers", title: "支付买家" },
  { metricKey: "conversionRate", title: "支付转化率", formatter: (value) => formatPercent(value) },
  { metricKey: "adSpend", title: "推广花费" },
  { metricKey: "adRoi", title: "推广 ROI", formatter: (value) => formatRatio(value) },
];

const createAccumulator = (): AggregateAccumulator => ({
  gmv: 0,
  gsv: 0,
  visitors: 0,
  paidBuyers: 0,
  adSpend: 0,
  adRevenue: 0,
  refundAmount: 0,
  refundCount: 0,
  hasRefundAmount: false,
  hasRefundCount: false,
  shippedRefundAmount: 0,
  shippedRefundCount: 0,
  hasShippedRefundAmount: false,
  hasShippedRefundCount: false,
  signedRefundAmount: 0,
  signedRefundCount: 0,
  hasSignedRefundAmount: false,
  hasSignedRefundCount: false,
  custom: {},
});

const finiteOrNull = (value: unknown): BIMetricValue =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const addMetric = (accumulator: AggregateAccumulator, metricKey: BIMetricKey, value: unknown) => {
  const safeValue = finiteOrNull(value);
  if (safeValue === null) return;

  if (metricKey === "gmv") accumulator.gmv += safeValue;
  else if (metricKey === "gsv") accumulator.gsv += safeValue;
  else if (metricKey === "visitors") accumulator.visitors += safeValue;
  else if (metricKey === "paidBuyers") accumulator.paidBuyers += safeValue;
  else if (metricKey === "adSpend") accumulator.adSpend += safeValue;
  else if (metricKey === "adRevenue") accumulator.adRevenue += safeValue;
  else if (metricKey === "refundAmount") {
    accumulator.refundAmount += safeValue;
    accumulator.hasRefundAmount = true;
  } else if (metricKey === "refundCount") {
    accumulator.refundCount += safeValue;
    accumulator.hasRefundCount = true;
  } else if (metricKey === "shippedRefundAmount") {
    accumulator.shippedRefundAmount += safeValue;
    accumulator.hasShippedRefundAmount = true;
  } else if (metricKey === "shippedRefundCount") {
    accumulator.shippedRefundCount += safeValue;
    accumulator.hasShippedRefundCount = true;
  } else if (metricKey === "signedRefundAmount") {
    accumulator.signedRefundAmount += safeValue;
    accumulator.hasSignedRefundAmount = true;
  } else if (metricKey === "signedRefundCount") {
    accumulator.signedRefundCount += safeValue;
    accumulator.hasSignedRefundCount = true;
  }
  else if (!["conversionRate", "averageOrderValue", "adRoi"].includes(metricKey)) {
    accumulator.custom[metricKey] = (accumulator.custom[metricKey] ?? 0) + safeValue;
  }
};

const safeDivide = (numerator: number, denominator: number): BIMetricValue =>
  denominator > 0 ? finiteOrNull(numerator / denominator) : null;

const accumulatorToMetrics = (accumulator: AggregateAccumulator): BIMetricMap => ({
  gmv: accumulator.gmv,
  gsv: accumulator.gsv,
  visitors: accumulator.visitors,
  paidBuyers: accumulator.paidBuyers,
  conversionRate: safeDivide(accumulator.paidBuyers, accumulator.visitors),
  averageOrderValue: safeDivide(accumulator.gmv, accumulator.paidBuyers),
  adSpend: accumulator.adSpend,
  adRevenue: accumulator.adRevenue,
  adRoi: safeDivide(accumulator.adRevenue, accumulator.adSpend),
  refundAmount: accumulator.hasRefundAmount ? accumulator.refundAmount : null,
  refundCount: accumulator.hasRefundCount ? accumulator.refundCount : null,
  refundRate: accumulator.hasRefundAmount ? safeDivide(accumulator.refundAmount, accumulator.gsv) : null,
  shippedRefundAmount: accumulator.hasShippedRefundAmount ? accumulator.shippedRefundAmount : null,
  shippedRefundCount: accumulator.hasShippedRefundCount ? accumulator.shippedRefundCount : null,
  shippedRefundRate: accumulator.hasShippedRefundAmount ? safeDivide(accumulator.shippedRefundAmount, accumulator.gsv) : null,
  signedRefundAmount: accumulator.hasSignedRefundAmount ? accumulator.signedRefundAmount : null,
  signedRefundCount: accumulator.hasSignedRefundCount ? accumulator.signedRefundCount : null,
  signedRefundRate: accumulator.hasSignedRefundAmount ? safeDivide(accumulator.signedRefundAmount, accumulator.gsv) : null,
  ...accumulator.custom,
});

const aggregateMetrics = (points: BIDataPoint[]): BIMetricMap => {
  const accumulator = createAccumulator();
  points.forEach((point) => {
    Object.entries(point.metrics).forEach(([metricKey, value]) => {
      addMetric(accumulator, metricKey as BIMetricKey, value);
    });
  });
  return accumulatorToMetrics(accumulator);
};

const dateRangeFromPoints = (points: BIDataPoint[]): BITimeRange => {
  const dates = Array.from(new Set(points.map((point) => point.businessDate).filter(Boolean))).sort();
  return {
    mode: "custom",
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
  };
};

const inTimeRange = (businessDate: string, timeRange: BITimeRange): boolean => {
  if (!businessDate) return false;
  if (timeRange.startDate && businessDate < timeRange.startDate) return false;
  if (timeRange.endDate && businessDate > timeRange.endDate) return false;
  return true;
};

export const filterBIDataPoints = (points: BIDataPoint[], state?: UIState): BIDataPoint[] => {
  if (!state) return [...points];
  const selectedStores = new Set(state.selectedStores);
  const excludedProductIds = new Set(state.excludedProductIds);

  return points.filter((point) => {
    if (state.selectedPlatform && point.platformCode !== state.selectedPlatform) return false;
    if (selectedStores.size > 0 && (!point.storeId || !selectedStores.has(point.storeId))) return false;
    if (state.selectedSeries && point.seriesId !== state.selectedSeries) return false;
    if (point.productId && excludedProductIds.has(point.productId)) return false;
    return inTimeRange(point.businessDate, state.timeRange);
  });
};

const groupBy = <T>(items: T[], getKey: (item: T) => string): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const key = getKey(item);
    const nextItems = grouped.get(key) ?? [];
    nextItems.push(item);
    grouped.set(key, nextItems);
  });
  return grouped;
};

const stableName = (primary: string | null, fallback: string): string =>
  primary && primary.trim() ? primary : fallback;

export const buildPlatformAggs = (points: BIDataPoint[], state?: UIState): PlatformAgg[] => {
  const filteredPoints = filterBIDataPoints(points, state);
  return Array.from(groupBy(filteredPoints, (point) => point.platformCode).entries())
    .map(([platformCode, platformPoints]) => {
      const firstPoint = platformPoints[0];
      return {
        entity: {
          platformCode,
          platformName: firstPoint?.platformName ?? null,
        },
        dateRange: dateRangeFromPoints(platformPoints),
        storeCount: new Set(platformPoints.map((point) => point.storeId).filter(Boolean)).size,
        seriesCount: new Set(platformPoints.map((point) => point.seriesId).filter(Boolean)).size,
        productCount: new Set(platformPoints.map((point) => point.productId).filter(Boolean)).size,
        metrics: aggregateMetrics(platformPoints),
      };
    })
    .sort((left, right) => left.entity.platformCode.localeCompare(right.entity.platformCode));
};

export const buildSeriesAggs = (points: BIDataPoint[], state?: UIState): SeriesAgg[] => {
  const filteredPoints = filterBIDataPoints(points, state).filter((point) => point.seriesId);
  return Array.from(
    groupBy(
      filteredPoints,
      (point) => `${point.platformCode}::${point.storeId ?? ""}::${point.seriesId ?? ""}`,
    ).entries(),
  )
    .map(([, seriesPoints]) => {
      const firstPoint = seriesPoints[0];
      const productIds = Array.from(
        new Set(seriesPoints.map((point) => point.productId).filter((productId): productId is string => !!productId)),
      ).sort();

      return {
        entity: {
          platformCode: firstPoint?.platformCode ?? "",
          platformName: firstPoint?.platformName ?? null,
          storeId: firstPoint?.storeId ?? null,
          storeName: firstPoint?.storeName ?? null,
          seriesId: firstPoint?.seriesId ?? null,
          seriesName: firstPoint?.seriesName ?? null,
        },
        dateRange: dateRangeFromPoints(seriesPoints),
        productIds,
        productCount: productIds.length,
        metrics: aggregateMetrics(seriesPoints),
      };
    })
    .sort((left, right) => {
      const leftName = stableName(left.entity.seriesName, left.entity.seriesId ?? "");
      const rightName = stableName(right.entity.seriesName, right.entity.seriesId ?? "");
      return leftName.localeCompare(rightName);
    });
};

const formatNumber = (value: BIMetricValue): string => {
  if (value === null) return "--";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
};

const formatPercent = (value: BIMetricValue): string => {
  if (value === null) return "--";
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value * 100)}%`;
};

const formatRatio = (value: BIMetricValue): string => {
  if (value === null) return "--";
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)} 倍`;
};

export const buildKPICards = (
  points: BIDataPoint[],
  state?: UIState,
  configs: KPICardConfig[] = DEFAULT_KPI_CONFIGS,
): KPICard[] => {
  const filteredPoints = filterBIDataPoints(points, state);
  const metrics = aggregateMetrics(filteredPoints);
  const chartSeriesIds = buildSeriesAggs(filteredPoints).map((series) => series.entity.seriesId).filter((id): id is string => !!id);

  return configs.map((config) => {
    const rawValue = finiteOrNull(metrics[config.metricKey]);
    return {
      id: `kpi:${config.metricKey}`,
      metricKey: config.metricKey,
      title: config.title,
      value: config.formatter ? config.formatter(rawValue) : formatNumber(rawValue),
      rawValue,
      tone: config.tone ?? "neutral",
      linkedChartSeriesIds: chartSeriesIds,
      linkedSeriesIds: chartSeriesIds,
      description: config.description ?? null,
    };
  });
};

const getEntityKey = (point: BIDataPoint, group: Exclude<BIEntityLevel, "date" | "product">): string => {
  if (group === "platform") return point.platformCode;
  if (group === "store") return `${point.platformCode}::${point.storeId ?? ""}`;
  return `${point.platformCode}::${point.storeId ?? ""}::${point.seriesId ?? ""}`;
};

const getEntityName = (point: BIDataPoint, group: Exclude<BIEntityLevel, "date" | "product">): string => {
  if (group === "platform") return stableName(point.platformName, point.platformCode);
  if (group === "store") return stableName(point.storeName, point.storeId ?? point.platformCode);
  return stableName(point.seriesName, point.seriesId ?? point.storeId ?? point.platformCode);
};

const getEntityId = (point: BIDataPoint, group: Exclude<BIEntityLevel, "date" | "product">): string => {
  if (group === "platform") return point.platformCode;
  if (group === "store") return point.storeId ?? point.platformCode;
  return point.seriesId ?? point.storeId ?? point.platformCode;
};

const metricValueFromPoints = (points: BIDataPoint[], metricKey: BIMetricKey): BIMetricValue =>
  finiteOrNull(aggregateMetrics(points)[metricKey]);

export const buildChartModel = (points: BIDataPoint[], options: BuildChartModelOptions): ChartModel => {
  const group = options.groupBy ?? "series";
  const filteredPoints = filterBIDataPoints(points, options.state).filter((point) =>
    group === "series" ? !!point.seriesId : true,
  );
  const xAxis = Array.from(new Set(filteredPoints.map((point) => point.businessDate).filter(Boolean))).sort();
  const grouped = groupBy(filteredPoints, (point) => getEntityKey(point, group));

  const series: ChartSeries[] = Array.from(grouped.entries())
    .map(([id, groupPoints]) => {
      const firstPoint = groupPoints[0];
      const pointsByDate = groupBy(groupPoints, (point) => point.businessDate);
      return {
        id,
        name: firstPoint ? getEntityName(firstPoint, group) : id,
        entityLevel: group,
        entityId: firstPoint ? getEntityId(firstPoint, group) : id,
        points: xAxis.map((date) => ({
          date,
          value: metricValueFromPoints(pointsByDate.get(date) ?? [], options.metricKey),
        })),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    id: `chart:${options.metricKey}:${group}`,
    metricKey: options.metricKey,
    title: options.title ?? String(options.metricKey),
    xAxis,
    series,
    lines: series,
    empty: xAxis.length === 0 || series.length === 0,
  };
};

export const buildHomeBIModel = (points: BIDataPoint[], state: UIState) => {
  const filteredPoints = filterBIDataPoints(points, state);
  return {
    uiState: state,
    platformAggs: buildPlatformAggs(filteredPoints),
    seriesAggs: buildSeriesAggs(filteredPoints),
    kpis: buildKPICards(filteredPoints, state),
    chart: buildChartModel(filteredPoints, {
      metricKey: state.selectedMetric,
      groupBy: "series",
      state,
    }),
  };
};

export const createBIDataPoint = (entity: BaseEntity, metrics: BIMetricMap): BIDataPoint => ({
  ...entity,
  metrics,
});
