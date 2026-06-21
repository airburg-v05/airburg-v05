import type { TmallProductBoardSectionNavViewModel } from "@/lib/tmall/view-models/product-board-section-nav";

interface ProductBoardSectionNavProps {
  nav: TmallProductBoardSectionNavViewModel;
}

export function ProductBoardSectionNav({ nav }: ProductBoardSectionNavProps) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">宝贝看板导航</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{nav.helperText}</p>
      </div>

      <div className="px-5 py-3">
        <nav
          aria-label="宝贝看板模块导航"
          className="-mx-1 overflow-x-auto pb-1"
        >
          <div className="flex w-max max-w-none gap-2 px-1">
            {nav.visibleItems.map((item) => (
              <a
                key={item.key}
                href={`#${item.sectionId}`}
                className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </section>
  );
}
