import { AppShell } from "@/components/app-shell";
import { ReportsClient } from "./reports-client";

export default function ReportsPage() {
  return (
    <AppShell title="报告管理" description="管理当前草稿和已发布的家庭保障报告。">
      <ReportsClient />
    </AppShell>
  );
}
