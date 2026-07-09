import { AttachmentRedirectClient } from "./redirect-client";

type PageProps = {
  params: Promise<{
    reportId: string;
    attachmentId: string;
  }>;
};

export default async function ReportAttachmentPage({ params }: PageProps) {
  const { reportId, attachmentId } = await params;
  const apiPath = `/api/report-attachments/${encodeURIComponent(reportId)}/${encodeURIComponent(attachmentId)}`;

  return <AttachmentRedirectClient apiPath={apiPath} />;
}
