"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";

type Report = Pick<Database["public"]["Tables"]["h5_reports"]["Row"], "id" | "slug" | "title" | "summary">;

type EditablePolicy = {
  policy_holder: string;
  insured: string;
  beneficiary_text: string;
  insurer: string;
  main_policy_name: string;
  product_info: string;
  insurance_type: string;
  coverage_amount: string;
  annual_premium: string;
  payment_period: string;
  effective_date: string;
  remaining_years: string;
  remaining_premium: string;
  policy_service: string;
  payment_account: string;
};

const insuranceTypes = ["重疾险", "医疗险", "意外险", "年金险", "寿险", "其他"];

export function ReportReviewClient({ reportId }: { reportId: string }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [report, setReport] = useState<Report | null>(null);
  const [policies, setPolicies] = useState<EditablePolicy[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadReport() {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setMessage("请先登录。");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("h5_reports")
        .select("id,slug,title,summary")
        .eq("id", reportId)
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (error || !data) {
        setMessage(error?.message || "报告不存在或无权访问。");
        setIsLoading(false);
        return;
      }

      setReport(data);
      setPolicies(readPoliciesFromSummary(data.summary));
      setIsLoading(false);
    }

    loadReport();
  }, [reportId, supabase]);

  function updatePolicy(index: number, field: keyof EditablePolicy, value: string) {
    setPolicies((current) => current.map((policy, policyIndex) => (policyIndex === index ? { ...policy, [field]: value } : policy)));
  }

  function addPolicy() {
    setPolicies((current) => [...current, createEmptyPolicy()]);
  }

  function removePolicy(index: number) {
    setPolicies((current) => current.filter((_, policyIndex) => policyIndex !== index));
  }

  async function saveReview() {
    if (!report) return;
    setIsSaving(true);
    setMessage("");

    const finalPolicies = policies.map(toReportJsonPolicy);
    const verification = buildReviewVerification(finalPolicies);
    const nextSummary = {
      ...(isPlainObject(report.summary) ? report.summary : {}),
      parse_status: "completed",
      review_status: "reviewed",
      reviewed_at: new Date().toISOString(),
      verification,
      report_json: {
        version: 1,
        generated_at: new Date().toISOString(),
        source: "manual_review",
        report_id: report.id,
        verification,
        policies: finalPolicies
      }
    };

    const { error } = await supabase.from("h5_reports").update({ summary: nextSummary as Json }).eq("id", report.id);
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setReport({ ...report, summary: nextSummary as Json });
    setMessage("已保存最终 report_json，H5 将使用核对后的数据。");
  }

  if (isLoading) {
    return <p className="rounded-lg bg-white p-6 text-sm text-slate-500">正在加载核对数据...</p>;
  }

  if (!report) {
    return <p className="rounded-lg bg-white p-6 text-sm text-slate-500">{message || "无法加载报告。"}</p>;
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{report.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            红色核验提示代表自动解析不确定。请在这里修正保单字段，保存后 H5 会以这份最终数据为准。
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <button
            onClick={saveReview}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "保存中..." : "保存报告"}
          </button>
          <Link href={`/reports/detail/${report.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            返回人工确认页
          </Link>
        </div>
      </div>

      {message ? <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">{message}</p> : null}

      <div className="flex justify-between gap-3">
        <p className="text-sm text-slate-500">当前保单：{policies.length} 份</p>
        <button onClick={addPolicy} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" />
          新增保单
        </button>
      </div>

      <div className="grid gap-4">
        {policies.map((policy, index) => (
          <article key={index} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold">保单 {index + 1}</h3>
              <button onClick={() => removePolicy(index)} className="inline-flex items-center gap-1 text-sm font-semibold text-coral">
                <Trash2 className="h-4 w-4" />
                删除
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="投保人" value={policy.policy_holder} onChange={(value) => updatePolicy(index, "policy_holder", value)} required />
              <Field label="被保人" value={policy.insured} onChange={(value) => updatePolicy(index, "insured", value)} required />
              <Field label="受益人" value={policy.beneficiary_text} onChange={(value) => updatePolicy(index, "beneficiary_text", value)} />
              <Field label="保险公司" value={policy.insurer} onChange={(value) => updatePolicy(index, "insurer", value)} required />
              <Field label="主险名称" value={policy.main_policy_name} onChange={(value) => updatePolicy(index, "main_policy_name", value)} required />
              <label className="grid gap-1 text-sm font-medium">
                保障类型
                <select
                  value={policy.insurance_type}
                  onChange={(event) => updatePolicy(index, "insurance_type", event.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand"
                >
                  {insuranceTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="保险金额" value={policy.coverage_amount} onChange={(value) => updatePolicy(index, "coverage_amount", value)} />
              <Field label="期缴保费" value={policy.annual_premium} onChange={(value) => updatePolicy(index, "annual_premium", value)} />
              <Field label="缴费期间" value={policy.payment_period} onChange={(value) => updatePolicy(index, "payment_period", value)} />
              <Field label="生效日" value={policy.effective_date} onChange={(value) => updatePolicy(index, "effective_date", value)} />
              <Field label="待交年限" value={policy.remaining_years} onChange={(value) => updatePolicy(index, "remaining_years", value)} />
              <Field label="待缴保费" value={policy.remaining_premium} onChange={(value) => updatePolicy(index, "remaining_premium", value)} />
              <Field label="保单服务" value={policy.policy_service} onChange={(value) => updatePolicy(index, "policy_service", value)} />
              <Field label="缴费账户" value={policy.payment_account} onChange={(value) => updatePolicy(index, "payment_account", value)} />
              <Field
                label="产品信息"
                value={policy.product_info}
                onChange={(value) => updatePolicy(index, "product_info", value)}
                className="md:col-span-3"
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  className = ""
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 text-sm font-medium ${className}`}>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`rounded-md border px-3 py-2 outline-none focus:border-brand ${
          required && !value.trim() ? "border-coral bg-rose-50" : "border-slate-200 bg-white"
        }`}
      />
    </label>
  );
}

function readPoliciesFromSummary(summary: Json): EditablePolicy[] {
  const reportJson = isPlainObject(summary) && isPlainObject(summary.report_json) ? summary.report_json : null;
  const policies = reportJson && Array.isArray(reportJson.policies) ? reportJson.policies : [];
  return policies.filter(isPlainObject).map((policy) => ({
    policy_holder: text(policy.policy_holder),
    insured: text(policy.insured),
    beneficiary_text: formatBeneficiaries(policy.beneficiaries),
    insurer: text(policy.insurer),
    main_policy_name: text(policy.main_policy_name),
    product_info: text(policy.product_info),
    insurance_type: insuranceTypes.includes(text(policy.insurance_type)) ? text(policy.insurance_type) : "其他",
    coverage_amount: text(policy.coverage_amount),
    annual_premium: text(policy.annual_premium),
    payment_period: text(policy.payment_period),
    effective_date: text(policy.effective_date),
    remaining_years: text(policy.remaining_years),
    remaining_premium: text(policy.remaining_premium),
    policy_service: text(policy.policy_service),
    payment_account: text(policy.payment_account)
  }));
}

function createEmptyPolicy(): EditablePolicy {
  return {
    policy_holder: "",
    insured: "",
    beneficiary_text: "",
    insurer: "",
    main_policy_name: "",
    product_info: "",
    insurance_type: "其他",
    coverage_amount: "",
    annual_premium: "",
    payment_period: "",
    effective_date: "",
    remaining_years: "",
    remaining_premium: "",
    policy_service: "",
    payment_account: ""
  };
}

function toReportJsonPolicy(policy: EditablePolicy) {
  return {
    policy_holder: emptyToNull(policy.policy_holder),
    insured: emptyToNull(policy.insured),
    beneficiaries: parseBeneficiaries(policy.beneficiary_text),
    insurer: emptyToNull(policy.insurer),
    main_policy_name: emptyToNull(policy.main_policy_name),
    product_info: emptyToNull(policy.product_info),
    insurance_type: emptyToNull(policy.insurance_type),
    coverage_amount: toNumber(policy.coverage_amount),
    annual_premium: toNumber(policy.annual_premium),
    payment_period: emptyToNull(policy.payment_period),
    effective_date: emptyToNull(policy.effective_date),
    remaining_years: toNumber(policy.remaining_years),
    remaining_premium: toNumber(policy.remaining_premium),
    policy_service: emptyToNull(policy.policy_service),
    benefit_details: [],
    payment_account: emptyToNull(policy.payment_account)
  };
}

function buildReviewVerification(policies: ReturnType<typeof toReportJsonPolicy>[]) {
  const missingFields = policies
    .map((policy, index) => {
      const fields = [
        ["投保人", policy.policy_holder],
        ["被保人", policy.insured],
        ["保险公司", policy.insurer],
        ["主险名称", policy.main_policy_name],
        ["保障类型", policy.insurance_type],
        ["期缴保费", policy.annual_premium],
        ["生效日", policy.effective_date]
      ]
        .filter(([, value]) => value === null || value === "")
        .map(([label]) => String(label));
      return fields.length > 0 ? { policy: policy.main_policy_name || `保单 ${index + 1}`, fields } : null;
    })
    .filter(Boolean);
  const annualPremiumTotal = roundMoney(policies.reduce((total, policy) => total + (policy.annual_premium ?? 0), 0));
  const remainingPremiumTotal = roundMoney(policies.reduce((total, policy) => total + (policy.remaining_premium ?? 0), 0));
  const remainingChecks = buildRemainingPremiumChecks(policies);
  const remainingFailed = remainingChecks.filter((item) => !item.passed);
  const beneficiaryChecks = buildBeneficiaryChecks(policies);
  const beneficiaryFailed = beneficiaryChecks.filter((item) => !item.passed);
  const duplicateCount = countDuplicates(policies);
  const annualPremiumTerms = policies
    .map((policy) => policy.annual_premium)
    .filter((value): value is number => value !== null)
    .map(formatPlainMoney)
    .join(" + ");

  const verificationRounds = [
    {
      name: "核验1：保单数量核验",
      passed: missingFields.length === 0,
      detail: `人工核对后保单数量 ${policies.length} 份；缺失核心字段 ${missingFields.length} 份。`
    },
    {
      name: "核验2：年缴保费合计核验",
      passed: true,
      detail: `期缴保费合计 ${formatPlainMoney(annualPremiumTotal)} 元${annualPremiumTerms ? `；计算式：${annualPremiumTerms}` : ""}。`
    },
    {
      name: "核验3：待缴保费计算核验",
      passed: remainingFailed.length === 0,
      detail:
        remainingFailed.length === 0
          ? `全部通过，待缴总保费 ${formatPlainMoney(remainingPremiumTotal)} 元。`
          : `需复核 ${remainingFailed.length} 份：${remainingFailed
              .slice(0, 3)
              .map((item) => `${item.policy} 应为 ${formatPlainMoney(item.expected ?? 0)} 元，当前 ${formatPlainMoney(item.actual ?? 0)} 元`)
              .join("；")}。`
    },
    {
      name: "核验4：去重核验",
      passed: duplicateCount === 0,
      detail: `按“被保人 + 主险名称 + 生效日”组合去重，重复 ${duplicateCount} 份。`
    },
    {
      name: "核验5：受益人信息核验",
      passed: beneficiaryFailed.length === 0,
      detail:
        beneficiaryFailed.length === 0
          ? `全部通过，已核验 ${beneficiaryChecks.length} 份保单受益人信息。`
          : `需复核 ${beneficiaryFailed.length} 份：${beneficiaryFailed
              .slice(0, 3)
              .map((item) => item.policy)
              .join("、")} 未识别到受益人或法定受益人。`
    }
  ];

  return {
    quality_status: verificationRounds.every((round) => round.passed) ? "passed" : "review_required",
    total_policy_count: policies.length,
    inserted_policy_count: policies.length,
    annual_premium_total: annualPremiumTotal,
    remaining_premium_total: remainingPremiumTotal,
    has_duplicate_policies: duplicateCount > 0,
    duplicate_policy_count: duplicateCount,
    has_missing_fields: missingFields.length > 0,
    missing_fields: missingFields,
    remaining_premium_checks: remainingChecks,
    beneficiary_checks: beneficiaryChecks,
    verification_rounds: verificationRounds
  };
}

function parseBeneficiaries(value: string) {
  const clean = value.trim();
  if (!clean) return [];
  if (clean === "法定") return [{ name: "法定", relationship: null, ratio: null, type: "法定" }];
  return value
    .split(/[;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item === "法定") {
        return { name: "法定", relationship: null, ratio: null, type: "法定" };
      }
      const [name = item, relationship = "", ratio = ""] = item.split(/[·,，]/).map((part) => part.trim());
      return {
        name,
        relationship: relationship || null,
        ratio: toNumber(ratio),
        type: "指定"
      };
    });
}

function formatBeneficiaries(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .filter(isPlainObject)
    .map((item) => {
      const type = text(item.type);
      const name = text(item.name);
      if (type === "法定" || name === "法定") return "法定";
      return [name, text(item.relationship), text(item.ratio) ? `${text(item.ratio)}%` : ""].filter(Boolean).join(" · ");
    })
    .join("；");
}

function countDuplicates(policies: ReturnType<typeof toReportJsonPolicy>[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const policy of policies) {
    const key = `${policy.insured || ""}|${policy.main_policy_name || ""}|${policy.effective_date || ""}`;
    if (!key.replace(/\|/g, "")) continue;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return duplicates;
}

function buildRemainingPremiumChecks(policies: ReturnType<typeof toReportJsonPolicy>[]) {
  return policies.map((policy, index) => {
    const expected =
      policy.annual_premium === null || policy.remaining_years === null ? null : roundMoney(policy.annual_premium * policy.remaining_years);
    return {
      policy: policy.main_policy_name || `保单 ${index + 1}`,
      annual_premium: policy.annual_premium,
      remaining_years: policy.remaining_years,
      expected,
      actual: policy.remaining_premium,
      passed: expected === null || policy.remaining_premium === null ? false : Math.abs(expected - policy.remaining_premium) < 0.01
    };
  });
}

function buildBeneficiaryChecks(policies: ReturnType<typeof toReportJsonPolicy>[]) {
  return policies.map((policy, index) => ({
    policy: policy.main_policy_name || `保单 ${index + 1}`,
    beneficiaries: policy.beneficiaries,
    passed: policy.beneficiaries.length > 0
  }));
}

function formatPlainMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2
  }).format(roundMoney(value));
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function emptyToNull(value: string) {
  const clean = value.trim();
  return clean ? clean : null;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
