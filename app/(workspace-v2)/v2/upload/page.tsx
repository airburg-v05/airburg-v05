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
            <h2 className="text-xl font-semibold text-slate-950">目标中心数据底座</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              上方 18 文件入口用于经营首页和看板；下方四类报表用于初始化目标中心。
              完成后即可新建、编辑、暂停和重新启用公司、店铺、系列和商品目标。
            </p>
          </div>
        </div>
        <TmallBatchImportWorkbench routeVariant="v2" />
      </section>
    </div>
  );
}
