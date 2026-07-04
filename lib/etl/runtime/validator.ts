import type { BIDataSet, ETLIssue, ETLRuntimeContext } from "./context";

export const pushIssue = (
  context: ETLRuntimeContext,
  issue: Omit<ETLIssue, "level"> & { level?: ETLIssue["level"] },
) => {
  const nextIssue: ETLIssue = {
    level: issue.level ?? "warning",
    code: issue.code,
    message: issue.message,
    fileName: issue.fileName,
    sheetName: issue.sheetName ?? null,
    rowIndex: issue.rowIndex ?? null,
  };
  context.issues.push(nextIssue);
  if (nextIssue.level === "error") context.errorQueue.push(nextIssue);
};

const hasInvalidNumber = (value: unknown): boolean =>
  typeof value === "number" && !Number.isFinite(value);

export const validateBIDataSet = (dataset: BIDataSet): ETLIssue[] => {
  const issues: ETLIssue[] = [];
  const inspect = (records: Array<Record<string, unknown>>, group: string) => {
    records.forEach((record, index) => {
      Object.entries(record).forEach(([field, value]) => {
        if (hasInvalidNumber(value)) {
          issues.push({
            level: "warning",
            code: "invalid_number_filtered",
            message: `${group}.${field} contains invalid number and was filtered.`,
            fileName: "runtime",
            sheetName: null,
            rowIndex: index,
          });
        }
      });
    });
  };

  inspect(dataset.products as unknown as Array<Record<string, unknown>>, "products");
  inspect(dataset.productMetrics as unknown as Array<Record<string, unknown>>, "productMetrics");
  inspect(dataset.planMetrics as unknown as Array<Record<string, unknown>>, "planMetrics");
  inspect(dataset.searchTotalKeywords as unknown as Array<Record<string, unknown>>, "searchTotalKeywords");
  inspect(dataset.searchProductKeywords as unknown as Array<Record<string, unknown>>, "searchProductKeywords");
  inspect(dataset.afterSalesMetrics as unknown as Array<Record<string, unknown>>, "afterSalesMetrics");
  return issues;
};
