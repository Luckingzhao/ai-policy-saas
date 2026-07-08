"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Archive,
  Bot,
  ChevronDown,
  CheckSquare,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Loader2,
  PencilLine,
  RefreshCw,
  Square,
  Trash2
} from "lucide-react";
import { EmptyState } from "@/components/ui";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";

type Report = Pick<
  Database["public"]["Tables"]["h5_reports"]["Row"],
  "id" | "customer_id" | "slug" | "title" | "status" | "summary" | "created_at" | "published_at"
>;
type Customer = Pick<Database["public"]["Tables"]["customers"]["Row"], "id" | "name" | "phone">;

export function ReportsClient() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [reports, setReports] = useState<Report[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [status, setStatus] = useState<"all" | "draft" | "published" | "archived">("all");
  const [message, setMessage] = useState("");
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<string[]>([]);
  const [openExportId, setOpenExportId] = useState<string | null>(null);
  const [floatingTip, setFloatingTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadReports() {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setIsLoading(false);
      return;
    }

    const [reportsResult, customersResult] = await Promise.all([
      supabase
        .from("h5_reports")
        .select("id,customer_id,slug,title,status,summary,created_at,published_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false }),
      supabase.from("customers").select("id,name,phone").eq("user_id", userData.user.id)
    ]);

    if (reportsResult.error) {
      setMessage(reportsResult.error.message);
    } else {
      setReports(reportsResult.data ?? []);
      setSelectedArchivedIds((current) =>
        current.filter((id) => reportsResult.data?.some((report) => report.id === id && report.status === "archived"))
      );
    }

    if (customersResult.error) {
      setMessage(customersResult.error.message);
    } else {
      setCustomers(customersResult.data ?? []);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!floatingTip) return;

    const timer = window.setTimeout(() => setFloatingTip(null), 1600);
    return () => window.clearTimeout(timer);
  }, [floatingTip]);

  async function startParse(reportId: string) {
    setMessage("");
    setParsingId(reportId);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("请先登录后再解析。");
      setParsingId(null);
      return;
    }

    const response = await fetch(`/api/reports/${reportId}/parse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const result = (await response.json()) as { error?: string };
    setParsingId(null);

    if (!response.ok) {
      setMessage(result.error || "解析失败。");
      await loadReports();
      return;
    }

    setMessage("解析完成，已保存保单、受益人和保障责任。");
    await loadReports();
  }

  async function updateReportStatus(reportId: string, nextStatus: Report["status"]) {
    setMessage("");
    setStatusUpdatingId(reportId);

    const { error } = await supabase
      .from("h5_reports")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", reportId);

    setStatusUpdatingId(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(nextStatus === "archived" ? "报告已归档，可在“归档报告”中查看或恢复。" : "报告已恢复到报告管理。");
    await loadReports();
  }

  function toggleArchivedSelected(reportId: string) {
    setSelectedArchivedIds((current) =>
      current.includes(reportId) ? current.filter((id) => id !== reportId) : [...current, reportId]
    );
  }

  function toggleSelectAllArchived() {
    const archivedIds = filteredReports.filter((report) => report.status === "archived").map((report) => report.id);
    if (archivedIds.length > 0 && selectedArchivedIds.length === archivedIds.length) {
      setSelectedArchivedIds([]);
      return;
    }

    setSelectedArchivedIds(archivedIds);
  }

  async function deleteArchivedReports(reportIds: string[]) {
    const ids = [...new Set(reportIds)].filter(Boolean);
    if (ids.length === 0) return;

    const confirmMessage =
      ids.length === 1
        ? "确认删除这份归档报告吗？删除后不可恢复。"
        : `确认删除已选中的 ${ids.length} 份归档报告吗？删除后不可恢复。`;

    if (!window.confirm(confirmMessage)) return;

    setMessage("");
    setDeletingIds(ids);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setMessage("请先登录后再删除归档报告。");
      setDeletingIds([]);
      return;
    }

    const { error } = await supabase
      .from("h5_reports")
      .delete()
      .eq("user_id", userData.user.id)
      .eq("status", "archived")
      .in("id", ids);

    setDeletingIds([]);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSelectedArchivedIds((current) => current.filter((id) => !ids.includes(id)));
    setMessage(ids.length === 1 ? "归档报告已删除。" : `已删除 ${ids.length} 份归档报告。`);
    await loadReports();
  }

  function showPendingExportTip(event: React.MouseEvent<HTMLButtonElement>) {
    setOpenExportId(null);
    setFloatingTip({
      x: event.clientX,
      y: event.clientY,
      text: "该功能待开发中"
    });
  }

  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const activeReports = reports.filter((report) => report.status !== "archived");
  const filteredReports = status === "all" ? activeReports : reports.filter((report) => report.status === status);
  const archivedIds = filteredReports.filter((report) => report.status === "archived").map((report) => report.id);
  const allArchivedSelected = archivedIds.length > 0 && selectedArchivedIds.length === archivedIds.length;
  const hasArchivedSelection = selectedArchivedIds.length > 0;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <FilterButton active={status === "all"} onClick={() => setStatus("all")} label="全部" />
          <FilterButton active={status === "draft"} onClick={() => setStatus("draft")} label="草稿" />
          <FilterButton active={status === "published"} onClick={() => setStatus("published")} label="已发布" />
          <FilterButton active={status === "archived"} onClick={() => setStatus("archived")} label="归档报告" />
        </div>
        <button
          onClick={loadReports}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-sm font-semibold text-slate-600"
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </button>
      </div>

      {status === "archived" ? (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">归档报告清理</p>
            <p className="mt-1 text-sm text-slate-500">归档报告可恢复到报告管理，也可以删除历史归档记录。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAllArchived}
              disabled={archivedIds.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allArchivedSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allArchivedSelected ? "取消全选" : "全选"}
            </button>
            <button
              type="button"
              onClick={() => deleteArchivedReports(selectedArchivedIds)}
              disabled={!hasArchivedSelection || deletingIds.length > 0}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-coral px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletingIds.length > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              删除已选
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="mb-4 rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">{message}</p> : null}
      {isLoading ? <p className="rounded-lg bg-white p-6 text-sm text-slate-500">正在加载报告...</p> : null}

      {!isLoading && filteredReports.length === 0 ? (
        <EmptyState title="还没有报告" description="到上传页面选择客户并上传 PDF 或 Excel，系统会自动生成一条报告草稿。" />
      ) : null}

      <div className="grid gap-3">
        {filteredReports.map((report) => {
          const customer = customerMap.get(report.customer_id ?? "");
          return (
            <article
              key={report.id}
              className={`rounded-lg border bg-white p-5 shadow-sm transition ${
                selectedArchivedIds.includes(report.id) ? "border-coral/60 ring-2 ring-coral/10" : "border-slate-200"
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  {report.status === "archived" ? (
                    <button
                      type="button"
                      onClick={() => toggleArchivedSelected(report.id)}
                      className="mt-2 text-slate-400 hover:text-coral"
                      aria-label={selectedArchivedIds.includes(report.id) ? "取消选择报告" : "选择报告"}
                    >
                      {selectedArchivedIds.includes(report.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                    </button>
                  ) : null}
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-red-50 text-brand">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{report.title}</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      {customer?.name ?? "未知客户"} · {statusText(report.status)} · {formatDate(report.created_at)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <ParseState summary={report.summary} />
                      <QualityState summary={report.summary} />
                      <ConfirmState summary={report.summary} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => startParse(report.id)}
                    disabled={parsingId === report.id}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {parsingId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                    开始解析
                  </button>
                  <Link
                    href={`/reports/review/${report.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink"
                  >
                    <PencilLine className="h-4 w-4" />
                    修改保单
                  </Link>
                  <Link
                    href={`/reports/detail/${report.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    {isReportConfirmed(report.summary) ? "已确认" : "待人工确认"}
                  </Link>
                  <Link
                    href={`/reports/detail/${report.id}#attachments`}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink"
                  >
                    <FileText className="h-4 w-4" />
                    附件
                  </Link>
                  {report.status === "archived" ? (
                    <button
                      type="button"
                      onClick={() => updateReportStatus(report.id, "draft")}
                      disabled={statusUpdatingId === report.id}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {statusUpdatingId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      恢复
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateReportStatus(report.id, "archived")}
                      disabled={statusUpdatingId === report.id}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {statusUpdatingId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                      归档
                    </button>
                  )}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenExportId((current) => (current === report.id ? null : report.id))}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink"
                    >
                      <Download className="h-4 w-4" />
                      导出
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    {openExportId === report.id ? (
                      <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                        <Link
                          href={report.status === "published" ? `/reports/${report.slug}` : `/reports/preview/${report.id}`}
                          onClick={() => setOpenExportId(null)}
                          className="block px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-ink"
                        >
                          H5格式
                        </Link>
                        {["PDF格式", "MD格式", "Word格式", "Excel格式"].map((format) => (
                          <button
                            key={format}
                            type="button"
                            onClick={showPendingExportTip}
                            className="block w-full px-4 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-ink"
                          >
                            {format}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <Verification summary={report.summary} />
            </article>
          );
        })}
      </div>
      {floatingTip ? (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white shadow-lg"
          style={{ left: floatingTip.x, top: floatingTip.y + 12 }}
        >
          {floatingTip.text}
        </div>
      ) : null}
    </div>
  );
}

function ParseState({ summary }: { summary: Json }) {
  const parsed = parseSummary(summary);
  if (isExcelReport(summary) && parsed.parse_status !== "completed" && parsed.parse_status !== "failed") {
    return <p className="text-xs font-medium text-slate-500">Excel已上传，待解析</p>;
  }

  if (parsed.parse_status === "completed") {
    return (
      <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已解析
      </p>
    );
  }
  if (parsed.parse_status === "failed") {
    return (
      <p className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
        <AlertCircle className="h-3.5 w-3.5" />
        解析失败：{parsed.parse_error || "请重试"}
      </p>
    );
  }
  return <p className="text-xs text-slate-400">待解析</p>;
}

function ConfirmState({ summary }: { summary: Json }) {
  const parsed = parseSummary(summary);
  if (parsed.review_status === "confirmed") {
    return (
      <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已确认
      </p>
    );
  }
  if (parsed.review_status === "reviewed") {
    return (
      <>
        <p className="text-xs font-medium text-slate-500">已核对</p>
        <p className="text-xs font-medium text-amber-700">待人工确认</p>
      </>
    );
  }
  if (parsed.parse_status === "completed") {
    return <p className="text-xs font-medium text-amber-700">待人工确认</p>;
  }
  return null;
}

function QualityState({ summary }: { summary: Json }) {
  const verification = parseSummary(summary).verification;
  if (!verification) return null;
  const rounds = verification.verification_rounds ?? [];
  const passed = verification.quality_status === "passed" || (rounds.length > 0 && rounds.every((round) => round.passed));
  return <p className={`text-xs font-medium ${passed ? "text-emerald-700" : "text-amber-700"}`}>{passed ? "核验通过" : "需复核"}</p>;
}

function Verification({ summary }: { summary: Json }) {
  const verification = parseSummary(summary).verification;
  if (!verification) return null;

  return (
    <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <span>总保单数：{verification.total_policy_count ?? 0}</span>
        <span>年缴总保费：{formatMoney(verification.annual_premium_total)}</span>
        <span>待缴总保费：{formatMoney(verification.remaining_premium_total)}</span>
        <span>重复保单：{verification.has_duplicate_policies ? "有" : "无"}</span>
        <span>缺失字段：{verification.has_missing_fields ? "有" : "无"}</span>
        <span>入库保单：{verification.inserted_policy_count ?? 0}</span>
      </div>
      {verification.verification_rounds && verification.verification_rounds.length > 0 ? (
        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3">
          {verification.verification_rounds.map((round) => (
            <p key={round.name} className={round.passed ? "text-emerald-700" : "text-amber-700"}>
              {round.name}：{round.passed ? "通过" : "需复核"}，{round.detail}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function parseSummary(summary: Json) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return {};
  }
  return summary as {
    parse_status?: string;
    parse_error?: string;
    review_status?: string;
    confirmed_at?: string;
    source_file_type?: string;
    source_mime_type?: string;
    original_filename?: string;
    verification?: {
      quality_status?: "passed" | "review_required";
      total_policy_count?: number;
      inserted_policy_count?: number;
      annual_premium_total?: number;
      remaining_premium_total?: number;
      has_duplicate_policies?: boolean;
      has_missing_fields?: boolean;
      verification_rounds?: Array<{
        name: string;
        passed: boolean;
        detail: string;
      }>;
    };
  };
}

function isReportConfirmed(summary: Json) {
  return parseSummary(summary).review_status === "confirmed";
}

function isExcelReport(summary: Json) {
  const parsed = parseSummary(summary);
  const filename = parsed.original_filename?.toLowerCase() ?? "";
  return (
    parsed.source_file_type === "excel" ||
    filename.endsWith(".xlsx") ||
    filename.endsWith(".xls") ||
    parsed.source_mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    parsed.source_mime_type === "application/vnd.ms-excel"
  );
}

function formatMoney(value?: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2
  }).format(value ?? 0);
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-semibold ${
        active ? "bg-ink text-white" : "bg-white text-slate-600 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function statusText(status: Report["status"]) {
  return {
    draft: "草稿",
    published: "已发布",
    archived: "已归档"
  }[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}
