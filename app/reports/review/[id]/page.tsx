import { AppShell } from "@/components/app-shell";
import { ReportReviewClient } from "./review-client";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReportReviewPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <AppShell title="报告核对" description="为了保证信息的准确，请人工核对解析结果，保存后可生成 H5、PDF或Excel格式。">
      <ReportReviewClient reportId={id} />
    </AppShell>
  );
}
