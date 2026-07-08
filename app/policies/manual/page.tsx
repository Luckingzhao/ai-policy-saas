import { AppShell } from "@/components/app-shell";
import { ManualPolicyClient } from "./manual-policy-client";

export default function ManualPolicyPage() {
  return (
    <AppShell title="手动录入" description="手动整理客户保单信息，后续可用于生成家庭保障报告。">
      <ManualPolicyClient />
    </AppShell>
  );
}
