"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Eye,
  FileText,
  Loader2,
  PencilLine,
  Send,
  Trash2,
  UploadCloud
} from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";

type Report = Pick<
  Database["public"]["Tables"]["h5_reports"]["Row"],
  "id" | "customer_id" | "slug" | "title" | "status" | "summary" | "created_at" | "published_at"
>;
type Customer = Pick<Database["public"]["Tables"]["customers"]["Row"], "id" | "name" | "phone" | "wechat_id" | "city">;

type VerificationRound = {
  name: string;
  passed: boolean;
  detail: string;
};

type VerificationSummary = {
  quality_status?: "passed" | "review_required";
  total_policy_count?: number;
  inserted_policy_count?: number;
  annual_premium_total?: number;
  remaining_premium_total?: number;
  has_duplicate_policies?: boolean;
  duplicate_policy_count?: number;
  has_missing_fields?: boolean;
  missing_fields?: Json;
  remaining_premium_checks?: Json;
  beneficiary_checks?: Json;
  verification_rounds?: VerificationRound[];
};

type ParsedSummary = {
  parse_status?: string;
  parse_error?: string;
  review_status?: string;
  reviewed_at?: string;
  confirmed_at?: string;
  verification?: VerificationSummary;
  report_json?: Json;
  attachments?: Json;
  hide_source_attachment?: boolean;
  original_filename?: string;
  report_file_id?: string;
};

type AttachmentMeta = {
  id: string;
  bucket: string;
  object_path: string;
  original_filename: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

export function ReportDetailClient({ reportId }: { reportId: string }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [report, setReport] = useState<Report | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [togglingSourceAttachment, setTogglingSourceAttachment] = useState(false);

  async function loadReport() {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setMessage("请先登录。");
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("h5_reports")
      .select("id,customer_id,slug,title,status,summary,created_at,published_at")
      .eq("id", reportId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (error || !data) {
      setMessage(error?.message || "报告不存在或无权访问。");
      setReport(null);
      setCustomer(null);
      setIsLoading(false);
      return;
    }

    setReport(data);
    if (data.customer_id) {
      const { data: customerData } = await supabase
        .from("customers")
        .select("id,name,phone,wechat_id,city")
        .eq("id", data.customer_id)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      setCustomer(customerData ?? null);
    } else {
      setCustomer(null);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  async function confirmReport() {
    if (!report) return;
    const summary = parseSummary(report.summary);
    if (summary.parse_status !== "completed" || !summary.report_json) {
      setMessage("请先完成解析，并生成 report_json 后再确认。");
      return;
    }

    setMessage("");
    setConfirming(true);
    const nextSummary = {
      ...(isPlainObject(report.summary) ? report.summary : {}),
      review_status: "confirmed",
      confirmed_at: new Date().toISOString()
    };
    const { error } = await supabase.from("h5_reports").update({ summary: nextSummary as Json }).eq("id", report.id);
    setConfirming(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setReport({ ...report, summary: nextSummary as Json });
    setMessage("已确认报告内容。现在可以发布 H5。");
  }

  async function publishReport() {
    if (!report) return;
    if (!isReportConfirmed(report.summary)) {
      setMessage("请先确认报告内容无误，再发布 H5。");
      return;
    }

    const confirmedPublish = window.confirm("默认含有附件，是否一同发给客户？如果不需要，请在下方附件区域删除或隐藏附件后再生成 H5 发给客户。");
    if (!confirmedPublish) return;

    setMessage("");
    setPublishing(true);
    const { error } = await supabase
      .from("h5_reports")
      .update({
        status: "published",
        published_at: new Date().toISOString()
      })
      .eq("id", report.id);
    setPublishing(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      await supabase.from("usage_logs").insert({
        user_id: userData.user.id,
        subscription_id: subscription?.id ?? null,
        action: "publish_h5_report",
        quantity: 1,
        metadata: {
          report_id: report.id
        }
      });
    }

    setMessage("报告已发布，客户现在可以打开分享链接。");
    await loadReport();
  }

  async function copyPublicLink() {
    if (!report) return;
    const path = `/reports/${report.slug}`;
    const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    setMessage(`客户公开链接已复制：${path}`);
  }

  async function handleAttachmentUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !report) return;

    if (file.type && file.type !== "application/pdf") {
      setMessage("目前附件仅支持 PDF 文件。");
      return;
    }

    setMessage("");
    setUploadingAttachment(true);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setUploadingAttachment(false);
      setMessage("请先登录后再上传附件。");
      return;
    }

    const attachmentId = createId();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const objectPath = `${userData.user.id}/${report.id}/${attachmentId}-${safeName}`;
    const uploadResult = await supabase.storage.from("report-assets").upload(objectPath, file, {
      cacheControl: "3600",
      contentType: file.type || "application/pdf",
      upsert: false
    });

    if (uploadResult.error) {
      setUploadingAttachment(false);
      setMessage(formatStorageUploadError(uploadResult.error.message));
      return;
    }

    const attachment: AttachmentMeta = {
      id: attachmentId,
      bucket: "report-assets",
      object_path: objectPath,
      original_filename: file.name,
      mime_type: file.type || "application/pdf",
      file_size: file.size,
      created_at: new Date().toISOString()
    };
    const nextSummary = {
      ...(isPlainObject(report.summary) ? report.summary : {}),
      attachments: [...getAttachments(report.summary), attachment] as unknown as Json
    };
    const { error } = await supabase.from("h5_reports").update({ summary: nextSummary as Json }).eq("id", report.id);

    setUploadingAttachment(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setReport({ ...report, summary: nextSummary as Json });
    setMessage("附件已上传，H5 底部将展示该 PDF 附件。");
  }

  async function deleteAttachment(attachment: AttachmentMeta) {
    if (!report) return;

    const confirmedDelete = window.confirm("确定删除这个附件吗？删除后客户 H5 底部将不再展示该附件。");
    if (!confirmedDelete) return;

    setMessage("");
    setDeletingAttachmentId(attachment.id);

    const removeResult = await supabase.storage.from(attachment.bucket).remove([attachment.object_path]);
    const nextAttachments = getAttachments(report.summary).filter((item) => item.id !== attachment.id);
    const nextSummary = {
      ...(isPlainObject(report.summary) ? report.summary : {}),
      attachments: nextAttachments as unknown as Json
    };
    const { error } = await supabase.from("h5_reports").update({ summary: nextSummary as Json }).eq("id", report.id);

    setDeletingAttachmentId(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    setReport({ ...report, summary: nextSummary as Json });
    if (removeResult.error) {
      setMessage(`附件已从 H5 移除，但 Storage 文件删除失败：${removeResult.error.message}`);
      return;
    }

    setMessage("附件已删除，客户 H5 底部将不再展示该附件。");
  }

  async function setSourceAttachmentVisible(visible: boolean) {
    if (!report) return;

    if (!visible) {
      const confirmedHide = window.confirm("确定在客户 H5 底部隐藏原始上传文件吗？隐藏后不会影响报告解析数据。");
      if (!confirmedHide) return;
    }

    setMessage("");
    setTogglingSourceAttachment(true);

    const nextSummary = {
      ...(isPlainObject(report.summary) ? report.summary : {}),
      hide_source_attachment: !visible
    };
    const { error } = await supabase.from("h5_reports").update({ summary: nextSummary as Json }).eq("id", report.id);

    setTogglingSourceAttachment(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setReport({ ...report, summary: nextSummary as Json });
    setMessage(visible ? "原始上传文件已恢复展示。" : "原始上传文件已从客户 H5 底部隐藏。");
  }

  if (isLoading) {
    return <p className="rounded-lg bg-white p-6 text-sm text-slate-500">正在加载报告详情...</p>;
  }

  if (!report) {
    return <p className="rounded-lg bg-white p-6 text-sm text-slate-500">{message || "无法加载报告。"}</p>;
  }

  const summary = parseSummary(report.summary);
  const verification = summary.verification;
  const rounds = verification?.verification_rounds ?? [];
  const failedRounds = rounds.filter((round) => !round.passed);
  const qualityPassed = verification?.quality_status === "passed" || (rounds.length > 0 && failedRounds.length === 0);
  const policyCount = readPolicyCount(summary.report_json);
  const confirmed = isReportConfirmed(report.summary);
  const parsed = summary.parse_status === "completed";
  const attachments = getAttachments(report.summary);
  const sourceAttachment = getSourceAttachment(report.summary);
  const sourceAttachmentHidden = isSourceAttachmentHidden(report.summary);

  return (
    <div className="grid gap-5">
      <section id="attachments" className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link href="/reports" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-ink">
              <ArrowLeft className="h-4 w-4" />
              返回报告列表
            </Link>
            <div className="mt-4 flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-50 text-brand">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="break-words text-xl font-semibold">{report.title}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {customer?.name ?? "未知客户"} · {statusText(report.status)} · {formatDate(report.created_at)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusPill state={parsed ? "success" : summary.parse_status === "failed" ? "danger" : "muted"} label={parseStatusText(summary)} />
                  {verification ? (
                    <StatusPill state={qualityPassed ? "success" : "danger"} label={qualityPassed ? "核验通过" : "需复核"} />
                  ) : null}
                  <StatusPill state={confirmed ? "success" : parsed ? "danger" : "muted"} label={confirmed ? "已确认" : "待确认"} />
                  <StatusPill state={report.status === "published" ? "success" : "muted"} label={report.status === "published" ? "已发布" : "未发布"} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/reports/review/${report.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink"
            >
              <PencilLine className="h-4 w-4" />
              核对报告
            </Link>
            <button
              onClick={confirmReport}
              disabled={!parsed || confirming}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              确认无误
            </button>
            {report.status !== "published" ? (
              <button
                onClick={publishReport}
                disabled={publishing || !confirmed}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发布 H5
              </button>
            ) : null}
            {report.status === "published" ? (
              <>
                <Link
                  href={`/reports/${report.slug}`}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink"
                >
                  <Eye className="h-4 w-4" />
                  查看 H5
                </Link>
                <button
                  onClick={copyPublicLink}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink"
                >
                  <Copy className="h-4 w-4" />
                  复制客户链接
                </button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {message ? <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">{message}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="最终保单数" value={`${policyCount || verification?.total_policy_count || 0} 份`} />
        <MetricCard label="年缴总保费" value={formatMoney(verification?.annual_premium_total)} />
        <MetricCard label="待缴总保费" value={formatMoney(verification?.remaining_premium_total)} />
        <MetricCard label="入库保单" value={`${verification?.inserted_policy_count ?? 0} 份`} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">发布前确认流程</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">H5 发布前必须完成报告确认。即使自动核验有红色提示，也可以在人工核对后确认发布。</p>
          </div>
          <StatusPill
            state={confirmed ? "success" : !qualityPassed && parsed ? "danger" : parsed ? "warning" : "muted"}
            label={confirmed ? "已确认可发布" : !qualityPassed && parsed ? "建议先复核" : parsed ? "待确认" : "待解析"}
          />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <ProcessStep done={parsed} title="1. AI 解析" description={parsed ? "已生成标准 report_json" : "先点击开始解析"} />
          <ProcessStep done={summary.review_status === "reviewed" || confirmed} title="2. 人工核对" description="进入核对页修正字段" />
          <ProcessStep done={confirmed} title="3. 确认发布" description={confirmed ? "已确认，可以发布" : "确认后才允许发布 H5"} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold">H5 附件</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              可另外上传附件，客户在 H5 底部查询。原始上传文件也会自动作为附件展示。
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            上传新的附件
            <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handleAttachmentUpload} disabled={uploadingAttachment} />
          </label>
        </div>
        {!sourceAttachment && attachments.length === 0 ? (
          <p className="mt-4 rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-500">暂无附件。</p>
        ) : (
          <div className="mt-4 grid gap-2">
            {sourceAttachment ? (
              <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{sourceAttachment.name}</p>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">原始上传文件</span>
                    {sourceAttachmentHidden ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">H5 已隐藏</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">这是保单管理上传的原始文件，可选择是否在客户 H5 底部展示。</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <FileText className="h-4 w-4 text-brand" />
                  <button
                    type="button"
                    onClick={() => setSourceAttachmentVisible(sourceAttachmentHidden)}
                    disabled={togglingSourceAttachment}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {togglingSourceAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {sourceAttachmentHidden ? "恢复展示" : "从 H5 隐藏"}
                  </button>
                </div>
              </div>
            ) : null}
            {attachments.map((attachment) => (
              <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{attachment.original_filename}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatSize(attachment.file_size)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <FileText className="h-4 w-4 text-brand" />
                  <button
                    type="button"
                    onClick={() => deleteAttachment(attachment)}
                    disabled={deletingAttachmentId === attachment.id}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-coral transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingAttachmentId === attachment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold">五项核验结果</h3>
        {rounds.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">暂无核验结果，请先解析报告。</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {rounds.map((round) => (
              <div key={round.name} className={`rounded-md border p-4 ${round.passed ? "border-emerald-100 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <p className={`flex items-start gap-2 font-semibold ${round.passed ? "text-emerald-700" : "text-amber-700"}`}>
                  {round.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span className="break-words">{round.name}</span>
                </p>
                <p className="mt-2 break-words text-sm leading-6 text-slate-600">{round.detail}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <IssueCard title="缺失字段" items={formatMissingFields(verification?.missing_fields)} emptyText="没有缺失核心字段。" />
        <IssueCard title="待缴保费复核" items={formatFailedChecks(verification?.remaining_premium_checks)} emptyText="待缴保费计算通过。" />
        <IssueCard title="受益人复核" items={formatFailedChecks(verification?.beneficiary_checks)} emptyText="受益人信息核验通过。" />
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 break-words text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ProcessStep({ done, title, description }: { done: boolean; title: string; description: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-4">
      <p className={`flex items-center gap-2 font-semibold ${done ? "text-emerald-700" : "text-slate-500"}`}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function IssueCard({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-emerald-700">{emptyText}</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {items.map((item, index) => (
            <p key={`${item}-${index}`} className="break-words rounded-md bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-700">
              {item}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ state, label }: { state: "success" | "danger" | "warning" | "muted"; label: string }) {
  const className = {
    success: "bg-emerald-50 text-emerald-700",
    danger: "bg-amber-50 text-amber-700",
    warning: "bg-amber-50 text-amber-700",
    muted: "bg-slate-100 text-slate-500"
  }[state];
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function parseSummary(summary: Json): ParsedSummary {
  if (!isPlainObject(summary)) {
    return {};
  }
  return summary as ParsedSummary;
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isReportConfirmed(summary: Json) {
  return parseSummary(summary).review_status === "confirmed";
}

function getAttachments(summary: Json): AttachmentMeta[] {
  if (!isPlainObject(summary) || !Array.isArray(summary.attachments)) return [];
  return summary.attachments.filter(isAttachmentMeta);
}

function getSourceAttachment(summary: Json) {
  if (!isPlainObject(summary)) return null;
  const reportFileId = typeof summary.report_file_id === "string" ? summary.report_file_id : "";
  const originalFilename = typeof summary.original_filename === "string" ? summary.original_filename : "";
  if (!reportFileId && !originalFilename) return null;
  return {
    id: reportFileId || "source-file",
    name: originalFilename || "原始上传文件"
  };
}

function isSourceAttachmentHidden(summary: Json) {
  return isPlainObject(summary) && summary.hide_source_attachment === true;
}

function formatStorageUploadError(message: string) {
  if (/mime type application\/pdf is not supported/i.test(message)) {
    return "当前 Supabase 的 report-assets bucket 还未允许 PDF 附件。请先执行 outputs/sql_steps/10_allow_pdf_report_assets.sql 后再上传。";
  }
  return message;
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

function readPolicyCount(reportJson: Json | undefined) {
  if (!isPlainObject(reportJson) || !Array.isArray(reportJson.policies)) {
    return 0;
  }
  return reportJson.policies.length;
}

function formatMissingFields(value: Json | undefined) {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map((item, index) => {
    const policy = text(item.policy) || `保单 ${index + 1}`;
    const fields = Array.isArray(item.fields) ? item.fields.map(text).filter(Boolean).join("、") : "未知字段";
    return `${policy}：缺失 ${fields}`;
  });
}

function formatFailedChecks(value: Json | undefined) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPlainObject)
    .filter((item) => item.passed !== true)
    .map((item, index) => {
      const policy = text(item.policy) || `保单 ${index + 1}`;
      const expected = typeof item.expected === "number" ? `，应为 ${formatMoney(item.expected)}` : "";
      const actual = typeof item.actual === "number" ? `，当前 ${formatMoney(item.actual)}` : "";
      return `${policy}${expected}${actual}`;
    });
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatMoney(value?: number | null) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2
  }).format(value ?? 0);
}

function formatSize(size: number | null) {
  if (!size) return "未知大小";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function statusText(status: Report["status"]) {
  return {
    draft: "草稿",
    published: "已发布",
    archived: "已归档"
  }[status];
}

function parseStatusText(summary: ParsedSummary) {
  if (summary.parse_status === "completed") return "已解析";
  if (summary.parse_status === "failed") return `解析失败${summary.parse_error ? `：${summary.parse_error}` : ""}`;
  return "待解析";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
