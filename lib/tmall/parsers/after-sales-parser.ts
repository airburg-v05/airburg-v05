import { parseDateTime, parseNumber, type RawRecord } from "../normalizers";
import { PENDING_REFUND_STATUSES, SUCCESS_REFUND_STATUS } from "../source-types";
import { parseTmallTableFile } from "./table-parser";
import { buildSourceHealth, readDate, readId, type ParserResult } from "./parser-utils";

export type AfterSalesStatusType = "success" | "pending" | "unknown";

export interface AfterSalesRecord {
  productId: string | null;
  applyDate: string | null;
  successDate: string | null;
  paymentDate: string | null;
  timeoutAt: Date | null;
  applyAt: Date | null;
  successAt: Date | null;
  status: string;
  statusType: AfterSalesStatusType;
  reason: string | null;
  afterSalesType: string | null;
  partialFullType: string | null;
  refundTotalAmount: number;
  refundToBuyerAmount: number;
  refundToPlatformAmount: number;
  customerServiceIntervention: boolean;
}

const getStatusType = (status: string): AfterSalesStatusType => {
  if (status === SUCCESS_REFUND_STATUS) return "success";
  if (PENDING_REFUND_STATUSES.has(status)) return "pending";
  return "unknown";
};

const toRecord = (row: RawRecord): AfterSalesRecord => {
  const status = row["退款状态"] ? `${row["退款状态"]}`.trim() : "";
  const applyAt = parseDateTime(row["退款申请时间"]);
  const successAt = parseDateTime(row["退款完结时间"]);

  return {
    productId: readId(row["商品id"]),
    applyDate: readDate(row["退款申请时间"]),
    successDate: readDate(row["退款完结时间"]),
    paymentDate: readDate(row["订单付款时间"]),
    timeoutAt: parseDateTime(row["超时时间"]),
    applyAt,
    successAt,
    status,
    statusType: getStatusType(status),
    reason: row["买家退款原因"] ? `${row["买家退款原因"]}`.trim() : null,
    afterSalesType: row["售后类型"] ? `${row["售后类型"]}`.trim() : null,
    partialFullType: row["部分退款/全额退款"] ? `${row["部分退款/全额退款"]}`.trim() : null,
    refundTotalAmount: parseNumber(row["退款总额"]),
    refundToBuyerAmount: parseNumber(row["退给买家金额"]),
    refundToPlatformAmount: parseNumber(row["退给平台金额"]),
    customerServiceIntervention: !!row["客服介入状态"] && `${row["客服介入状态"]}`.trim() !== "无客服介入",
  };
};

export const parseAfterSalesSource = async (
  file: File,
): Promise<ParserResult<AfterSalesRecord>> => {
  const table = await parseTmallTableFile(file);
  const records = table.rows.map(toRecord).filter((record) => record.applyDate && record.productId);
  const unknownStatuses = [...new Set(records.filter((record) => record.statusType === "unknown").map((record) => record.status))]
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second, "zh-CN"));
  const health = buildSourceHealth(
    "after_sales",
    file,
    table,
    records,
    (record) => record.applyDate,
    (record) => record.productId,
    {
      unknownStatuses,
      warningTypes: unknownStatuses.length > 0 ? ["unknown_after_sales_status"] : [],
    },
  );

  return {
    health,
    records: health.status === "parsed" ? records : [],
  };
};

