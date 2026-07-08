import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "./dashboard-client";

export default function DashboardPage() {
  return (
    <AppShell title="工作台" description="">
      <DashboardClient />
    </AppShell>
  );
}
