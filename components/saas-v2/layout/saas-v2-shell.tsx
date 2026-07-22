import { SaasV2PageHeader } from "@/components/saas-v2/layout/saas-v2-page-header";
import { SaasV2Sidebar } from "@/components/saas-v2/layout/saas-v2-sidebar";
import { SaasV2Topbar } from "@/components/saas-v2/layout/saas-v2-topbar";

export function SaasV2Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-slate-50 text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-[1800px] min-w-0 overflow-x-hidden lg:grid-cols-[248px_1fr]">
        <SaasV2Sidebar />
        <div className="min-w-0 max-w-full overflow-x-hidden">
          <SaasV2Topbar />
          <main className="min-w-0 max-w-full overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8">
            <SaasV2PageHeader />
            {children}
            <footer className="mt-8 border-t border-slate-200/80 py-5 text-center text-xs text-slate-500">
              <a
                className="transition-colors hover:text-slate-800"
                href="https://beian.miit.gov.cn/"
                rel="noopener noreferrer"
                target="_blank"
              >
                京ICP备2026041365号-1
              </a>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
