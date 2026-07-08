"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, CheckSquare, Loader2, RefreshCw, RotateCcw, Square, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type Report = Pick<
  Database["public"]["Tables"]["h5_reports"]["Row"],
  "id" | "customer_id" | "title" | "status" | "created_at"
>;
type Customer = Pick<Database["public"]["Tables"]["customers"]["Row"], "id" | "name">;

export function ArchiveClient() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [reports, setReports] = useState<Report[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [message, setMessage] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadArchivedReports() {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setIsLoading(false);
      return;
    }

    const [reportsResult, customersResult] = await Promise.all([
      supabase
        .from("h5_reports")
        .select("id,customer_id,title,status,created_at")
        .eq("user_id", userData.user.id)
        .eq("status", "archived")
        .order("updated_at", { ascending: false }),
      supabase.from("customers").select("id,name").eq("user_id", userData.user.id)
    ]);

    if (reportsResult.error) {
      setMessage(reportsResult.error.message);
    } else {
      setReports(reportsResult.data ?? []);
      setSelectedIds((current) => current.filter((id) => reportsResult.data?.some((report) => report.id === id)));
    }

    if (!customersResult.error) {
      setCustomers(customersResult.data ?? []);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadArchivedReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restoreReport(reportId: string) {
    setMessage("");
    setRestoringId(reportId);
    const { error } = await supabase
      .from("h5_reports")
      .update({
        status: "draft",
        updated_at: new Date().toISOString()
      })
      .eq("id", reportId);

    setRestoringId(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("报告已恢复为草稿，可到“报告管理”页面继续查看并操作。");
    await loadArchivedReports();
  }

  function toggleSelected(reportId: string) {
    setSelectedIds((current) => (current.includes(reportId) ? current.filter((id) => id !== reportId) : [...current, reportId]));
  }

  function toggleSelectAll() {
    if (selectedIds.length === reports.length) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(reports.map((report) => report.id));
  }

  async function deleteReports(reportIds: string[]) {
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

    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    setMessage(ids.length === 1 ? "归档报告已删除。" : `已删除 ${ids.length} 份归档报告。`);
    await loadArchivedReports();
  }

  const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));
  const allSelected = reports.length > 0 && selectedIds.length === reports.length;
  const hasSelection = selectedIds.length > 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">归档报告清理</p>
          <p className="mt-1 text-sm text-slate-500">归档报告不再显示在报告管理中，可恢复，也可删除历史归档记录。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleSelectAll}
            disabled={reports.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {allSelected ? "取消全选" : "全选"}
          </button>
          <button
            type="button"
            onClick={() => deleteReports(selectedIds)}
            disabled={!hasSelection || deletingIds.length > 0}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-coral px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deletingIds.length > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            删除已选
          </button>
          <button
            type="button"
            onClick={loadArchivedReports}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-ink"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>共 {reports.length} 份归档报告</span>
        {hasSelection ? <span>已选择 {selectedIds.length} 份</span> : null}
      </div>

      {message ? <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">{message}</p> : null}
      {isLoading ? <p className="rounded-lg bg-white p-6 text-sm text-slate-500">正在加载归档报告...</p> : null}
      {!isLoading && reports.length === 0 ? (
        <EmptyState title="暂无归档报告" description="归档后的报告会集中显示在这里，不再出现在报告管理页面。" />
      ) : null}

      <div className="grid gap-3">
        {reports.map((report) => (
          <article
            key={report.id}
            className={`rounded-lg border bg-white p-5 shadow-sm transition ${
              selectedIds.includes(report.id) ? "border-coral/60 ring-2 ring-coral/10" : "border-slate-200"
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleSelected(report.id)}
                  className="mt-2 text-slate-400 hover:text-coral"
                  aria-label={selectedIds.includes(report.id) ? "取消选择报告" : "选择报告"}
                >
                  {selectedIds.includes(report.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                </button>
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  <Archive className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{report.title}</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    {customerMap.get(report.customer_id ?? "") ?? "未知客户"} · 已归档 · {formatDate(report.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => restoreReport(report.id)}
                  disabled={restoringId === report.id || deletingIds.includes(report.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {restoringId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  恢复到报告管理
                </button>
                <button
                  type="button"
                  onClick={() => deleteReports([report.id])}
                  disabled={deletingIds.includes(report.id) || restoringId === report.id}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-coral px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingIds.includes(report.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  删除
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}
