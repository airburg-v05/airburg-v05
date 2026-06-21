"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  DATA_CENTER_NAV_ITEMS,
  dataCenterHref,
  parseDataCenterSearchParams,
  type DataCenterPageKey,
} from "@/lib/v05/data-center";

const getCurrentPage = (pathname: string): DataCenterPageKey => {
  if (pathname.startsWith("/upload/history")) return "history";
  if (pathname.startsWith("/upload/quality")) return "quality";
  return "upload";
};

export function DataCenterNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const context = parseDataCenterSearchParams(searchParams);
  const currentPage = getCurrentPage(pathname);

  return (
    <nav aria-label="数据中心导航" className="panel p-2">
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {DATA_CENTER_NAV_ITEMS.map((item) => {
            const isActive = item.key === currentPage;
            return (
              <Link
                key={item.key}
                href={dataCenterHref(item.key, context)}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-xl px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-blue-700"
                }`}
              >
                <span className="block whitespace-nowrap text-sm font-semibold">{item.label}</span>
                <span className={`mt-1 block whitespace-nowrap text-xs ${isActive ? "text-blue-100" : "text-slate-400"}`}>
                  {item.description}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
