import { SaasV2Shell } from "@/components/saas-v2/layout/saas-v2-shell";

export default function WorkspaceV2Layout({ children }: { children: React.ReactNode }) {
  return <SaasV2Shell>{children}</SaasV2Shell>;
}
