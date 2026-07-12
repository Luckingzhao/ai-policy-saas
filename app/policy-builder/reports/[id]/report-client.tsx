"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, BadgeCheck, Download, FileText, GitCompareArrows, Loader2, RefreshCw, ShieldCheck, TrendingUp, TriangleAlert, Users } from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

type StandardPolicy = {
  policy_holder?: string | null;
  insured?: string | null;
  insurer?: string | null;
  main_policy_name?: string | null;
  product_category?: string | null;
  product_info?: string | null;
  insurance_type?: string | null;
  coverage_amount?: number | string | null;
  annual_premium?: number | string | null;
  payment_period?: string | null;
  effective_date?: string | null;
  paid_years?: number | string | null;
  remaining_years?: number | string | null;
  remaining_premium?: number | string | null;
  policy_service?: string | null;
  payment_account?: string | null;
  core_benefits?: string | null;
  major_disease_benefit?: string | null;
  moderate_disease_benefit?: string | null;
  mild_disease_benefit?: string | null;
  death_benefit?: string | null;
  total_disability_benefit?: string | null;
  terminal_illness_benefit?: string | null;
  other_benefits?: string | null;
  premium_waiver?: string | null;
  exclusions?: string | null;
  cash_value_returns?: string | null;
  product_constraints?: string | null;
};

type ReportState = {
  title: string;
  customerName: string;
  generatedAt: string;
  policies: StandardPolicy[];
  talkingAnalysis: TalkingAnalysis | null;
};

type TalkingAnalysis = {
  advantages: Array<{ product_name: string | null; title: string; evidence: string; talking_point: string }>;
  weaknesses: Array<{ product_name: string | null; title: string; evidence: string; risk_level: string; talking_point: string }>;
  fit_and_comparison: {
    fit_customers: Array<{ profile: string; reason: string }>;
    unsuitable_customers: Array<{ profile: string; reason: string }>;
    comparison_advice: Array<{ scenario: string; recommendation: string; evidence: string }>;
    broker_script: string[];
  };
};

export function PolicyBuilderReportClient({ reportId }: { reportId: string }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [report, setReport] = useState<ReportState | null>(null);
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  const generateTalkingAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalysisError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setAnalysisError("登录状态已失效，请重新登录。");
      setIsAnalyzing(false);
      return;
    }
    try {
      const response = await fetch(`/api/policy-builder/reports/${reportId}/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const result = (await response.json()) as { analysis?: TalkingAnalysis; error?: string };
      if (!response.ok || !result.analysis) throw new Error(result.error || "谈单分析生成失败。");
      setReport((current) => (current ? { ...current, talkingAnalysis: result.analysis ?? null } : current));
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "谈单分析生成失败，请稍后重试。");
    } finally {
      setIsAnalyzing(false);
    }
  }, [reportId, supabase]);

  useEffect(() => {
    async function loadReport() {
      if (!isSupabaseConfigured) {
        setMessage("Supabase 尚未配置。");
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setMessage("请先登录后查看评测报告。");
        return;
      }
      const { data: reportData, error } = await supabase
        .from("h5_reports")
        .select("id,title,customer_id,summary,created_at")
        .eq("id", reportId)
        .eq("user_id", userData.user.id)
        .single();
      if (error || !reportData) {
        setMessage(error?.message || "评测报告不存在。");
        return;
      }
      const parsedPolicies = readPolicies(reportData.summary);
      if (parsedPolicies.length === 0) {
        const summary = isObject(reportData.summary) ? reportData.summary : null;
        const reportFileId = summary && typeof summary.report_file_id === "string" ? summary.report_file_id : "";
        if (!reportFileId) {
          setMessage("该评测报告没有绑定产品资料，请返回保单智成重新上传。");
          return;
        }

        setIsParsing(true);
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          setMessage("登录状态已失效，请重新登录。");
          setIsParsing(false);
          return;
        }
        try {
          const parseResponse = await fetch(`/api/reports/${reportId}/parse`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          const parseResult = (await parseResponse.json()) as { policy_count?: number; error?: string };
          if (!parseResponse.ok) throw new Error(parseResult.error || "方案资料解析失败。");
          if (!parseResult.policy_count) throw new Error("解析完成但未识别到产品，请检查文件内容或更换格式后重试。");
          window.location.reload();
          return;
        } catch (parseError) {
          setMessage(parseError instanceof Error ? parseError.message : "方案资料解析失败。");
          setIsParsing(false);
          return;
        }
      }
      const { data: customer } = reportData.customer_id
        ? await supabase.from("customers").select("name").eq("id", reportData.customer_id).eq("user_id", userData.user.id).maybeSingle()
        : { data: null };
      const talkingAnalysis = readTalkingAnalysis(reportData.summary);
      setReport({
        title: reportData.title,
        customerName: customer?.name || "未命名客户",
        generatedAt: reportData.created_at,
        policies: parsedPolicies,
        talkingAnalysis
      });
      if (!talkingAnalysis) void generateTalkingAnalysis();
    }
    loadReport();
  }, [generateTalkingAnalysis, reportId, supabase]);

  if (message) {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">{message}</p>;
  }
  if (!report || isParsing) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {isParsing ? "正在重新解析产品资料并生成报告..." : "正在生成产品评测报告..."}
      </div>
    );
  }

  const totalPremium = sum(report.policies.map((policy) => toNumber(policy.annual_premium)));
  const totalCoverage = sum(report.policies.map((policy) => toNumber(policy.coverage_amount)));

  return (
    <div className="grid gap-5">
      <style jsx global>{`
        @media print {
          aside, header, nav, .no-print { display: none !important; }
          .print-report header { display: block !important; }
          main { margin: 0 !important; padding: 0 !important; }
          body { background: white !important; }
          .print-report { box-shadow: none !important; border: 0 !important; }
          .print-break-avoid { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">报告已生成</p>
          <p className="mt-1 text-sm text-slate-500">请先核对方案数据，再导出 PDF 发给客户。</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/policy-builder" className="inline-flex items-center justify-center rounded-md border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">
            返回保单智成
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
          >
            <Download className="h-4 w-4" />
            导出 PDF
          </button>
        </div>
      </div>

      <article className="print-report overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="bg-ink px-5 py-8 text-white sm:px-8">
          <p className="text-sm font-semibold text-red-200">AI 保单智成 · 产品方案评测</p>
          <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{report.title}</h1>
          <p className="mt-3 text-sm text-slate-300">客户：{report.customerName} · 生成时间：{formatDate(report.generatedAt)}</p>
        </header>

        <div className="grid gap-6 p-5 sm:p-8">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric label="方案产品" value={`${report.policies.length} 份`} />
            <Metric label="合计保险金额" value={formatMoney(totalCoverage)} />
            <Metric label="合计期缴保费" value={formatMoney(totalPremium)} />
          </section>

          <section>
            <SectionTitle icon={BadgeCheck} title="产品评测报告" description="根据标准保单字段的完整度、保障结构与缴费信息生成。" />
            <div className="mt-4 grid gap-4">
              {report.policies.map((policy, index) => (
                <PolicyEvaluation key={`${policy.main_policy_name}-${index}`} policy={policy} index={index} />
              ))}
            </div>
          </section>

          <TalkingAnalysisSection
            analysis={report.talkingAnalysis}
            isLoading={isAnalyzing}
            error={analysisError}
            onRetry={generateTalkingAnalysis}
          />

          <section>
            <SectionTitle icon={GitCompareArrows} title="方案对比" description="横向核对保障额度、期缴保费、缴费期间和待缴金额。" />
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {['产品名称', '保障类型', '保险金额', '期缴保费', '缴费期间', '待缴保费'].map((label) => (
                      <th key={label} className="border-b border-slate-200 px-4 py-3 font-semibold">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.policies.map((policy, index) => (
                    <tr key={`${policy.main_policy_name}-compare-${index}`} className="border-b border-slate-100 last:border-0">
                      <td className="max-w-64 px-4 py-3 font-semibold text-ink">{text(policy.main_policy_name)}</td>
                      <td className="px-4 py-3">{text(policy.product_category ?? policy.insurance_type)}</td>
                      <td className="px-4 py-3">{formatMoney(toNumber(policy.coverage_amount))}</td>
                      <td className="px-4 py-3">{formatMoney(toNumber(policy.annual_premium))}</td>
                      <td className="px-4 py-3">{text(policy.payment_period)}</td>
                      <td className="px-4 py-3">{formatMoney(toNumber(policy.remaining_premium))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="print-break-avoid rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <h2 className="font-semibold text-amber-950">IRR 收益精算</h2>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  当前资料未包含逐年现金价值或领取现金流，暂不计算 IRR。后续录入每年保费、现金价值、生存金和分红数据后，系统再输出可核验的 IRR 与回本年度。
                </p>
              </div>
            </div>
          </section>

          <p className="border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
            免责声明：本报告依据录入或识别的资料生成，仅用于产品信息整理与方案沟通，不构成保险合同承诺或收益保证。最终责任、费率和现金价值以保险合同及保险公司正式资料为准。
          </p>
        </div>
      </article>
    </div>
  );
}

function TalkingAnalysisSection({
  analysis,
  isLoading,
  error,
  onRetry
}: {
  analysis: TalkingAnalysis | null;
  isLoading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <section className="print-break-avoid rounded-lg border border-slate-200 bg-slate-50 px-5 py-8 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
        <p className="mt-3 text-sm font-semibold text-ink">正在生成经纪人谈单分析...</p>
        <p className="mt-1 text-sm text-slate-500">系统正在核对优势、限制条件和客户适配场景。</p>
      </section>
    );
  }
  if (!analysis) {
    return (
      <section className="no-print rounded-lg border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-semibold text-amber-900">{error || "谈单分析尚未生成。"}</p>
        <button type="button" onClick={onRetry} className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white">
          <RefreshCw className="h-4 w-4" />重新生成
        </button>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle icon={TrendingUp} title="经纪人谈单素材" description="严格依据结构化 JSON 和原始方案文字生成，请结合正式条款复核后使用。" />
      <div className="mt-4 grid gap-5">
        <AnalysisPart icon={TrendingUp} index="01" title="产品核心优势" subtitle="缴费、收益、赔付及附加责任亮点" tone="good">
          <div className="grid gap-3">
            {analysis.advantages.map((item, index) => (
              <AnalysisItem key={`${item.title}-${index}`} title={item.title} productName={item.product_name} evidence={item.evidence} talkingPoint={item.talking_point} />
            ))}
          </div>
        </AnalysisPart>

        <AnalysisPart icon={TriangleAlert} index="02" title="产品短板与隐性坑点" subtitle="免责、减保、领取门槛与理赔约束" tone="warn">
          <div className="grid gap-3">
            {analysis.weaknesses.map((item, index) => (
              <AnalysisItem
                key={`${item.title}-${index}`}
                title={`${item.title} · ${item.risk_level}`}
                productName={item.product_name}
                evidence={item.evidence}
                talkingPoint={item.talking_point}
              />
            ))}
          </div>
        </AnalysisPart>

        <AnalysisPart icon={Users} index="03" title="适配客户与对比建议" subtitle="按客户需求场景选择，不做简单产品排名" tone="neutral">
          <div className="grid gap-5">
            <AudienceList title="适配客户" items={analysis.fit_and_comparison.fit_customers.map((item) => `${item.profile}：${item.reason}`)} />
            <AudienceList title="不建议优先选择" items={analysis.fit_and_comparison.unsuitable_customers.map((item) => `${item.profile}：${item.reason}`)} />
            <AudienceList
              title="对比建议"
              items={analysis.fit_and_comparison.comparison_advice.map((item) => `${item.scenario}：${item.recommendation}（依据：${item.evidence}）`)}
            />
            <div className="rounded-md bg-ink p-4 text-white">
              <p className="text-sm font-semibold text-red-200">可直接使用的谈单表达</p>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-200">
                {analysis.fit_and_comparison.broker_script.map((line, index) => <p key={`${line}-${index}`}>{index + 1}. {line}</p>)}
              </div>
            </div>
          </div>
        </AnalysisPart>
      </div>
    </section>
  );
}

function AnalysisPart({ icon: Icon, index, title, subtitle, tone, children }: { icon: typeof TrendingUp; index: string; title: string; subtitle: string; tone: "good" | "warn" | "neutral"; children: React.ReactNode }) {
  const toneClass = tone === "good" ? "border-green-200 bg-green-50/50 text-green-700" : tone === "warn" ? "border-amber-200 bg-amber-50/60 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div className={`print-break-avoid rounded-lg border p-5 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white shadow-sm"><Icon className="h-5 w-5" /></span>
        <div><p className="text-xs font-semibold opacity-70">{index}</p><h3 className="mt-1 font-semibold text-ink">{title}</h3><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>
      </div>
      <div className="mt-5 text-ink">{children}</div>
    </div>
  );
}

function AnalysisItem({ title, productName, evidence, talkingPoint }: { title: string; productName: string | null; evidence: string; talkingPoint: string }) {
  return (
    <div className="rounded-md bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="font-semibold text-ink">{title}</p>{productName ? <span className="text-xs font-semibold text-brand">{productName}</span> : null}</div>
      <p className="mt-2 text-sm leading-6 text-slate-500">事实依据：{evidence}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-700">谈单表达：{talkingPoint}</p>
    </div>
  );
}

function AudienceList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return <div><p className="text-sm font-semibold text-ink">{title}</p><ul className="mt-2 grid gap-2 text-sm leading-6 text-slate-600">{items.map((item, index) => <li key={`${item}-${index}`}>· {item}</li>)}</ul></div>;
}

function PolicyEvaluation({ policy, index }: { policy: StandardPolicy; index: number }) {
  const fields = [policy.insurer, policy.main_policy_name, policy.product_category ?? policy.insurance_type, policy.coverage_amount, policy.annual_premium, policy.payment_period];
  const completeness = Math.round((fields.filter((value) => value !== null && value !== undefined && String(value).trim()).length / fields.length) * 100);
  const strengths = [
    policy.coverage_amount ? `保障额度为 ${formatMoney(toNumber(policy.coverage_amount))}` : null,
    policy.product_category || policy.insurance_type ? `产品分类已识别为${policy.product_category ?? policy.insurance_type}` : null,
    policy.payment_period ? `缴费期间明确：${policy.payment_period}` : null
  ].filter(Boolean);
  const risks = [
    !policy.exclusions ? "未识别到免责条款，投保前需查阅正式条款" : null,
    !policy.cash_value_returns && ["年金", "增额寿"].includes(policy.product_category ?? "") ? "未提供现金价值或收益演示，暂不能测算 IRR" : null,
    !policy.product_constraints ? "未识别到投保年龄、健康告知或减保等约束规则" : null
  ].filter(Boolean);

  return (
    <div className="print-break-avoid rounded-lg border border-slate-200 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand">方案 {index + 1}</p>
          <h3 className="mt-1 break-words text-lg font-semibold text-ink">{text(policy.main_policy_name)}</h3>
          <p className="mt-1 text-sm text-slate-500">{text(policy.insurer)} · {text(policy.product_category ?? policy.insurance_type)}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
          <ShieldCheck className="h-4 w-4" /> 字段完整度 {completeness}%
        </span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Assessment title="产品优势" items={strengths.length ? strengths as string[] : ["当前资料不足，建议补充条款后重新评测"]} tone="good" />
        <Assessment title="核对重点" items={risks.length ? risks as string[] : ["核心字段完整，仍需以正式合同条款为准"]} tone="warn" />
      </div>
      <div className="mt-4 grid gap-3">
        <BenefitDetail label="重大疾病保险金" value={policy.major_disease_benefit} />
        <BenefitDetail label="中度疾病保险金" value={policy.moderate_disease_benefit} />
        <BenefitDetail label="轻度疾病保险金" value={policy.mild_disease_benefit} />
        <BenefitDetail label="身故保险金" value={policy.death_benefit} />
        <BenefitDetail label="全残保险金" value={policy.total_disability_benefit} />
        <BenefitDetail label="疾病终末期" value={policy.terminal_illness_benefit} />
        <BenefitDetail label="其他保险责任" value={policy.other_benefits} />
        <BenefitDetail label="保费豁免" value={policy.premium_waiver} />
        <BenefitDetail label="现金价值/收益" value={policy.cash_value_returns} />
        <BenefitDetail label="产品约束规则" value={policy.product_constraints} />
      </div>
    </div>
  );
}

function BenefitDetail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="grid gap-1 rounded-md bg-slate-50 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <p className="break-words text-sm leading-6 text-slate-600">{value}</p>
    </div>
  );
}

function Assessment({ title, items, tone }: { title: string; items: string[]; tone: "good" | "warn" }) {
  return (
    <div className={tone === "good" ? "rounded-md bg-green-50 p-4" : "rounded-md bg-amber-50 p-4"}>
      <p className={tone === "good" ? "text-sm font-semibold text-green-800" : "text-sm font-semibold text-amber-900"}>{title}</p>
      <ul className="mt-2 grid gap-2 text-sm leading-5 text-slate-600">
        {items.map((item) => <li key={item}>· {item}</li>)}
      </ul>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof FileText; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-50 text-brand"><Icon className="h-5 w-5" /></span>
      <div><h2 className="font-semibold text-ink">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-ink">{value}</p></div>;
}

function readPolicies(summary: Json): StandardPolicy[] {
  if (!isObject(summary) || !isObject(summary.report_json) || !Array.isArray(summary.report_json.policies)) return [];
  return summary.report_json.policies.filter(isObject) as StandardPolicy[];
}

function readTalkingAnalysis(summary: Json): TalkingAnalysis | null {
  if (!isObject(summary) || !isObject(summary.report_json) || !isObject(summary.report_json.talking_analysis)) return null;
  const value = summary.report_json.talking_analysis;
  if (!Array.isArray(value.advantages) || !Array.isArray(value.weaknesses) || !isObject(value.fit_and_comparison)) return null;
  return value as unknown as TalkingAnalysis;
}

function isObject(value: unknown): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function text(value: unknown) { return String(value ?? "").trim() || "未录入"; }
function formatMoney(value: number) { return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
