import { PublicReport } from "../../[slug]/public-report";

type PreviewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReportPreviewPage({ params }: PreviewPageProps) {
  const { id } = await params;
  return <PublicReport reportId={id} preview />;
}
