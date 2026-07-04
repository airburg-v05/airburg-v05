export interface CenterWordGroup {
  id: string;
  centerWord: string;
  aliases: string[];
}

export interface BrandModelFilter {
  brandWords: string[];
  modelWords: string[];
  centerWordGroups?: CenterWordGroup[];
}

export interface BISearchTotalKeyword {
  platformCode: string;
  platformName: string | null;
  storeId: string;
  storeName: string | null;
  date: string | null;
  keyword: string;
  visitors: number | null;
  buyers: number | null;
  gmv: number | null;
}

export interface BISearchProductKeyword {
  platformCode: string;
  platformName: string | null;
  storeId: string;
  storeName: string | null;
  date: string | null;
  productId: string;
  keyword: string;
  visitors: number | null;
  buyers: number | null;
}
