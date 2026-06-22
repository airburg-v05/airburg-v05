import type {
  HomeCommandCenterDateRangeState,
  HomeCommandCenterPeriod,
} from "./contracts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isDateText = (value: string | null | undefined): value is string =>
  typeof value === "string" && DATE_PATTERN.test(value);

const toUtcDate = (date: string): Date => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day));
};

const toDateText = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: string, days: number): string => {
  const value = toUtcDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return toDateText(value);
};

const daysBetweenInclusive = (start: string | null, end: string | null): number => {
  if (!isDateText(start) || !isDateText(end) || start > end) return 0;
  const diff = toUtcDate(end).getTime() - toUtcDate(start).getTime();
  return Math.floor(diff / 86400000) + 1;
};

const mondayOf = (date: string): string => {
  const value = toUtcDate(date);
  const day = value.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + offset);
  return toDateText(value);
};

const monthStart = (date: string): string => `${date.slice(0, 7)}-01`;

const monthEnd = (date: string): string => {
  const [year, month] = date.split("-").map(Number);
  return toDateText(new Date(Date.UTC(year!, month!, 0)));
};

export const getLatestBusinessDate = (dates: readonly string[]): string | null =>
  [...new Set(dates.filter(isDateText))].sort((a, b) => b.localeCompare(a))[0] ?? null;

export const sortBusinessDatesDesc = (dates: readonly string[]): string[] =>
  [...new Set(dates.filter(isDateText))].sort((a, b) => b.localeCompare(a));

export const isDateInRange = (
  date: string,
  range: Pick<HomeCommandCenterDateRangeState, "start" | "end" | "valid">,
): boolean =>
  range.valid && isDateText(date) && !!range.start && !!range.end && date >= range.start && date <= range.end;

export const buildHomeCommandCenterDateRange = ({
  selectedPeriod,
  selectedDate,
  customDateRange,
  availableDates,
}: {
  selectedPeriod: HomeCommandCenterPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
  availableDates: readonly string[];
}): HomeCommandCenterDateRangeState => {
  const sortedDates = sortBusinessDatesDesc(availableDates);
  const effectiveDate =
    selectedDate && sortedDates.includes(selectedDate)
      ? selectedDate
      : sortedDates[0] ?? null;

  if (!effectiveDate) {
    return {
      selectedPeriod,
      selectedDate: null,
      start: null,
      end: null,
      naturalDayCount: 0,
      dataDayCount: 0,
      valid: false,
      error: null,
      coverageText: "当前没有可用经营日期。",
    };
  }

  let start: string | null = effectiveDate;
  let end: string | null = effectiveDate;
  let error: string | null = null;

  if (selectedPeriod === "week") {
    start = mondayOf(effectiveDate);
    end = addDays(start, 6);
  }

  if (selectedPeriod === "month") {
    start = monthStart(effectiveDate);
    end = monthEnd(effectiveDate);
  }

  if (selectedPeriod === "custom") {
    start = isDateText(customDateRange.start) ? customDateRange.start : null;
    end = isDateText(customDateRange.end) ? customDateRange.end : null;
    if (!start || !end) error = "请选择完整的起始日期和结束日期。";
    else if (start > end) error = "起始日期不能晚于结束日期。";
  }

  const valid = !error && !!start && !!end;
  const dataDayCount = valid
    ? sortedDates.filter((date) => date >= start! && date <= end!).length
    : 0;
  const naturalDayCount = valid ? daysBetweenInclusive(start, end) : 0;

  return {
    selectedPeriod,
    selectedDate: effectiveDate,
    start,
    end,
    naturalDayCount,
    dataDayCount,
    valid,
    error,
    coverageText: valid
      ? `当前范围包含 ${naturalDayCount} 个自然日，已有 ${dataDayCount} 天经营数据。`
      : error ?? "当前日期范围不可计算。",
  };
};
