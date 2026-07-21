export type V2RouteMappingStatus =
  | "mapped"
  | "blocked_missing_v2_route"
  | "blocked_legacy_route";

export interface V2RouteMappingResult {
  status: V2RouteMappingStatus;
  sourceHref: string;
  href: string | null;
  reason: string;
}

const EXACT_V2_ROUTE_MAP: Record<string, string> = {
  "/home": "/v2/home",
  "/series-board": "/v2/series-board",
  "/store-board": "/v2/store-board",
  "/product-board": "/v2/product-board",
  "/upload": "/v2/upload",
  "/upload/history": "/v2/upload/history",
  "/upload/quality": "/v2/data-health",
  "/series-board/manage": "/v2/series-board",
  "/product-board/tracked": "/v2/product-board",
};

const MISSING_V2_ROUTE_REASON: Record<string, string> = {};

export const mapHrefToAuthorizedV2Route = (
  href: string | null | undefined,
): V2RouteMappingResult | null => {
  if (!href) return null;
  if (href.startsWith("/v2/")) {
    return {
      status: "mapped",
      sourceHref: href,
      href,
      reason: "已在当前工作区内。",
    };
  }

  const parsed = new URL(href, "https://airburg.local");
  const targetPath = EXACT_V2_ROUTE_MAP[parsed.pathname];
  if (targetPath) {
    return {
      status: "mapped",
      sourceHref: href,
      href: `${targetPath}${parsed.search}`,
      reason: "已转到当前工作区对应页面。",
    };
  }

  const missingReason = MISSING_V2_ROUTE_REASON[parsed.pathname];
  if (missingReason) {
    return {
      status: "blocked_missing_v2_route",
      sourceHref: href,
      href: null,
      reason: missingReason,
    };
  }

  return {
    status: "blocked_legacy_route",
    sourceHref: href,
    href: null,
    reason: "当前工作区暂未开放对应页面。",
  };
};
