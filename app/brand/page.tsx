import { AppShell } from "@/components/app-shell";
import { BrandClient } from "./brand-client";

export default function BrandPage() {
  return (
    <AppShell title="我的品牌设置" description="维护展示在客户 H5 报告里的顾问和品牌信息。">
      <BrandClient />
    </AppShell>
  );
}
