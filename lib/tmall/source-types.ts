import type { TmallSourceType } from "../../types/tmall";

export const TMALL_SOURCE_TYPES: TmallSourceType[] = [
  "business_product",
  "ad_product",
  "ad_plan",
  "after_sales",
];

export const TMALL_SOURCE_LABELS: Record<TmallSourceType, string> = {
  business_product: "生意参谋商品表",
  ad_product: "商品推广报表",
  ad_plan: "计划推广报表",
  after_sales: "售后退货表",
};

export const TMALL_REQUIRED_HEADERS: Record<TmallSourceType, string[]> = {
  business_product: ["统计日期", "商品ID", "商品访客数", "支付金额", "支付买家数"],
  ad_product: ["日期", "计划ID", "主体ID", "花费", "总成交金额"],
  ad_plan: ["日期", "计划ID", "计划名字", "花费", "总成交金额"],
  after_sales: ["退款编号", "退款申请时间", "退款状态", "商品id", "退款总额"],
};

export const SUCCESS_REFUND_STATUS = "退款成功";

export const PENDING_REFUND_STATUSES = new Set([
  "买家已经申请退款，等待卖家同意",
  "卖家已经同意退款，等待买家退货",
  "买家已经退货，等待卖家确认收货",
]);

export const SENSITIVE_AFTER_SALES_HEADERS = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "电话",
  "手机号",
  "手机",
  "地址",
  "收件人",
  "真实姓名",
  "物流单号",
  "物流信息",
  "买家退款说明",
  "商家备注",
  "操作人",
  "子账号",
];

