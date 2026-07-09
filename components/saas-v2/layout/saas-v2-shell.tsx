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
          </main>
        </div>
      </div>
    </div>
  );
}
