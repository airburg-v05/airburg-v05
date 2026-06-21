import type { DataCenterPageKey } from "./context";

export interface DataCenterNavItem {
  key: DataCenterPageKey;
  label: string;
  description: string;
}

export const DATA_CENTER_NAV_ITEMS: DataCenterNavItem[] = [
  {
    key: "upload",
    label: "数据导入",
    description: "批量选择四源文件并一次导入",
  },
  {
    key: "history",
    label: "导入记录",
    description: "追踪批次、数据集和激活状态",
  },
  {
    key: "quality",
    label: "数据质量",
    description: "查看缺口、风险和重导入入口",
  },
];
