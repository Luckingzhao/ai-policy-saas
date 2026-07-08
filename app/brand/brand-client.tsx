"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Building2, Loader2, Save, UserRound } from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { getPlanLabel, getPlanLimit } from "@/lib/usage";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Subscription = Pick<Database["public"]["Tables"]["subscriptions"]["Row"], "plan_code" | "monthly_report_limit">;

type BrandForm = {
  full_name: string;
  phone: string;
  company_name: string;
  avatar_url: string;
  wechat_id: string;
  service_code: string;
  brand_name: string;
  brand_logo_url: string;
};

const emptyForm: BrandForm = {
  full_name: "",
  phone: "",
  company_name: "",
  avatar_url: "",
  wechat_id: "",
  service_code: "",
  brand_name: "",
  brand_logo_url: ""
};

export function BrandClient() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [form, setForm] = useState<BrandForm>(emptyForm);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setIsLoading(false);
        return;
      }

      setUserId(userData.user.id);
      const [profileResult, subscriptionResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userData.user.id).maybeSingle(),
        supabase.from("subscriptions").select("plan_code,monthly_report_limit").eq("user_id", userData.user.id).maybeSingle()
      ]);

      const profile = profileResult.data as Profile | null;
      if (profile) {
        setForm({
          full_name: profile.full_name ?? "",
          phone: profile.phone ?? "",
          company_name: profile.company_name ?? "",
          avatar_url: profile.avatar_url ?? "",
          wechat_id: profile.wechat_id ?? "",
          service_code: profile.service_code ?? "",
          brand_name: profile.brand_name ?? "",
          brand_logo_url: profile.brand_logo_url ?? ""
        });
      }
      setSubscription(subscriptionResult.data ?? null);
      setIsLoading(false);
    }

    load();
  }, [supabase]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!userId) {
      setMessage("请先登录。");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      user_id: userId,
      full_name: emptyToNull(form.full_name),
      phone: emptyToNull(form.phone),
      company_name: emptyToNull(form.company_name),
      avatar_url: emptyToNull(form.avatar_url),
      wechat_id: emptyToNull(form.wechat_id),
      service_code: emptyToNull(form.service_code),
      brand_name: emptyToNull(form.brand_name),
      brand_logo_url: emptyToNull(form.brand_logo_url)
    });
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("品牌资料已保存，新的 H5 报告会展示这些信息。");
  }

  if (isLoading) {
    return <div className="rounded-lg bg-white p-6 text-sm text-slate-500">正在加载品牌资料...</div>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
      <form onSubmit={saveProfile} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-brand">
            <UserRound className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">顾问品牌信息</h2>
            <p className="mt-1 text-sm text-slate-500">客户报告封面和顾问卡片会读取这里的内容。</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="顾问姓名" value={form.full_name} onChange={(value) => setForm({ ...form, full_name: value })} />
          <Field label="手机号" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <Field label="公司名称" value={form.company_name} onChange={(value) => setForm({ ...form, company_name: value })} />
          <Field label="微信号" value={form.wechat_id} onChange={(value) => setForm({ ...form, wechat_id: value })} />
          <Field label="服务编号" value={form.service_code} onChange={(value) => setForm({ ...form, service_code: value })} />
          <Field label="品牌名称" value={form.brand_name} onChange={(value) => setForm({ ...form, brand_name: value })} />
          <Field label="头像 URL" value={form.avatar_url} onChange={(value) => setForm({ ...form, avatar_url: value })} />
          <Field label="品牌 Logo URL" value={form.brand_logo_url} onChange={(value) => setForm({ ...form, brand_logo_url: value })} />
        </div>

        {message ? <p className="mt-5 rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">{message}</p> : null}

        <button
          type="submit"
          disabled={isSaving}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存品牌设置
        </button>
      </form>

      <section className="grid gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <Building2 className="h-5 w-5 text-brand" />
          <h2 className="mt-4 text-lg font-semibold">H5 展示预览</h2>
          <div className="mt-5 rounded-lg bg-ink p-5 text-white">
            <p className="text-sm text-white/65">{form.company_name || "公司名称"}</p>
            <h3 className="mt-3 text-2xl font-semibold">{form.brand_name || "品牌名称"}</h3>
            <p className="mt-4 text-sm text-white/75">
              {form.full_name || "顾问姓名"} · {form.phone || "手机号"} · {form.wechat_id || "微信号"}
            </p>
            <p className="mt-2 text-xs text-white/55">服务编号：{form.service_code || "未填写"}</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <BadgeCheck className="h-5 w-5 text-brand" />
          <h2 className="mt-4 text-lg font-semibold">当前套餐</h2>
          <p className="mt-3 text-3xl font-semibold">{getPlanLabel(subscription?.plan_code)}</p>
          <p className="mt-2 text-sm text-slate-500">每月可生成 {getPlanLimit(subscription?.plan_code, subscription?.monthly_report_limit)} 份报告</p>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-200 px-3 py-3 outline-none focus:border-brand"
      />
    </label>
  );
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
