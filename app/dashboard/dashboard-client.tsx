"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  ShieldCheck,
  UploadCloud,
  Users
} from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getPlanLabel } from "@/lib/usage";

type Report = Pick<
  Database["public"]["Tables"]["h5_reports"]["Row"],
  "id" | "customer_id" | "title" | "status" | "summary" | "created_at"
>;
type Customer = Pick<Database["public"]["Tables"]["customers"]["Row"], "id" | "name">;
type Subscription = Pick<Database["public"]["Tables"]["subscriptions"]["Row"], "plan_code">;

type DashboardStats = {
  customers: number;
  policies: number;
  reports: number;
  uploadedFiles: number;
  pendingReports: number;
  publishedReports: number;
};

const initialStats: DashboardStats = {
  customers: 0,
  policies: 0,
  reports: 0,
  uploadedFiles: 0,
  pendingReports: 0,
  publishedReports: 0
};

export function DashboardClient() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [reports, setReports] = useState<Report[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [advisorName, setAdvisorName] = useState("保险顾问");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setIsLoading(false);
        return;
      }

      const userId = userData.user.id;
      const [profileResult, subscriptionResult, customersCount, policiesCount, reportsCount, filesCount, pendingCount, publishedCount, reportsResult, customersResult] =
        await Promise.all([
          supabase.from("profiles").select("full_name,brand_name,company_name").eq("user_id", userId).maybeSingle(),
          supabase.from("subscriptions").select("plan_code").eq("user_id", userId).maybeSingle(),
          supabase.from("customers").select("id", { count: "exact", head: true }).eq("user_id", userId),
          supabase.from("policies").select("id", { count: "exact", head: true }).eq("user_id", userId),
          supabase.from("h5_reports").select("id", { count: "exact", head: true }).eq("user_id", userId),
          supabase.from("report_files").select("id", { count: "exact", head: true }).eq("user_id", userId),
          supabase.from("h5_reports").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "draft"),
          supabase.from("h5_reports").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "published"),
          supabase
            .from("h5_reports")
            .select("id,customer_id,title,status,summary,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(4),
          supabase.from("customers").select("id,name").eq("user_id", userId)
        ]);

      const profile = profileResult.data;
      setAdvisorName(profile?.full_name || profile?.brand_name || profile?.company_name || userData.user.email || "保险顾问");
      setSubscription(subscriptionResult.data ?? null);
      setStats({
        customers: customersCount.count ?? 0,
        policies: policiesCount.count ?? 0,
        reports: reportsCount.count ?? 0,
        uploadedFiles: filesCount.count ?? 0,
        pendingReports: pendingCount.count ?? 0,
        publishedReports: publishedCount.count ?? 0
      });
      setReports(reportsResult.data ?? []);
      setCustomers(customersResult.data ?? []);
      setIsLoading(false);
    }

    loadDashboard();
  }, [supabase]);

  const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));

  return (
    <div className="grid gap-6">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.25fr_0.75fr] lg:p-7">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-brand">
              <ShieldCheck className="h-4 w-4" />
              <span>AI 家庭保障顾问平台</span>
              <span className="rounded bg-white px-2 py-0.5 text-xs text-brand shadow-sm">{getPlanLabel(subscription?.plan_code)}</span>
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-ink sm:text-3xl">早上好，{advisorName}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              今天可以从客户资料、保单上传、报告核对三个环节推进服务，让客户更快看懂自己的家庭保障。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <PrimaryAction href="/upload" label="上传保单" icon={UploadCloud} />
              <SecondaryAction href="/reports" label="查看报告" />
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-500">当前进度</p>
            <div className="mt-5 grid gap-4">
              <ProgressItem label="待处理报告" value={`${stats.pendingReports} 份`} />
              <ProgressItem label="已发布报告" value={`${stats.publishedReports} 份`} />
              <ProgressItem label="已上传资料" value={`${stats.uploadedFiles} 份`} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="客户数量" value={stats.customers} icon={Users} helper="已建立客户档案" loading={isLoading} />
        <MetricCard label="统计报单" value={stats.policies} icon={BarChart3} helper="已入库保单明细" loading={isLoading} />
        <MetricCard label="保障报告" value={stats.reports} icon={FileText} helper="已生成报告记录" loading={isLoading} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">快捷操作</h2>
              <p className="mt-1 text-sm text-slate-500">按日常服务流程继续推进</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            <WorkflowAction href="/customers" title="1. 创建客户档案" description="录入客户基础信息，作为保单和报告归属。" icon={Users} />
            <WorkflowAction href="/upload" title="2. 上传保单资料" description="支持 PDF、Excel、Word 文件，上传后生成报告草稿。" icon={UploadCloud} />
            <WorkflowAction href="/reports" title="3. 核对并发布报告" description="完成 AI 解析核对后，导出 H5 分享给客户。" icon={FileCheck2} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">最近报告</h2>
              <p className="mt-1 text-sm text-slate-500">优先处理待核对和草稿报告</p>
            </div>
            <Link href="/reports" className="text-sm font-semibold text-brand">
              全部报告
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {isLoading ? <p className="rounded-md bg-slate-50 px-4 py-5 text-sm text-slate-500">正在加载报告...</p> : null}
            {!isLoading && reports.length === 0 ? (
              <div className="rounded-md bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-ink">还没有报告</p>
                <p className="mt-2 text-sm text-slate-500">上传第一份客户资料后，这里会显示最近报告。</p>
              </div>
            ) : null}
            {reports.map((report) => (
              <Link
                key={report.id}
                href={`/reports/detail/${report.id}`}
                className="flex items-center justify-between gap-4 rounded-md border border-slate-100 px-4 py-3 transition hover:border-brand hover:bg-red-50/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{report.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {customerMap.get(report.customer_id ?? "") ?? "未知客户"} · {reportStatusText(report.status)} · {formatDate(report.created_at)}
                  </p>
                </div>
                <ReportBadge summary={report.summary} status={report.status} />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  helper,
  loading
}: {
  label: string;
  value: number;
  icon: typeof Users;
  helper: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-4 text-3xl font-semibold text-ink">{loading ? "-" : value}</p>
          <p className="mt-2 text-xs text-slate-500">{helper}</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-brand">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function PrimaryAction({ href, label, icon: Icon }: { href: string; label: string; icon: typeof UploadCloud }) {
  return (
    <Link href={href} className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white shadow-sm">
      <Icon className="h-4 w-4" />
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function SecondaryAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function WorkflowAction({
  href,
  title,
  description,
  icon: Icon
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof Users;
}) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50 px-4 py-4 transition hover:border-brand hover:bg-white">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-brand">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-slate-500">{description}</span>
      </span>
    </Link>
  );
}

function ProgressItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-white px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

function ReportBadge({ summary, status }: { summary: Json; status: Report["status"] }) {
  const parsed = parseSummary(summary);
  if (parsed.review_status === "confirmed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-brand">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已确认
      </span>
    );
  }

  if (parsed.parse_status === "completed") {
    return <span className="shrink-0 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">待核对</span>;
  }

  if (status === "published") {
    return <span className="shrink-0 rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-brand">已发布</span>;
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
      <Clock3 className="h-3.5 w-3.5" />
      草稿
    </span>
  );
}

function parseSummary(summary: Json) {
  if (!isPlainObject(summary)) return {};
  return summary as { parse_status?: string; review_status?: string };
}

function isPlainObject(value: Json): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function reportStatusText(status: Report["status"]) {
  if (status === "published") return "已发布";
  if (status === "archived") return "已归档";
  return "草稿";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}
