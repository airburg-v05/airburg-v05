import { SafeIssueCodeBadge } from "@/components/saas-v2/badges/safe-issue-code-badge";
import { DataTableV2 } from "@/components/saas-v2/tables/data-table-v2";
import { platformRows, templateRows, uploadStatusRows } from "@/components/saas-v2/data";

export default function SaasV2UploadPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">平台原始表自动识别上传区</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              当前阶段保留统一批量上传入口。上传结果只展示 success / failed / skipped 和 safe issue code。
            </p>
          </div>
          <a className="secondary-button" href="/v2/data-health">查看数据健康</a>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {platformRows.map((row) => (
            <button
              key={row[0]}
              className={`rounded-lg border p-4 text-left text-sm transition ${
                row[2] === "已开放"
                  ? "border-blue-200 bg-blue-50 text-blue-900"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
              type="button"
            >
              <span className="font-semibold">{row[0]}</span>
              <span className="mt-1 block">{row[2]}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-slate-900">拖拽或选择平台原始表</p>
          <p className="mt-2 text-sm text-slate-500">本地 preview workspace 不上传真实文件；后续接入现有导入服务。</p>
          <button className="primary-button mt-4" type="button">选择文件</button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DataTableV2
          title="标准模板兜底入口"
          description="模板说明用于识别失败时的安全兜底，不改变 ETL 口径。"
          columns={["模板", "必填说明", "可选影响"]}
          rows={templateRows}
        />
        <DataTableV2
          title="导入摘要"
          description="只展示安全状态，不展示原始内容。"
          columns={["状态", "数量", "说明"]}
          rows={uploadStatusRows}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">识别失败引导</h2>
            <p className="mt-1 text-sm text-slate-500">失败时展示 issue code 和下一步建议。</p>
          </div>
          <SafeIssueCodeBadge code="SOURCE_TYPE_UNSUPPORTED" />
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          若平台原始表暂无法识别，请使用标准模板兜底，并进入数据健康中心查看缺失来源和 skipped 摘要。
        </p>
      </section>
    </div>
  );
}
