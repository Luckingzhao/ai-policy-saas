"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Loader2, RefreshCw, RotateCcw } from "lucide-react";
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

  const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={loadArchivedReports}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-sm font-semibold text-slate-600"
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </button>
      </div>

      {message ? <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">{message}</p> : null}
      {isLoading ? <p className="rounded-lg bg-white p-6 text-sm text-slate-500">正在加载归档报告...</p> : null}
      {!isLoading && reports.length === 0 ? (
        <EmptyState title="暂无归档报告" description="归档后的报告会集中显示在这里，不再出现在报告管理页面。" />
      ) : null}

      <div className="grid gap-3">
        {reports.map((report) => (
          <article key={report.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
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
              <button
                type="button"
                onClick={() => restoreReport(report.id)}
                disabled={restoringId === report.id}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {restoringId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                恢复到报告管理
              </button>
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
