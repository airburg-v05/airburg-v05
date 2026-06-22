"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  CloseIcon,
  HomeIcon,
  LayersIcon,
  MenuIcon,
  ProductIcon,
  StoreIcon,
  TableIcon,
  UploadIcon,
  type IconProps,
} from "@/components/icons";
import {
  clearDemoSession,
} from "@/lib/storage/analysis-storage";
import { useDemoSession } from "@/lib/storage/use-local-storage";

interface NavigationItem {
  label: string;
  href: string;
  icon: ComponentType<IconProps>;
}

const navigation: NavigationItem[] = [
  { label: "经营首页", href: "/home", icon: HomeIcon },
  { label: "数据中心", href: "/upload", icon: UploadIcon },
  { label: "店铺看板", href: "/store-board", icon: StoreIcon },
  { label: "系列看板", href: "/series-board", icon: LayersIcon },
  { label: "宝贝看板", href: "/product-board", icon: ProductIcon },
  { label: "目标管理", href: "/targets", icon: StoreIcon },
  { label: "安全数据", href: "/raw-data", icon: TableIcon },
];

const pageNames: Record<string, string> = {
  "/home": "经营首页",
  "/upload": "数据中心",
  "/upload/history": "导入记录",
  "/upload/quality": "数据质量",
  "/store-board": "店铺看板",
  "/product-board": "宝贝看板",
  "/product-board/tracked": "重点商品管理",
  "/series-board": "系列看板",
  "/series-board/manage": "系列管理",
  "/targets": "目标管理",
  "/raw-data": "安全数据",
};

interface AppShellProps {
  children: React.ReactNode;
}

function Brand() {
  return (
    <Link href="/home" className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/20">
        AD
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Airburg Data</p>
        <p className="text-xs text-slate-400">电商数据分析平台</p>
      </div>
    </Link>
  );
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="主导航" className="space-y-1.5">
      {navigation.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const session = useDemoSession();

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [router, session]);

  const handleLogout = () => {
    clearDemoSession();
    router.replace("/login");
  };

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          正在进入工作台…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-slate-950 px-4 py-5 lg:flex">
        <Brand />
        <div className="mt-8 flex-1">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            工作空间
          </p>
          <Navigation pathname={pathname} />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">当前工作区</p>
              <p className="mt-1 text-sm font-semibold text-white">本地经营数据</p>
            </div>
            <span className="rounded-lg bg-orange-500/15 px-2 py-1 text-xs font-semibold text-orange-300">TM</span>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="关闭菜单"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[82%] max-w-xs flex-col bg-slate-950 px-4 py-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                aria-label="关闭菜单"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-8 flex-1">
              <Navigation pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="打开菜单"
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <MenuIcon className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {pageNames[pathname] ?? "电商数据分析平台"}
                </p>
                <p className="truncate text-xs text-slate-500">多平台多店铺经营工作台</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 sm:inline-flex">
                天猫平台
              </span>
              <div className="hidden text-right sm:block">
                <p className="max-w-40 truncate text-sm font-medium text-slate-800">{session.account}</p>
                <p className="text-xs text-slate-500">演示账号</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              >
                退出
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
