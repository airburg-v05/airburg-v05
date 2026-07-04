const pad2 = (value: string | number): string => String(value).padStart(2, "0");

const validDateParts = (year: number, month: number, day: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const formatDateParts = (yearText: string, monthText: string, dayText: string): string | null => {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!validDateParts(year, month, day)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

export const formatDateObjectAsBusinessDate = (date: Date): string | null => {
  if (Number.isNaN(date.getTime())) return null;
  return formatDateParts(String(date.getFullYear()), String(date.getMonth() + 1), String(date.getDate()));
};

export const parseExcelSerialDate = (value: number): string | null => {
  if (!Number.isFinite(value) || value <= 0) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + value * 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateParts(String(date.getUTCFullYear()), String(date.getUTCMonth() + 1), String(date.getUTCDate()));
};

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

export const parseBusinessDate = (value: unknown): string | null => {
  if (value instanceof Date) return formatDateObjectAsBusinessDate(value);
  if (typeof value === "number") return parseExcelSerialDate(value);
  const text = asText(value);
  if (!text) return null;

  const yearFirst = text.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (yearFirst) {
    return formatDateParts(yearFirst[1], yearFirst[2], yearFirst[3]);
  }

  const compact = text.match(/(20\d{2})(\d{2})(\d{2})/);
  if (compact) {
    return formatDateParts(compact[1], compact[2], compact[3]);
  }

  const monthDayYear = text.match(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?!\d)/);
  if (monthDayYear) {
    const year = monthDayYear[3].length === 2 ? `20${monthDayYear[3]}` : monthDayYear[3];
    return formatDateParts(year, monthDayYear[1], monthDayYear[2]);
  }

  return null;
};
