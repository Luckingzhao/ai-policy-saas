import { PublicReport } from "./public-report";

type ReportPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ReportPage({ params }: ReportPageProps) {
  const { slug } = await params;
  return <PublicReport slug={slug} />;
}
