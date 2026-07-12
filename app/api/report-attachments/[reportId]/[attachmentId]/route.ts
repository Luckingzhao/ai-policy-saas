import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    reportId: string;
    attachmentId: string;
  }>;
};

type Report = Pick<Database["public"]["Tables"]["h5_reports"]["Row"], "id" | "user_id" | "status" | "summary">;
type ReportFile = Pick<
  Database["public"]["Tables"]["report_files"]["Row"],
  "id" | "bucket" | "object_path" | "original_filename"
>;

type AttachmentMeta = {
  id: string;
  bucket: string;
  object_path: string;
  original_filename: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

export async function GET(_request: Request, context: RouteContext) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return new NextResponse("附件访问服务未配置，请联系保险顾问。", { status: 500 });
  }

  const { reportId, attachmentId } = await context.params;
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { data: report, error: reportError } = await supabase
    .from("h5_reports")
    .select("id,user_id,status,summary")
    .eq("id", reportId)
    .eq("status", "published")
    .maybeSingle<Report>();

  if (reportError || !report) {
    return new NextResponse("报告暂不可访问。", { status: 404 });
  }

  const attachment = await resolveAttachment(supabase, report, attachmentId);
  if (!attachment) {
    return new NextResponse("附件不存在或已隐藏。", { status: 404 });
  }

  const { data, error } = await supabase.storage.from(attachment.bucket).createSignedUrl(attachment.object_path, 60 * 60, {
    download: attachment.original_filename
  });

  if (error || !data?.signedUrl) {
    return new NextResponse("附件临时链接生成失败。", { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}

async function resolveAttachment(
  supabase: ReturnType<typeof createClient<Database>>,
  report: Report,
  attachmentId: string
): Promise<Pick<AttachmentMeta, "bucket" | "object_path" | "original_filename"> | null> {
  const manualAttachment = getManualAttachments(report.summary).find((attachment) => attachment.id === attachmentId);
  if (manualAttachment) {
    return isTenantOwnedAttachment(manualAttachment, report.user_id) ? manualAttachment : null;
  }

  if (isSourceAttachmentHidden(report.summary)) {
    return null;
  }

  const sourceFileId = getSourceFileId(report.summary);
  if (!sourceFileId || sourceFileId !== attachmentId) {
    return null;
  }

  const { data: file } = await supabase
    .from("report_files")
    .select("id,bucket,object_path,original_filename")
    .eq("id", sourceFileId)
    .eq("user_id", report.user_id)
    .maybeSingle<ReportFile>();

  return file ?? null;
}

function isTenantOwnedAttachment(attachment: AttachmentMeta, userId: string) {
  const allowedBuckets = new Set(["policy-pdfs", "report-assets"]);
  const normalizedPath = attachment.object_path.replace(/^\/+/, "");
  return allowedBuckets.has(attachment.bucket) && normalizedPath.startsWith(`${userId}/`);
}

function getManualAttachments(summary: Json): AttachmentMeta[] {
  if (!isPlainObject(summary) || !Array.isArray(summary.attachments)) return [];
  return summary.attachments.filter(isAttachmentMeta);
}

function isAttachmentMeta(value: Json): value is AttachmentMeta {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.bucket === "string" &&
    typeof value.object_path === "string" &&
    typeof value.original_filename === "string" &&
    typeof value.created_at === "string"
  );
}

function getSourceFileId(summary: Json) {
  if (!isPlainObject(summary)) return "";
  const value = summary.report_file_id;
  return typeof value === "string" ? value : "";
}

function isSourceAttachmentHidden(summary: Json) {
  return isPlainObject(summary) && summary.hide_source_attachment === true;
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
