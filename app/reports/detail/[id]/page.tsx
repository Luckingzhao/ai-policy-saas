import { AppShell } from "@/components/app-shell";
import { ReportDetailClient } from "./detail-client";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReportDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <AppShell title="报告详情" description="查看核验结果，完成人工确认后再发布 H5 报告。">
      <ReportDetailClient reportId={id} />
    </AppShell>
  );
}
