import type { TmallSeriesGroupStorageParseResult } from "../../storage/tmall-series-storage";
import type { TmallTargetStorageParseResult } from "../../storage/tmall-target-storage";
import type {
  TmallAnalysisDisplayResult,
  TmallSourceStatus,
  TmallSourceType,
} from "../../../types/tmall";

export type TmallGlobalDataStatusTone = "normal" | "watch" | "risk" | "empty";

export interface TmallGlobalDataStatusAction {
  key: string;
  label: string;
  href: string;
}

export interface TmallGlobalDataStatusItem {
  key: string;
  label: string;
  value: string;
  tone: TmallGlobalDataStatusTone;
}

export interface TmallGlobalDataStatusGuideViewModel {
  tone: TmallGlobalDataStatusTone;
  title: string;
  description: string;
  items: TmallGlobalDataStatusItem[];
  actions: TmallGlobalDataStatusAction[];
  shouldDisplay: boolean;
  notices: string[];
}

export type TmallGlobalAnalysisStatus = "loading" | "empty" | "corrupted" | "valid";

interface BuildTmallGlobalDataStatusGuideInput {
  analysisStatus: TmallGlobalAnalysisStatus;
  analysis: TmallAnalysisDisplayResult | null;
  targetStorageState: TmallTargetStorageParseResult;
  seriesStorageState: TmallSeriesGroupStorageParseResult;
  selectedDate: string | null;
}

const SOURCE_TYPES: TmallSourceType[] = [
  "business_product",
  "ad_product",
  "ad_plan",
  "after_sales",
];

const SOURCE_LABELS: Record<TmallSourceType, string> = {
  business_product: "生意参谋商品",
  ad_product: "商品推广",
  ad_plan: "计划推广",
  after_sales: "售后",
};

const SOURCE_STATUS_LABELS: Record<TmallSourceStatus, string> = {
  parsed: "已解析",
  missing: "缺失",
  unknown: "未识别",
  error: "解析失败",
};

const addUniqueAction = (
  actions: TmallGlobalDataStatusAction[],
  action: TmallGlobalDataStatusAction,
): void => {
  if (actions.some((item) => item.href === action.href || item.key === action.key)) return;
  actions.push(action);
};

const itemToneFromSourceStatus = (status: TmallSourceStatus): TmallGlobalDataStatusTone => {
  if (status === "parsed") return "normal";
  if (status === "missing") return "empty";
  return "risk";
};

const normalGuide = ({
  parsedSourceCount,
  sourceCount,
  targetStatus,
  seriesStatus,
  selectedDate,
}: {
  parsedSourceCount: number;
  sourceCount: number;
  targetStatus: string;
  seriesStatus: string;
  selectedDate: string | null;
}): TmallGlobalDataStatusGuideViewModel => ({
  tone: "normal",
  title: "数据状态正常",
  description: "当前本地分析结果可用，可以继续查看经营工作台和各看板。",
  items: [
    {
      key: "sources",
      label: "四源解析",
      value: `${parsedSourceCount}/${sourceCount}`,
      tone: "normal",
    },
    {
      key: "target-storage",
      label: "目标数据",
      value: targetStatus,
      tone: "normal",
    },
    {
      key: "series-storage",
      label: "系列分组",
      value: seriesStatus,
      tone: "normal",
    },
    {
      key: "selected-date",
      label: "当前日期",
      value: selectedDate ?? "--",
      tone: selectedDate ? "normal" : "watch",
    },
  ],
  actions: [
    { key: "view-home", label: "查看首页", href: "/home" },
  ],
  shouldDisplay: true,
  notices: [
    "本提醒只展示本地数据健康状态和跳转入口，不新增经营判断规则。",
  ],
});

export const buildTmallGlobalDataStatusGuide = ({
  analysisStatus,
  analysis,
  targetStorageState,
  seriesStorageState,
  selectedDate,
}: BuildTmallGlobalDataStatusGuideInput): TmallGlobalDataStatusGuideViewModel => {
  if (analysisStatus === "loading") {
    return {
      tone: "empty",
      title: "正在读取本地数据",
      description: "正在读取本地四源分析结果。",
      items: [],
      actions: [],
      shouldDisplay: false,
      notices: [],
    };
  }

  if (analysisStatus === "empty") {
    return {
      tone: "empty",
      title: "当前还没有天猫四源分析结果",
      description: "请先上传经营、推广和售后表格，完成本地四源分析后再查看看板。",
      items: [
        { key: "analysis", label: "分析结果", value: "暂无数据", tone: "empty" },
        { key: "sources", label: "四源解析", value: "0/4", tone: "empty" },
      ],
      actions: [{ key: "upload", label: "去上传", href: "/upload" }],
      shouldDisplay: true,
      notices: ["文件仍只在当前浏览器本地解析，不上传服务器。"],
    };
  }

  if (analysisStatus === "corrupted" || !analysis) {
    return {
      tone: "risk",
      title: "本地分析结果不可用",
      description: "本地保存的分析结果已损坏或结构不可识别，请重新上传并分析。",
      items: [
        { key: "analysis", label: "分析结果", value: "不可用", tone: "risk" },
        { key: "sources", label: "四源解析", value: "--", tone: "risk" },
      ],
      actions: [{ key: "upload", label: "去上传", href: "/upload" }],
      shouldDisplay: true,
      notices: ["不会自动删除损坏结果，请在上传页确认后重新分析。"],
    };
  }

  const sourceStatuses = SOURCE_TYPES.map((sourceType) => ({
    sourceType,
    status: analysis.sourceHealth[sourceType]?.status ?? "missing",
  }));
  const parsedSourceCount = sourceStatuses.filter((source) => source.status === "parsed").length;
  const sourceCount = SOURCE_TYPES.length;
  const dataQualityWarningCount = analysis.dataQualityWarnings.length;
  const hasSourceGap = parsedSourceCount < sourceCount;
  const hasDataQualityWarnings = dataQualityWarningCount > 0;
  const hasCorruptedTargetStorage = targetStorageState.status === "corrupted";
  const hasCorruptedSeriesStorage = seriesStorageState.status === "corrupted";
  const actions: TmallGlobalDataStatusAction[] = [];
  const notices: string[] = [
    "本提醒只展示本地数据健康状态和跳转入口，不新增经营判断规则。",
  ];

  if (hasSourceGap || hasDataQualityWarnings) {
    addUniqueAction(actions, { key: "upload", label: "去上传", href: "/upload" });
  }

  if (hasCorruptedTargetStorage) {
    addUniqueAction(actions, { key: "targets", label: "目标管理", href: "/targets" });
  }

  if (hasCorruptedSeriesStorage) {
    addUniqueAction(actions, { key: "series", label: "系列看板", href: "/series-board" });
  }

  if (actions.length === 0) {
    addUniqueAction(actions, { key: "home", label: "查看首页", href: "/home" });
  }

  const sourceItems: TmallGlobalDataStatusItem[] = sourceStatuses.map((source) => ({
    key: `source-${source.sourceType}`,
    label: SOURCE_LABELS[source.sourceType],
    value: SOURCE_STATUS_LABELS[source.status],
    tone: itemToneFromSourceStatus(source.status),
  }));
  const targetStatusLabel =
    targetStorageState.status === "corrupted"
      ? "不可用"
      : targetStorageState.status === "valid"
        ? `${targetStorageState.targets.length} 个`
        : "未创建";
  const seriesStatusLabel =
    seriesStorageState.status === "corrupted"
      ? "不可用"
      : seriesStorageState.status === "valid"
        ? `${seriesStorageState.groups.length} 组`
        : "未创建";
  const items: TmallGlobalDataStatusItem[] = [
    {
      key: "sources",
      label: "四源解析",
      value: `${parsedSourceCount}/${sourceCount}`,
      tone: hasSourceGap ? "watch" : "normal",
    },
    {
      key: "data-quality",
      label: "质量提示",
      value: `${dataQualityWarningCount} 条`,
      tone: hasDataQualityWarnings ? "watch" : "normal",
    },
    {
      key: "target-storage",
      label: "目标数据",
      value: targetStatusLabel,
      tone: hasCorruptedTargetStorage ? "risk" : "normal",
    },
    {
      key: "series-storage",
      label: "系列分组",
      value: seriesStatusLabel,
      tone: hasCorruptedSeriesStorage ? "risk" : "normal",
    },
    {
      key: "selected-date",
      label: "当前日期",
      value: selectedDate ?? "--",
      tone: selectedDate ? "normal" : "watch",
    },
    ...sourceItems,
  ];

  if (hasCorruptedTargetStorage) {
    notices.push("本地目标数据不可用，目标完成和目标诊断可能无法展示。");
  }

  if (hasCorruptedSeriesStorage) {
    notices.push("本地系列分组不可用，系列看板可能无法展示。");
  }

  if (hasSourceGap) {
    return {
      tone: "risk",
      title: "当前四源解析不完整",
      description: "建议先补齐四源数据后，再判断经营、推广、系列和宝贝状态。",
      items,
      actions: actions.slice(0, 3),
      shouldDisplay: true,
      notices,
    };
  }

  if (hasCorruptedTargetStorage || hasCorruptedSeriesStorage) {
    return {
      tone: "risk",
      title: "本地配置数据需要检查",
      description: "四源分析结果可用，但目标或系列分组数据不可用，请先检查对应页面。",
      items,
      actions: actions.slice(0, 3),
      shouldDisplay: true,
      notices,
    };
  }

  if (hasDataQualityWarnings) {
    return {
      tone: "watch",
      title: "当前存在数据质量提示",
      description: "四源分析结果可用，但建议先确认字段、日期和关联质量。",
      items,
      actions: actions.slice(0, 3),
      shouldDisplay: true,
      notices,
    };
  }

  return normalGuide({
    parsedSourceCount,
    sourceCount,
    targetStatus: targetStatusLabel,
    seriesStatus: seriesStatusLabel,
    selectedDate,
  });
};
