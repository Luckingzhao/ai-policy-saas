"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheckBig, FileBarChart, Loader2, RefreshCw } from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";

type Report = Pick<Database["public"]["Tables"]["h5_reports"]["Row"], "id" | "customer_id" | "title" | "summary" | "created_at">;
type Customer = Pick<Database["public"]["Tables"]["customers"]["Row"], "id" | "name">;

export function PolicyBuilderReports() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [reports, setReports] = useState<Report[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState("");
  const [message, setMessage] = useState("");

  async function loadReports() {
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
        .select("id,customer_id,title,summary,created_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("customers").select("id,name").eq("user_id", userData.user.id)
    ]);
    if (reportsResult.error) setMessage(reportsResult.error.message);
    setReports((reportsResult.data ?? []).filter((report) => readSummary(report.summary).module === "policy_builder"));
    setCustomers(customersResult.data ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateReport(report: Report) {
    const summary = readSummary(report.summary);
    if (summary.parse_status === "completed") return;
    setGeneratingId(report.id);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setMessage("登录状态已失效，请重新登录。");
      setGeneratingId("");
      return;
    }
    try {
      const response = await fetch(`/api/reports/${report.id}/parse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "产品资料解析失败。");
      window.location.href = `/policy-builder/reports/${report.id}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评测报告生成失败，请稍后重试。");
      setGeneratingId("");
      await loadReports();
    }
  }

  const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));

  return (
    <section id="generated-reports" className="scroll-mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand">第二步</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">生成或查看产品评测报告</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">已上传的产品资料会保留在这里，可以重新解析、继续生成或打开已完成报告。</p>
        </div>
        <button type="button" onClick={loadReports} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" />刷新
        </button>
      </div>

      {message ? <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</p> : null}
      {isLoading ? <p className="mt-5 text-sm text-slate-500">正在读取方案资料...</p> : null}
      {!isLoading && reports.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
          <FileBarChart className="mx-auto h-7 w-7 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-ink">还没有产品方案</p>
          <p className="mt-1 text-sm text-slate-500">请先在上方选择客户并上传产品资料。</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        {reports.map((report) => {
          const summary = readSummary(report.summary);
          const completed = summary.parse_status === "completed";
          const failed = summary.parse_status === "failed";
          return (
            <article key={report.id} className="rounded-lg border border-slate-200 p-4 transition-colors hover:border-slate-300 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${completed ? "bg-green-50 text-green-700" : failed ? "bg-amber-50 text-amber-700" : "bg-red-50 text-brand"}`}>
                    {completed ? <CircleCheckBig className="h-5 w-5" /> : <FileBarChart className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-ink">{report.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">绑定客户：{customerMap.get(report.customer_id ?? "") ?? "未知客户"} · {formatDate(report.created_at)}</p>
                    <p className={`mt-2 text-sm font-semibold ${completed ? "text-green-700" : failed ? "text-amber-700" : "text-slate-500"}`}>
                      {completed ? "产品资料已解析，可生成并查看报告" : failed ? `解析失败：${summary.parse_error || "请重新生成"}` : "产品资料已上传，等待生成报告"}
                    </p>
                  </div>
                </div>
                {completed ? (
                  <Link href={`/policy-builder/reports/${report.id}`} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 lg:w-auto">
                    打开产品评测报告<ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button type="button" onClick={() => generateReport(report)} disabled={generatingId === report.id} className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto">
                    {generatingId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
                    {generatingId === report.id ? "正在生成..." : "解析并生成评测报告"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function readSummary(summary: Json) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return {} as Record<string, Json>;
  return summary as Record<string, Json>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
