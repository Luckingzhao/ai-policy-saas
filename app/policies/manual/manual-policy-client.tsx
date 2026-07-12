"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type Customer = Pick<Database["public"]["Tables"]["customers"]["Row"], "id" | "name" | "phone">;

type PolicyForm = {
  id: string;
  policyHolder: string;
  insuredName: string;
  beneficiary: string;
  insurerName: string;
  productName: string;
  insuranceType: string;
  coverageAmount: string;
  premiumAmount: string;
  premiumPeriod: string;
  paidYears: string;
  effectiveDate: string;
  remainingYears: string;
  remainingPremium: string;
  policyService: string;
  paymentAccount: string;
  productInfo: string;
};

const insuranceTypes = ["重疾险", "医疗险", "意外险", "年金险", "寿险", "其他"];

function createEmptyPolicy(index: number): PolicyForm {
  return {
    id: `${Date.now()}-${index}`,
    policyHolder: "",
    insuredName: "",
    beneficiary: "",
    insurerName: "",
    productName: "",
    insuranceType: "重疾险",
    coverageAmount: "",
    premiumAmount: "",
    premiumPeriod: "",
    paidYears: "",
    effectiveDate: "",
    remainingYears: "",
    remainingPremium: "",
    policyService: "",
    paymentAccount: "",
    productInfo: ""
  };
}

export function ManualPolicyClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const customerId = searchParams.get("customerId") ?? "";
  const source = searchParams.get("source") === "builder" ? "builder" : "inspection";
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [policies, setPolicies] = useState<PolicyForm[]>([createEmptyPolicy(1)]);
  const [message, setMessage] = useState("");
  const [isCustomerLoading, setIsCustomerLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadCustomer() {
      if (!customerId || !isSupabaseConfigured) {
        setIsCustomerLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setIsCustomerLoading(false);
        return;
      }

      const { data } = await supabase
        .from("customers")
        .select("id,name,phone")
        .eq("user_id", userData.user.id)
        .eq("id", customerId)
        .maybeSingle();

      setCustomer(data ?? null);
      setIsCustomerLoading(false);
    }

    loadCustomer();
  }, [customerId, supabase]);

  function updatePolicy(id: string, key: keyof PolicyForm, value: string) {
    setPolicies((current) => current.map((policy) => (policy.id === id ? { ...policy, [key]: value } : policy)));
  }

  function addPolicy() {
    setPolicies((current) => [...current, createEmptyPolicy(current.length + 1)]);
  }

  function removePolicy(id: string) {
    setPolicies((current) => (current.length === 1 ? current : current.filter((policy) => policy.id !== id)));
  }

  async function handleSave() {
    setMessage("");
    if (!customerId || !customer) {
      setMessage("请先选择需要绑定的客户。");
      return;
    }

    const invalidPolicyIndex = policies.findIndex((policy) => !policy.insuredName.trim() || !policy.productName.trim());
    if (invalidPolicyIndex >= 0) {
      setMessage(`请补充保单 ${invalidPolicyIndex + 1} 的被保人和主险名称。`);
      return;
    }

    setIsSaving(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setMessage("登录状态已失效，请重新登录。");
      setIsSaving(false);
      return;
    }

    const reportId = createId();
    const now = new Date().toISOString();
    const standardPolicies = policies.map((policy) => ({
      policy_holder: emptyToNull(policy.policyHolder),
      insured: emptyToNull(policy.insuredName),
      beneficiaries: policy.beneficiary.trim()
        ? [{ name: policy.beneficiary.trim(), relationship: null, ratio: null, type: "未注明" }]
        : [],
      insurer: emptyToNull(policy.insurerName),
      main_policy_name: emptyToNull(policy.productName),
      product_info: emptyToNull(policy.productInfo),
      insurance_type: policy.insuranceType,
      coverage_amount: toNumber(policy.coverageAmount),
      annual_premium: toNumber(policy.premiumAmount),
      payment_period: policy.premiumPeriod ? `${toNumber(policy.premiumPeriod) ?? 0}年` : null,
      effective_date: emptyToNull(policy.effectiveDate),
      paid_years: toNumber(policy.paidYears),
      remaining_years: toNumber(policy.remainingYears),
      remaining_premium: toNumber(policy.remainingPremium),
      policy_service: emptyToNull(policy.policyService),
      benefit_details: [],
      payment_account: emptyToNull(policy.paymentAccount)
    }));
    const annualPremiumTotal = standardPolicies.reduce((total, policy) => total + (policy.annual_premium ?? 0), 0);
    const remainingPremiumTotal = standardPolicies.reduce((total, policy) => total + (policy.remaining_premium ?? 0), 0);
    const verification = {
      quality_status: "review_required",
      total_policy_count: standardPolicies.length,
      inserted_policy_count: standardPolicies.length,
      annual_premium_total: Number(annualPremiumTotal.toFixed(2)),
      remaining_premium_total: Number(remainingPremiumTotal.toFixed(2)),
      has_duplicate_policies: false,
      duplicate_policy_count: 0,
      has_missing_fields: false,
      missing_fields: []
    };
    const slug = `${Date.now().toString(36)}-${reportId.slice(0, 8)}`;
    const { error } = await supabase.from("h5_reports").insert({
      id: reportId,
      user_id: userData.user.id,
      customer_id: customerId,
      slug,
      title: source === "builder" ? `${customer.name}的产品方案评测` : `${customer.name}的家庭保障报告`,
      status: "draft",
      summary: {
        module: source === "builder" ? "policy_builder" : "policy_inspection",
        source_file_type: "manual",
        stage: "manual_completed",
        parse_status: "completed",
        parsed_at: now,
        review_status: "pending",
        verification,
        report_json: {
          version: 1,
          generated_at: now,
          source: "manual_entry",
          report_id: reportId,
          customer_id: customerId,
          file_id: null,
          verification,
          policies: standardPolicies
        },
        extracted_policies: standardPolicies
      },
      theme: {}
    });

    setIsSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("保存成功，正在生成报告页面...");
    router.push(source === "builder" ? `/policy-builder/reports/${reportId}` : "/reports");
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">当前保单：{policies.length} 份</p>
            <h2 className="mt-2 text-xl font-semibold">手动录入保单明细</h2>
            <p className="mt-3 text-sm font-semibold text-brand">
              绑定客户：
              {isCustomerLoading ? "正在读取..." : customer ? `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}` : "未选择客户"}
            </p>
            {!isCustomerLoading && !customer ? (
              <p className="mt-2 text-sm text-coral">请先返回保单管理页面选择客户，再进入手动录入。</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={source === "builder" ? "/policy-builder" : "/upload"}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"
            >
              {source === "builder" ? "返回保单智成" : "返回保单智检"}
            </Link>
            <button
              type="button"
              onClick={addPolicy}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              新增保单
            </button>
          </div>
        </div>
      </section>

      {message ? <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-brand">{message}</p> : null}

      <div className="grid gap-5">
        {policies.map((policy, index) => (
          <section key={policy.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">保单 {index + 1}</h3>
              <button
                type="button"
                onClick={() => removePolicy(policy.id)}
                disabled={policies.length === 1}
                className="inline-flex items-center gap-2 text-sm font-semibold text-coral disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
                删除
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="投保人" value={policy.policyHolder} onChange={(value) => updatePolicy(policy.id, "policyHolder", value)} />
              <Field label="被保人" value={policy.insuredName} onChange={(value) => updatePolicy(policy.id, "insuredName", value)} />
              <Field label="受益人" value={policy.beneficiary} onChange={(value) => updatePolicy(policy.id, "beneficiary", value)} />
              <Field label="保险公司" value={policy.insurerName} onChange={(value) => updatePolicy(policy.id, "insurerName", value)} />
              <Field label="主险名称" value={policy.productName} onChange={(value) => updatePolicy(policy.id, "productName", value)} />
              <label className="grid gap-2 text-sm font-semibold">
                保障类型
                <select
                  value={policy.insuranceType}
                  onChange={(event) => updatePolicy(policy.id, "insuranceType", event.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-3 outline-none focus:border-brand"
                >
                  {insuranceTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="保险金额" numeric value={policy.coverageAmount} onChange={(value) => updatePolicy(policy.id, "coverageAmount", value)} />
              <Field label="期缴保费" numeric value={policy.premiumAmount} onChange={(value) => updatePolicy(policy.id, "premiumAmount", value)} />
              <Field label="缴费期间（年）" numeric value={policy.premiumPeriod} onChange={(value) => updatePolicy(policy.id, "premiumPeriod", value)} />
              <Field label="缴费年限（年）" numeric value={policy.paidYears} onChange={(value) => updatePolicy(policy.id, "paidYears", value)} />
              <Field label="生效日" type="date" value={policy.effectiveDate} onChange={(value) => updatePolicy(policy.id, "effectiveDate", value)} />
              <Field label="待交年限（年）" numeric value={policy.remainingYears} onChange={(value) => updatePolicy(policy.id, "remainingYears", value)} />
              <Field label="待缴保费" numeric value={policy.remainingPremium} onChange={(value) => updatePolicy(policy.id, "remainingPremium", value)} />
              <Field label="保单服务" value={policy.policyService} onChange={(value) => updatePolicy(policy.id, "policyService", value)} />
              <Field label="缴费账户" value={policy.paymentAccount} onChange={(value) => updatePolicy(policy.id, "paymentAccount", value)} />
            </div>

            <label className="mt-4 grid gap-2 text-sm font-semibold">
              产品信息
              <textarea
                value={policy.productInfo}
                onChange={(event) => updatePolicy(policy.id, "productInfo", event.target.value)}
                className="min-h-20 rounded-md border border-slate-200 px-3 py-3 outline-none focus:border-brand"
                placeholder="例如：生效日、缴费期间、保障期间、缴费频率、赔付方式等"
              />
            </label>
          </section>
        ))}
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !customer}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "正在保存..." : source === "builder" ? "保存并生成评测" : "保存报告"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  numeric = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  numeric?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <input
        type={numeric ? "text" : type}
        inputMode={numeric ? "decimal" : undefined}
        value={value}
        onChange={(event) => onChange(numeric ? sanitizeNumber(event.target.value) : event.target.value)}
        onBlur={() => numeric && value && onChange(formatNumber(value))}
        className="w-full rounded-md border border-slate-200 px-3 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-red-100"
      />
    </label>
  );
}

function sanitizeNumber(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [integer = "", ...decimals] = cleaned.split(".");
  return decimals.length > 0 ? `${integer}.${decimals.join("").slice(0, 2)}` : integer;
}

function formatNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "";
}

function toNumber(value: string) {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? Number(number.toFixed(2)) : null;
}

function emptyToNull(value: string) {
  return value.trim() || null;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
