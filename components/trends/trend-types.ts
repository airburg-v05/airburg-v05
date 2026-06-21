import type { TmallTrendSeries } from "@/lib/tmall/view-models/trends";

export type TrendCardStatus = "empty" | "insufficient" | "ready";

export interface TrendCardViewModel {
  id: string;
  metricKey: string;
  title: string;
  description: string;
  series: TmallTrendSeries;
  latestDate: string | null;
  latestValue: number | null;
  previousDate: string | null;
  previousValue: number | null;
  changeRate: number | null;
  pointCount: number;
  sourceLabel: string;
  status: TrendCardStatus;
  statusText: string;
}
