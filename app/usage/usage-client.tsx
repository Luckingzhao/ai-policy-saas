"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, FileText, KeyRound, Loader2, UploadCloud } from "lucide-react";
import { StatCard } from "@/components/ui";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { getMonthRange, getPlanLabel, getPlanLimit } from "@/lib/usage";

type Subscription = Pick<
  Database["public"]["Tables"]["subscriptions"]["Row"],
  "id" | "plan_code" | "monthly_report_limit" | "monthly_upload_limit"
>;
type UsageLog = Pick<Database["public"]["Tables"]["usage_logs"]["Row"], "action" | "quantity" | "created_at">;

export function UsageClient() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [activationCode, setActivationCode] = useState("");
  const [isActivating, setIsActivating] = useState(false);

  const loadUsage = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setIsLoading(false);
      return;
    }

    const monthRange = getMonthRange();
    const [subscriptionResult, usageResult] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("id,plan_code,monthly_report_limit,monthly_upload_limit")
        .eq("user_id", userData.user.id)
        .maybeSingle(),
      supabase
        .from("usage_logs")
        .select("action,quantity,created_at")
        .eq("user_id", userData.user.id)
        .gte("created_at", monthRange.start)
        .lt("created_at", monthRange.end)
        .order("created_at", { ascending: false })
    ]);

    if (subscriptionResult.error) {
      setMessage(subscriptionResult.error.message);
    } else {
      setSubscription(subscriptionResult.data ?? null);
    }

    if (usageResult.error) {
      setMessage(usageResult.error.message);
    } else {
      setLogs(usageResult.data ?? []);
    }

    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  async function handleActivateCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = activationCode.trim();
    setMessage("");

    if (!code) {
      setMessage("请输入注册码。");
      return;
    }

    if (!isSupabaseConfigured) {
      setMessage("请先配置 Supabase 环境变量。");
      return;
    }

    setIsActivating(true);
    const { data, error } = await supabase.rpc("activate_subscription_code", { p_code: code });
    setIsActivating(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const result = isPlainObject(data) ? data : {};
    const planLabel = typeof result.plan_label === "string" ? result.plan_label : "新套餐";
    const limit = typeof result.monthly_report_limit === "number" ? result.monthly_report_limit : null;
    setActivationCode("");
    setMessage(`激活成功，当前套餐已升级为${planLabel}${limit ? `，每月可生成 ${limit} 份报告` : ""}。`);
    await loadUsage();
  }

  const reportLimit = getPlanLimit(subscription?.plan_code, subscription?.monthly_report_limit);
  const generatedReports = sumLogs(logs, "generate_h5_report");
  const uploadedFiles = sumLogs(logs, "upload_policy_pdf") + sumLogs(logs, "upload_policy_excel");
  const parsedReports = sumLogs(logs, "parse_policy_pdf") + sumLogs(logs, "parse_policy_excel");
  const publishedReports = sumLogs(logs, "publish_h5_report");
  const usedPercent = reportLimit > 0 ? Math.min(100, Math.round((generatedReports / reportLimit) * 100)) : 0;
  const remainingReports = Math.max(reportLimit - generatedReports, 0);

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 md:grid-cols-4">
        <StatCard label="当前套餐" value={getPlanLabel(subscription?.plan_code)} icon={BarChart3} />
        <StatCard label="本月已生成" value={`${generatedReports} 份`} icon={FileText} />
        <StatCard label="剩余额度" value={`${remainingReports} 份`} icon={CheckCircle2} />
        <StatCard label="上传文件" value={`${uploadedFiles} 次`} icon={UploadCloud} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-50 text-brand">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">注册码激活套餐</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              输入购买后获得的注册码，可升级为智惠版或智优版。
            </p>
          </div>
        </div>
        <form onSubmit={handleActivateCode} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={activationCode}
            onChange={(event) => setActivationCode(event.target.value)}
            className="min-h-11 flex-1 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-wide outline-none transition focus:border-brand"
            placeholder="请输入注册码"
          />
          <button
            type="submit"
            disabled={isActivating}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isActivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            激活套餐
          </button>
        </form>
        {message ? <p className="mt-4 rounded-md bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">{message}</p> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">报告额度</h2>
            <p className="mt-1 text-sm text-slate-500">
              本月 {generatedReports}/{reportLimit} 份，剩余 {remainingReports} 份
            </p>
          </div>
          <span className="text-sm font-semibold text-brand">{usedPercent}%</span>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-brand transition-all" style={{ width: `${usedPercent}%` }} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">本月使用明细</h2>
        {isLoading ? <p className="mt-4 text-sm text-slate-500">正在加载...</p> : null}
        {!isLoading && logs.length === 0 ? <p className="mt-4 text-sm text-slate-500">本月暂无使用记录。</p> : null}
        {!isLoading && logs.length > 0 ? (
          <div className="mt-5 grid gap-3">
            <UsageRow label="上传文件" value={`${uploadedFiles} 次`} />
            <UsageRow label="生成报告草稿" value={`${generatedReports} 次`} />
            <UsageRow label="AI 解析" value={`${parsedReports} 次`} />
            <UsageRow label="发布 H5" value={`${publishedReports} 次`} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

function sumLogs(logs: UsageLog[], action: UsageLog["action"]) {
  return logs.filter((log) => log.action === action).reduce((total, log) => total + log.quantity, 0);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
