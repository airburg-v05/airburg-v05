export interface MetricV2 {
  label: string;
  value: string;
  unit?: string;
  mtdTarget: string;
  totalTarget: string;
  delta: string;
  completion: string;
  progress: number;
  note: string;
}

export const homeMetrics: MetricV2[] = [
  "GMV",
  "GSV",
  "投入产出比",
  "去退费比",
  "直接成交占比",
  "品牌词访客",
  "品牌词支付人数",
  "品牌词支付占比",
  "退货率（总）",
  "发货退货率",
  "已签收退货率",
  "客单价",
  "转化率",
  "推广花费",
  "推广点击单价",
  "MTD周转",
  "同区履约率",
].map((label) => ({
  label,
  value: "--",
  mtdTarget: "--",
  totalTarget: "--",
  delta: "--",
  completion: "--",
  progress: 0,
  note: "导入经营数据后显示。",
}));

export const boardMetrics: MetricV2[] = [
  "GMV",
  "GSV",
  "投入产出比",
  "去退费比",
  "直接成交占比",
  "品牌词访客",
  "品牌词支付人数",
  "退货率（总）",
  "发货退货率",
  "已签收退货率",
  "客单价",
  "转化率",
  "推广花费",
  "推广点击单价",
  "品牌词支付占比",
].map((label) => ({
  label,
  value: "--",
  mtdTarget: "--",
  totalTarget: "--",
  delta: "--",
  completion: "--",
  progress: 0,
  note: "等待当前经营范围的数据。",
}));

export const navItems = [
  { href: "/v2/home", label: "经营驾驶舱", group: "经营" },
  { href: "/v2/series-board", label: "系列中心", group: "经营" },
  { href: "/v2/store-board", label: "店铺中心", group: "经营" },
  { href: "/v2/product-board", label: "商品中心", group: "经营" },
  { href: "/v2/upload", label: "数据接入", group: "工具" },
  { href: "/v2/data-health", label: "数据健康", group: "工具" },
  { href: "/v2/target-center", label: "目标中心", group: "控制" },
  { href: "/v2/brand-settings", label: "品牌设置", group: "控制" },
  { href: "/v2/search-assets", label: "搜索资产", group: "资产" },
];

export const toolEntries = [
  { href: "/v2/brand-settings", title: "品牌设置", description: "新增、切换并隔离不同品牌的经营工作区。" },
  { href: "/v2/series-board", title: "系列自定义", description: "维护重点系列和商品 ID 清单。" },
  { href: "/v2/search-assets", title: "品牌搜索资产", description: "管理品牌词、中心词、别名词和类目词。" },
  { href: "/v2/target-center", title: "目标中心", description: "集中设置可维护目标并查看联动进度。" },
];

export const keySeriesRows = [
  { name: "P1 / P1+", current: "--", mtd: "--", total: "--", delta: "--", completion: "--", progress: 0 },
  { name: "P2", current: "--", mtd: "--", total: "--", delta: "--", completion: "--", progress: 0 },
  { name: "P300", current: "--", mtd: "--", total: "--", delta: "--", completion: "--", progress: 0 },
  { name: "ZEN", current: "--", mtd: "--", total: "--", delta: "--", completion: "--", progress: 0 },
];

export const recommendedMetricPairs = [
  "GMV vs GSV",
  "GSV vs 推广花费",
  "退货率 vs 去退费比",
  "品牌词访客 vs 品牌词支付人数",
];

export const anomalyRows = [
  ["数据缺失", "待导入", "进入数据健康中心查看覆盖日历"],
  ["未接收文件", "待导入", "查看导入提示"],
  ["重复上传", "待确认", "确认是否需要后续覆盖能力"],
  ["指标不可计算", "待确认", "检查分母缺失或不支持来源"],
];

export const seriesRows = [
  ["P1 / P1+", "天猫 / 空气堡 / 默认店铺", "P1, KJ60F-P1, KJ60P1", "编辑"],
  ["P2", "天猫 / 空气堡 / 默认店铺", "待维护", "编辑"],
  ["P300", "天猫 / 空气堡 / 默认店铺", "待维护", "编辑"],
];

export const seriesContributionRows = [
  ["P1 桌面净化器", "--", "等待当前系列数据"],
  ["P1+ 升级款", "--", "等待商品 ID 清单维护"],
  ["系列合计", "--", "按已维护商品清单展示"],
];

export const seriesSearchRows = [
  ["品牌词", "--", "--"],
  ["中心词", "--", "--"],
  ["类目词", "--", "--"],
];

export const storeRows = [
  ["空气堡天猫旗舰店", "天猫", "默认店铺"],
  ["京东店铺", "京东", "暂未接入"],
  ["抖音店铺", "抖音", "暂未接入"],
];

export const storeContributionRows = [
  ["系列贡献", "GSV", "--"],
  ["商品贡献", "GMV", "--"],
  ["搜索资产贡献", "品牌词支付占比", "--"],
];

export const trackedProductRows = [
  ["KJ60F-P1", "空气堡天猫旗舰店", "P1 桌面净化器"],
  ["KJ60P1", "空气堡天猫旗舰店", "P1 轻量款"],
  ["P300", "空气堡天猫旗舰店", "P300 大空间款"],
];

export const productSearchRows = [
  ["品牌词", "--", "--"],
  ["中心词", "--", "--"],
  ["别名词", "--", "--"],
];

export const productAfterSalesRows = [
  ["退货率（总）", "--", "安全聚合"],
  ["发货退货率", "--", "安全聚合"],
  ["已签收退货率", "--", "安全聚合"],
];

export const platformRows = [
  ["天猫", "tmall", "已开放"],
  ["京东", "jd", "暂未开放"],
  ["抖音", "douyin", "暂未开放"],
  ["有赞", "youzan", "暂未开放"],
  ["拼多多", "pdd", "暂未开放"],
];

export const templateRows = [
  ["商品经营模板", "日期、商品 ID、GMV、GSV", "缺失会影响经营 KPI"],
  ["订单明细模板", "日期、订单聚合字段", "缺失会影响订单结构指标"],
  ["售后明细模板", "安全聚合字段", "缺失会影响退货率三线"],
  ["搜索词模板", "日期、关键词、访客、支付人数", "缺失会影响搜索资产"],
  ["推广模板", "日期、花费、点击、成交", "缺失会影响 ROI 和推广指标"],
];

export const uploadStatusRows = [
  ["成功", "--", "识别并进入经营汇总"],
  ["失败", "--", "未识别或缺少必填字段"],
  ["跳过", "--", "重复或不支持来源"],
];

export const coverageCalendarRows = [
  ["2026-06-26", "待导入", "待导入", "待导入", "待导入"],
  ["2026-06-27", "待导入", "待导入", "待导入", "待导入"],
  ["2026-06-28", "待导入", "待导入", "待导入", "待导入"],
  ["2026-06-29", "待导入", "待导入", "待导入", "待导入"],
  ["2026-06-30", "待导入", "待导入", "待导入", "待导入"],
];

export const dataHealthRows = [
  ["缺失数据", "待导入", "等待经营数据覆盖"],
  ["重复上传", "待确认", "后续可扩展版本管理"],
  ["未接收文件", "待确认", "显示可处理提示"],
  ["指标不可计算", "待确认", "分母缺失时显示 --"],
];

export const sourceCoverageRows = [
  ["商品经营", "待导入", "GMV / GSV / 访客 / 支付买家"],
  ["推广计划", "待导入", "推广花费 / 点击 / ROI"],
  ["搜索汇总", "待导入", "品牌词访客 / 支付人数"],
  ["售后数据", "待导入", "退货率三线"],
];

export const targetScopeRows = [
  ["品牌目标", "品牌级经营目标"],
  ["平台目标", "按平台拆分"],
  ["店铺目标", "按店铺拆分"],
  ["系列目标", "按系列拆分"],
  ["商品目标", "按商品拆分"],
];

export const targetRuleRows = [
  ["GMV", "元", "可输入"],
  ["GSV", "元", "可输入"],
  ["投入产出比", "倍", "可输入"],
  ["转化率", "%", "可输入"],
  ["退货率（总）", "%", "可输入"],
  ["客单价", "元", "可输入"],
  ["直接成交占比", "%", "可输入"],
];

export const derivedTargetRows = [
  ["推广花费", "GSV目标 / 投入产出比目标", "由已有目标推导"],
  ["品牌词支付占比", "品牌词支付人数目标 / 总搜索词支付人数目标", "由已有目标推导"],
  ["去退费比", "推广花费目标 / (GSV目标 x (1 - 退货率目标))", "由已有目标推导"],
];

export const aliasRows = [
  ["空气堡", "Airburg, AIRBURG", "中文 / 英文同归属"],
  ["P1", "KJ60F-P1, KJ60P1", "中心词组下的别名"],
  ["P300", "P300 系列词", "未来产品族"],
];

export const searchAssetRows = [
  ["Brand", "品牌词", "品牌搜索资产归因"],
  ["Series", "中心词", "系列和产品族识别"],
  ["Product", "别名词", "商品级搜索表现"],
  ["Category", "类目词", "非品牌类目机会"],
];

export const keywordComparisonRows = [
  ["P1 / P1+", "--", "--"],
  ["P2", "--", "--"],
  ["P300", "--", "--"],
];

export const sourceCapabilityRows = [
  ["商品标题", "可用性待检测", "可用于商品 ID 外的辅助排除"],
  ["订单明细", "当前数据源不支持该过滤", "无对应来源时不可用"],
  ["售后明细", "当前数据源不支持该过滤", "不展示敏感文本"],
  ["备注字段", "当前数据源不支持该过滤", "待开放"],
];

export const exclusionRuleRows = [
  ["商品 ID 排除", "商品级经营数据", "待开放"],
  ["多文本排除", "仅数据源支持字段", "待开放"],
  ["规则生效说明", "当前经营范围", "待开放"],
];
