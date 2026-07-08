"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
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
  const customerId = searchParams.get("customerId") ?? "";
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [policies, setPolicies] = useState<PolicyForm[]>([createEmptyPolicy(1)]);
  const [message, setMessage] = useState("");
  const [isCustomerLoading, setIsCustomerLoading] = useState(true);

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

  function handleSave() {
    setMessage("手动录入内容已暂存在当前页面。下一步可接入保存入库并生成 H5 报告。");
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
              href="/upload"
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"
            >
              返回保单管理
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

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
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
              <Field label="保险金额" value={policy.coverageAmount} onChange={(value) => updatePolicy(policy.id, "coverageAmount", value)} />
              <Field label="期缴保费" value={policy.premiumAmount} onChange={(value) => updatePolicy(policy.id, "premiumAmount", value)} />
              <Field label="缴费期间" value={policy.premiumPeriod} onChange={(value) => updatePolicy(policy.id, "premiumPeriod", value)} />
              <Field label="生效日" type="date" value={policy.effectiveDate} onChange={(value) => updatePolicy(policy.id, "effectiveDate", value)} />
              <Field label="待交年限" value={policy.remainingYears} onChange={(value) => updatePolicy(policy.id, "remainingYears", value)} />
              <Field label="待缴保费" value={policy.remainingPremium} onChange={(value) => updatePolicy(policy.id, "remainingPremium", value)} />
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
          className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white shadow-lg"
        >
          <Save className="h-4 w-4" />
          保存录入内容
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-200 px-3 py-3 outline-none focus:border-brand"
      />
    </label>
  );
}
