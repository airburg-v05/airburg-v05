import { TMALL_SOURCE_LABELS, TMALL_SOURCE_TYPES } from "../source-types";
import {
  buildTmallHomeOverview,
  getTmallBusinessDates,
} from "./home-overview";
import type {
  TmallAnalysisDisplayResult,
  TmallSourceStatus,
  TmallSourceType,
} from "../../../types/tmall";

export type UploadDataQualityCenterStatus = "normal" | "watch" | "risk" | "empty";

export type UploadDataQualityAnalysisStatus = "loading" | "empty" | "corrupted" | "valid";

export interface UploadSourceStatusCardViewModel {
  key: TmallSourceType;
  label: string;
  statusLabel: string;
  status: TmallSourceStatus;
  rowCount: number;
  hasSelectedDateData: boolean;
  tone: UploadDataQualityCenterStatus;
  suggestion: string;
}

export interface UploadDataQualityAction {
  key: string;
  title: string;
  description: string;
  tone: "blue" | "amber" | "rose" | "emerald" | "slate";
}

export interface UploadDataQualityCenterViewModel {
  status: UploadDataQualityCenterStatus;
  statusLabel: string;
  title: string;
  description: string;
  analysisTimestamp: string | null;
  selectedDate: string | null;
  availableDateCount: number;
  recentDates: string[];
  parsedSourceCount: number;
  sourceCount: number;
  dataQualityWarningCount: number;
  sourceCards: UploadSourceStatusCardViewModel[];
  actions: UploadDataQualityAction[];
  safeWarnings: string[];
  notices: string[];
  isEmpty: boolean;
}

interface BuildTmallUploadDataQualityCenterInput {
  analysisStatus: UploadDataQualityAnalysisStatus;
  analysis: TmallAnalysisDisplayResult | null;
  selectedDate: string | null;
}

const SOURCE_STATUS_LABELS: Record<TmallSourceStatus, string> = {
  parsed: "已解析",
  missing: "缺失",
  unknown: "未识别",
  error: "解析失败",
};

const SOURCE_UPLOAD_ACTIONS: Record<TmallSourceType, UploadDataQualityAction> = {
  business_product: {
    key: "upload-business-product",
    title: "请上传生意参谋商品报表",
    description: "这是经营日期、商品销售和访客指标的基础来源。",
    tone: "amber",
  },
  ad_product: {
    key: "upload-ad-product",
    title: "请上传商品推广报表",
    description: "用于判断单商品推广花费、成交和 ROI 等指标。",
    tone: "amber",
  },
  ad_plan: {
    key: "upload-ad-plan",
    title: "请上传计划推广报表",
    description: "用于店铺级推广趋势和推广对账。",
    tone: "amber",
  },
  after_sales: {
    key: "upload-after-sales",
    title: "请上传售后退货表",
    description: "仅保留安全聚合指标，用于识别退款和售后压力。",
    tone: "amber",
  },
};

const SENSITIVE_WARNING_KEYWORDS = [
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

const emptySourceCards = (
  status: TmallSourceStatus,
  tone: UploadDataQualityCenterStatus,
  suggestion: string,
): UploadSourceStatusCardViewModel[] =>
  TMALL_SOURCE_TYPES.map((sourceType) => ({
    key: sourceType,
    label: TMALL_SOURCE_LABELS[sourceType],
    statusLabel: SOURCE_STATUS_LABELS[status],
    status,
    rowCount: 0,
    hasSelectedDateData: false,
    tone,
    suggestion,
  }));

const sourceTone = (
  status: TmallSourceStatus,
  hasSelectedDateData: boolean,
): UploadDataQualityCenterStatus => {
  if (status === "parsed" && hasSelectedDateData) return "normal";
  if (status === "parsed") return "watch";
  if (status === "missing") return "empty";
  return "risk";
};

const sourceSuggestion = ({
  sourceType,
  status,
  hasSelectedDateData,
}: {
  sourceType: TmallSourceType;
  status: TmallSourceStatus;
  hasSelectedDateData: boolean;
}): string => {
  if (status === "parsed" && hasSelectedDateData) {
    return "当前经营日期有可用数据。";
  }

  if (status === "parsed") {
    return "已解析，但当前经营日期没有对应数据，请复核导出日期。";
  }

  if (status === "missing") {
    return SOURCE_UPLOAD_ACTIONS[sourceType].title;
  }

  if (status === "unknown") {
    return "未识别为对应来源，请检查表头或重新导出。";
  }

  return "解析失败，请替换为后台重新导出的文件。";
};

const addAction = (
  actions: UploadDataQualityAction[],
  action: UploadDataQualityAction,
): void => {
  if (actions.some((item) => item.key === action.key)) return;
  actions.push(action);
};

const sanitizeWarning = (warning: string): string => {
  const trimmed = warning.trim();
  if (!trimmed) return "";

  if (SENSITIVE_WARNING_KEYWORDS.some((keyword) => trimmed.includes(keyword))) {
    return "检测到一条数据质量提示，涉及敏感明细，已隐藏具体内容。";
  }

  return trimmed;
};

const safeWarnings = (warnings: string[]): string[] =>
  warnings
    .map(sanitizeWarning)
    .filter(Boolean)
    .slice(0, 5);

const resolveEffectiveDate = (
  analysis: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): { availableDates: string[]; effectiveDate: string | null } => {
  const availableDates = getTmallBusinessDates(analysis);
  const effectiveDate =
    selectedDate && availableDates.includes(selectedDate)
      ? selectedDate
      : availableDates[0] ?? null;

  return { availableDates, effectiveDate };
};

export const buildTmallUploadDataQualityCenter = ({
  analysisStatus,
  analysis,
  selectedDate,
}: BuildTmallUploadDataQualityCenterInput): UploadDataQualityCenterViewModel => {
  const sourceCount = TMALL_SOURCE_TYPES.length;

  if (analysisStatus === "loading") {
    return {
      status: "empty",
      statusLabel: "正在读取",
      title: "正在读取本地分析结果",
      description: "系统正在读取当前浏览器保存的天猫四源聚合结果。",
      analysisTimestamp: null,
      selectedDate: null,
      availableDateCount: 0,
      recentDates: [],
      parsedSourceCount: 0,
      sourceCount,
      dataQualityWarningCount: 0,
      sourceCards: emptySourceCards("missing", "empty", "等待本地结果读取完成。"),
      actions: [],
      safeWarnings: [],
      notices: ["文件仍只在当前浏览器本地解析，不上传服务器。"],
      isEmpty: true,
    };
  }

  if (analysisStatus === "empty") {
    return {
      status: "empty",
      statusLabel: "暂无结果",
      title: "暂无分析结果",
      description: "请先选择并识别天猫四源报表，然后点击开始四源分析。",
      analysisTimestamp: null,
      selectedDate: null,
      availableDateCount: 0,
      recentDates: [],
      parsedSourceCount: 0,
      sourceCount,
      dataQualityWarningCount: 0,
      sourceCards: emptySourceCards("missing", "empty", "请上传对应来源报表。"),
      actions: [
        {
          key: "upload-sources",
          title: "请先上传四源数据",
          description: "至少上传一个识别成功的来源后即可开始本地分析。",
          tone: "blue",
        },
      ],
      safeWarnings: [],
      notices: ["当前没有可用聚合结果，页面不会展示旧数据。"],
      isEmpty: true,
    };
  }

  if (analysisStatus === "corrupted" || !analysis) {
    return {
      status: "risk",
      statusLabel: "结果损坏",
      title: "本地分析结果不可用",
      description: "当前浏览器保存的分析结果已损坏或结构不可识别，请重新上传四源数据并重新分析。",
      analysisTimestamp: null,
      selectedDate: null,
      availableDateCount: 0,
      recentDates: [],
      parsedSourceCount: 0,
      sourceCount,
      dataQualityWarningCount: 0,
      sourceCards: emptySourceCards("unknown", "risk", "请重新上传并重新分析。"),
      actions: [
        {
          key: "reanalyze-corrupted-result",
          title: "请重新上传四源数据并重新分析",
          description: "损坏结果不会自动删除，确认后重新分析即可覆盖为新的安全聚合结果。",
          tone: "rose",
        },
      ],
      safeWarnings: [],
      notices: ["不会展示损坏结果中的任何明细内容。"],
      isEmpty: false,
    };
  }

  const { availableDates, effectiveDate } = resolveEffectiveDate(analysis, selectedDate);
  const homeOverview = buildTmallHomeOverview(analysis, effectiveDate);
  const sourceCards = TMALL_SOURCE_TYPES.map((sourceType) => {
    const availability = homeOverview.sourceAvailability[sourceType];
    const status = availability.status;
    const hasSelectedDateData = availability.hasSelectedDateData;

    return {
      key: sourceType,
      label: TMALL_SOURCE_LABELS[sourceType],
      statusLabel: SOURCE_STATUS_LABELS[status],
      status,
      rowCount: availability.rowCount,
      hasSelectedDateData,
      tone: sourceTone(status, hasSelectedDateData),
      suggestion: sourceSuggestion({ sourceType, status, hasSelectedDateData }),
    };
  });
  const parsedSourceCount = sourceCards.filter((source) => source.status === "parsed").length;
  const dataQualityWarningCount = analysis.dataQualityWarnings.length;
  const actions: UploadDataQualityAction[] = [];

  sourceCards.forEach((source) => {
    if (source.status === "missing") {
      addAction(actions, SOURCE_UPLOAD_ACTIONS[source.key]);
      return;
    }

    if (source.status === "unknown" || source.status === "error") {
      addAction(actions, {
        key: `fix-${source.key}`,
        title: `请重新上传${source.label}报表`,
        description: "当前来源未能形成可用解析结果，请检查导出文件后替换。",
        tone: "rose",
      });
    }
  });

  if (dataQualityWarningCount > 0) {
    addAction(actions, {
      key: "review-data-quality",
      title: "请复核上传文件日期和字段",
      description: "当前结果存在数据质量提示，建议先确认导出日期、表头和关键字段。",
      tone: "amber",
    });
  }

  if (actions.length === 0) {
    addAction(actions, {
      key: "all-sources-ready",
      title: "当前四源数据可用",
      description: "可前往首页或各看板查看当前经营数据。",
      tone: "emerald",
    });
  }

  const hasSourceGap = parsedSourceCount < sourceCount;
  const status: UploadDataQualityCenterStatus = hasSourceGap
    ? "risk"
    : dataQualityWarningCount > 0
      ? "watch"
      : "normal";

  return {
    status,
    statusLabel: hasSourceGap
      ? "四源不完整"
      : dataQualityWarningCount > 0
        ? "存在质量提示"
        : "结果可用",
    title: hasSourceGap
      ? "四源不完整"
      : dataQualityWarningCount > 0
        ? "存在数据质量提示"
        : "分析结果可用",
    description: hasSourceGap
      ? "请根据下方补齐清单补充缺失或不可用的来源。"
      : dataQualityWarningCount > 0
        ? "当前分析结果可用，但建议先复核数据质量提示。"
        : "当前四源数据已形成安全聚合结果，可继续查看首页和看板。",
    analysisTimestamp: analysis.analysisTimestamp,
    selectedDate: effectiveDate,
    availableDateCount: availableDates.length,
    recentDates: availableDates.slice(0, 5),
    parsedSourceCount,
    sourceCount,
    dataQualityWarningCount,
    sourceCards,
    actions: actions.slice(0, 6),
    safeWarnings: safeWarnings(analysis.dataQualityWarnings),
    notices: [
      "本中心只展示安全聚合状态和补齐建议，不展示售后原始明细。",
      "当前经营日期以可用经营日期为准；传入日期无效时会回退到最新日期。",
    ],
    isEmpty: false,
  };
};
