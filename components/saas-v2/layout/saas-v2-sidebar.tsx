import { navItems } from "@/components/saas-v2/data";

export function SaasV2Sidebar() {
  const groups = Array.from(new Set(navItems.map((item) => item.group)));

  return (
    <aside className="min-w-0 max-w-full overflow-hidden border-b border-slate-200 bg-white px-4 py-4 lg:min-h-screen lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
          AB
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-950">品牌经营云</p>
          <p className="text-xs text-slate-500">品牌经营工作区</p>
        </div>
      </div>
      <nav className="mt-5 flex max-w-full gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {groups.map((group) => (
          <div key={group} className="flex shrink-0 gap-2 lg:flex-col">
            <p className="hidden px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400 lg:block">
              {group}
            </p>
            {navItems
              .filter((item) => item.group === group)
              .map((item) => (
                <a
                  key={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                  href={item.href}
                >
                  {item.label}
                </a>
              ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
