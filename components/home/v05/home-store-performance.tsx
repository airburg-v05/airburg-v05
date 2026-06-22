import Link from "next/link";
import type { HomeCommandCenterViewModel } from "@/lib/v05/home-command-center";
import {
  formatMoney,
  formatPercent,
  formatRoi,
} from "@/lib/v05/home-command-center";
import { SectionCard } from "@/components/ui/section-card";

export function HomeStorePerformance({ viewModel }: { viewModel: HomeCommandCenterViewModel }) {
  return (
    <SectionCard
      title="店铺表现与优先入口"
      description="按当前范围 GMV 排序；缺失推广数据以 -- 展示。"
    >
      {viewModel.storePerformance.length === 0 ? (
        <div className="rounded-xl bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-slate-900">当前范围暂无店铺经营数据</p>
          <p className="mt-2 text-sm text-slate-500">请切换日期范围，或前往数据导入补充经营数据。</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[820px]">
            <thead>
              <tr>
                <th>店铺</th>
                <th>GMV</th>
                <th>GSV</th>
                <th>贡献占比</th>
                <th>转化率</th>
                <th>推广花费</th>
                <th>ROI</th>
                <th>目标</th>
                <th>入口</th>
              </tr>
            </thead>
            <tbody>
              {viewModel.storePerformance.map((store) => (
                <tr key={store.key}>
                  <td className="max-w-[220px]">
                    <p className="truncate font-semibold text-slate-900">{store.storeName}</p>
                    <p className="mt-1 text-xs text-slate-500">{store.platformLabel}</p>
                  </td>
                  <td>{formatMoney(store.gmv)}</td>
                  <td>{formatMoney(store.gsv)}</td>
                  <td>{formatPercent(store.contributionRate)}</td>
                  <td>{formatPercent(store.conversionRate)}</td>
                  <td>{formatMoney(store.adSpend)}</td>
                  <td>{formatRoi(store.adRoi)}</td>
                  <td>{formatPercent(store.targetProgressRate)}</td>
                  <td>
                    <div className="flex flex-col gap-2">
                      {store.canOpenStoreBoard && store.storeBoardHref ? (
                        <Link href={store.storeBoardHref} className="secondary-button min-h-9 px-3 py-1.5 text-xs">
                          查看店铺
                        </Link>
                      ) : (
                        <Link href={store.historyHref} className="text-xs font-semibold text-blue-700 hover:text-blue-800">
                          查看导入记录
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
