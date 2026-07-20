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
};

const MISSING_V2_ROUTE_REASON: Record<string, string> = {
  "/series-board/manage": "BLOCKED_BY_MISSING_V2_ROUTE: 系列管理页尚未提供授权 V2 路由。",
  "/product-board/tracked": "BLOCKED_BY_MISSING_V2_ROUTE: 重点商品管理页尚未提供授权 V2 路由。",
};

export const mapHrefToAuthorizedV2Route = (
  href: string | null | undefined,
): V2RouteMappingResult | null => {
  if (!href) return null;
  if (href.startsWith("/v2/")) {
    return {
      status: "mapped",
      sourceHref: href,
      href,
      reason: "Already within authorized V2 routes.",
    };
  }

  const parsed = new URL(href, "https://airburg.local");
  const targetPath = EXACT_V2_ROUTE_MAP[parsed.pathname];
  if (targetPath) {
    return {
      status: "mapped",
      sourceHref: href,
      href: `${targetPath}${parsed.search}`,
      reason: "Mapped to an authorized V2 route.",
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
    reason: `BLOCKED_LEGACY_ROUTE: ${parsed.pathname} has no authorized V2 mapping in the current continuation scope.`,
  };
};
