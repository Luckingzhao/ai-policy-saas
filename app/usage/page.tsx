import { AppShell } from "@/components/app-shell";
import { UsageClient } from "./usage-client";

export default function UsagePage() {
  return (
    <AppShell title="用量统计" description="查看当前套餐、本月报告额度和系统使用记录。">
      <UsageClient />
    </AppShell>
  );
}
