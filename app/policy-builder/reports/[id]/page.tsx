import { AppShell } from "@/components/app-shell";
import { PolicyBuilderReportClient } from "./report-client";

export default async function PolicyBuilderReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AppShell title="产品评测报告" description="基于已解析的标准保单 JSON 生成评测、方案对比与 PDF 交付稿。">
      <PolicyBuilderReportClient reportId={id} />
    </AppShell>
  );
}
