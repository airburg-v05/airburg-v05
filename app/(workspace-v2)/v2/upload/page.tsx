import { UploadPageV1Dashboard } from "@/components/upload/v1/upload-page-v1-dashboard";
import { TmallBatchImportWorkbench } from "@/components/upload/batch-import/tmall-batch-import-workbench";

export default function SaasV2UploadPage() {
  return (
    <div className="space-y-6">
      <UploadPageV1Dashboard layoutMode="embedded" routeVariant="v2" />

      <section
        className="space-y-5"
        data-testid="v2-upload-target-foundation"
      >
        <div className="panel p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">目标中心数据底座</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">用于目标设置的四源导入</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              上方 18 文件入口写入经营首页和看板使用的安全聚合数据；目标中心沿用 V0.5F
              已冻结的多店铺目标合同，需要用下方四类报表激活目标数据底座后，才能新建、编辑、暂停和重新启用目标。
            </p>
          </div>
        </div>
        <TmallBatchImportWorkbench routeVariant="v2" />
      </section>
    </div>
  );
}
