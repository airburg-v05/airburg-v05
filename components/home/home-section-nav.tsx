import type { TmallHomeSectionNavViewModel } from "@/lib/tmall/view-models/home-section-nav";

interface HomeSectionNavProps {
  nav: TmallHomeSectionNavViewModel;
}

export function HomeSectionNav({ nav }: HomeSectionNavProps) {
  if (nav.visibleItems.length === 0) return null;

  return (
    <section className="panel max-w-full overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">首页模块导航</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{nav.helperText}</p>
      </div>

      <div className="min-w-0 max-w-full px-5 py-3">
        <nav
          aria-label="首页模块导航"
          className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1"
        >
          {nav.visibleItems.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
