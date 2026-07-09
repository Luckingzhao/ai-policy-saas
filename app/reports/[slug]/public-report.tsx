"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Banknote, Download, FileText, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";

type Report = Pick<
  Database["public"]["Tables"]["h5_reports"]["Row"],
  "id" | "user_id" | "customer_id" | "title" | "summary" | "published_at"
>;
type Customer = Pick<Database["public"]["Tables"]["customers"]["Row"], "id" | "name" | "phone" | "city">;
type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "full_name" | "phone" | "company_name" | "wechat_id" | "service_code" | "avatar_url" | "brand_name" | "brand_logo_url"
>;
type Policy = Database["public"]["Tables"]["policies"]["Row"];
type Beneficiary = Database["public"]["Tables"]["beneficiaries"]["Row"];
type Benefit = Database["public"]["Tables"]["policy_benefits"]["Row"];
type ReportFile = Pick<
  Database["public"]["Tables"]["report_files"]["Row"],
  "id" | "bucket" | "object_path" | "original_filename" | "mime_type" | "file_size"
>;

type Attachment = {
  id: string;
  name: string;
  mimeType: string | null;
  fileSize: number | null;
  url: string | null;
};

type AttachmentMeta = {
  id: string;
  bucket: string;
  object_path: string;
  original_filename: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

type ReportJsonPolicy = {
  policy_holder?: string | null;
  insured?: string | null;
  beneficiaries?: Array<{
    name?: string | null;
    relationship?: string | null;
    ratio?: number | string | null;
    type?: string | null;
  }>;
  insurer?: string | null;
  main_policy_name?: string | null;
  product_info?: string | null;
  insurance_type?: string | null;
  coverage_amount?: number | string | null;
  annual_premium?: number | string | null;
  payment_period?: string | null;
  effective_date?: string | null;
  remaining_years?: number | string | null;
  remaining_premium?: number | string | null;
  policy_service?: string | null;
  benefit_details?: Array<{
    name?: string | null;
    type?: string | null;
    amount?: number | string | null;
    description?: string | null;
    waiting_period?: string | null;
  }>;
  payment_account?: string | null;
};

type DisplayPolicy = {
  id: string;
  policyHolder: string | null;
  insured: string;
  insurer: string | null;
  productName: string | null;
  productInfo: string | null;
  insuranceType: string | null;
  coverageAmount: number | null;
  annualPremium: number | null;
  paymentPeriod: string | null;
  effectiveDate: string | null;
  remainingYears: number | null;
  remainingPremium: number | null;
  policyService: string | null;
  paymentAccount: string | null;
  beneficiaries: Array<{
    id: string;
    name: string;
    relationship: string | null;
    ratio: number | null;
  }>;
  benefits: Array<{
    id: string;
    name: string;
    amount: number | null;
    description: string | null;
    waitingPeriod: string | null;
  }>;
};

type PublicReportData = {
  report: Report;
  customer: Customer | null;
  profile: Profile | null;
  policies: Policy[];
  beneficiaries: Beneficiary[];
  benefits: Benefit[];
  attachments: Attachment[];
};

export function PublicReport({ slug, reportId, preview = false }: { slug?: string; reportId?: string; preview?: boolean }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [data, setData] = useState<PublicReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadReport() {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }

      let report: Report | null = null;
      if (preview && reportId) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          setIsLoading(false);
          return;
        }

        const { data: previewReport } = await supabase
          .from("h5_reports")
          .select("id,user_id,customer_id,title,summary,published_at")
          .eq("id", reportId)
          .eq("user_id", userData.user.id)
          .maybeSingle();
        report = previewReport ?? null;
      } else if (slug) {
        const { data: publicReport } = await supabase
          .from("h5_reports")
          .select("id,user_id,customer_id,title,summary,published_at")
          .eq("slug", slug)
          .eq("status", "published")
          .maybeSingle();
        report = publicReport ?? null;
      }

      if (!report) {
        setIsLoading(false);
        return;
      }

      const [customerResult, profileResult, policiesResult] = await Promise.all([
        report.customer_id
          ? supabase.from("customers").select("id,name,phone,city").eq("id", report.customer_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("profiles")
          .select("full_name,phone,company_name,wechat_id,service_code,avatar_url,brand_name,brand_logo_url")
          .eq("user_id", report.user_id)
          .maybeSingle(),
        supabase
          .from("policies")
          .select("*")
          .eq("user_id", report.user_id)
          .eq("customer_id", report.customer_id ?? "")
          .order("insured_name", { ascending: true })
          .order("effective_date", { ascending: false })
      ]);

      const policies = policiesResult.data ?? [];
      const policyIds = policies.map((policy) => policy.id);
      const [beneficiariesResult, benefitsResult] =
        policyIds.length > 0
          ? await Promise.all([
              supabase.from("beneficiaries").select("*").in("policy_id", policyIds),
              supabase.from("policy_benefits").select("*").in("policy_id", policyIds)
            ])
          : [{ data: [] }, { data: [] }];
      const attachments = await loadReportAttachments(supabase, report, preview);

      setData({
        report,
        customer: customerResult.data ?? null,
        profile: profileResult.data ?? null,
        policies,
        beneficiaries: beneficiariesResult.data ?? [],
        benefits: benefitsResult.data ?? [],
        attachments
      });
      setIsLoading(false);
    }

    loadReport();
  }, [preview, reportId, slug, supabase]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#edf4f3] px-4 py-8">
        <section className="mx-auto max-w-[430px] rounded-lg bg-white p-6 text-sm text-slate-500 shadow-soft">正在加载报告...</section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#edf4f3] px-4 py-8">
        <section className="mx-auto max-w-[430px] rounded-lg bg-white p-6 shadow-soft">
          <h1 className="text-xl font-semibold">报告暂不可访问</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">报告不存在或尚未发布，请联系您的保险顾问确认链接。</p>
        </section>
      </main>
    );
  }

  const { report, customer, profile, policies, beneficiaries, benefits, attachments } = data;
  const displayPolicies = getDisplayPolicies(report.summary, policies, beneficiaries, benefits, customer?.name ?? null);
  const grouped = groupByInsured(displayPolicies);
  const totalCoverage = sumMoney(displayPolicies.map((policy) => policy.coverageAmount));
  const annualPremium = sumMoney(displayPolicies.map((policy) => policy.annualPremium));
  const remainingPremium = sumMoney(displayPolicies.map((policy) => policy.remainingPremium));
  const advisorName = profile?.full_name || "专属保险顾问";
  const brandName = profile?.brand_name || "AI 家庭保障顾问平台";
  const companyName = profile?.company_name || "专业家庭保障服务";
  const typeCounts = countByInsuranceType(displayPolicies);

  return (
    <main className="min-h-screen bg-[#edf4f3] px-3 py-4 text-ink sm:py-8">
      <article className="mx-auto max-w-[430px] overflow-hidden rounded-lg bg-[#fbfcfe] shadow-soft">
        <section className="bg-ink px-6 pb-8 pt-7 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BrandMark imageUrl={profile?.brand_logo_url || profile?.avatar_url} />
              <div>
                <p className="text-sm font-semibold">{brandName}</p>
                <p className="mt-1 text-xs text-white/65">{companyName}</p>
              </div>
            </div>
            <span className="rounded-md bg-white/10 px-3 py-1 text-xs text-white/80">{preview ? "预览" : "已生成"}</span>
          </div>

          <div className="mt-10">
            <p className="text-sm text-white/70">客户</p>
            <h1 className="mt-2 text-4xl font-semibold leading-tight">{customer?.name || "尊敬的客户"}</h1>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/72">{report.title}</p>
          </div>

          <div className="mt-8 rounded-lg bg-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white/60">保障顾问</p>
                <p className="mt-1 font-semibold">{advisorName}</p>
                <p className="mt-1 text-xs text-white/65">微信：{profile?.wechat_id || "请向顾问索取"}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/60">联系方式</p>
                <p className="mt-1 font-semibold">{profile?.phone || customer?.phone || "请向顾问索取"}</p>
                <p className="mt-1 text-xs text-white/65">服务编号：{profile?.service_code || "未填写"}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-5">
          <SectionTitle icon={BadgeCheck} title="家庭保障总览" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <OverviewCard label="总保单数" value={`${displayPolicies.length} 份`} />
            <OverviewCard label="总保险金额" value={formatMoney(totalCoverage)} />
            <OverviewCard label="期缴总保费" value={formatMoney(annualPremium)} />
            <OverviewCard label="待缴总保费" value={formatMoney(remainingPremium)} />
          </div>
          {typeCounts.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {typeCounts.map((item) => (
                <span key={item.type} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                  {item.type} {item.count} 份
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className="px-5 pb-5">
          <SectionTitle icon={UserRound} title="被保人分组" />
          <div className="mt-4 grid gap-4">
            {grouped.length === 0 ? (
              <div className="rounded-lg bg-white p-5 text-sm leading-6 text-slate-500">当前报告还没有可展示的保单明细，请联系顾问完成解析。</div>
            ) : null}

            {grouped.map((group) => (
              <div key={group.insuredName} className="rounded-lg bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{group.insuredName}</h2>
                  <span className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-brand">{group.policies.length} 份保单</span>
                </div>

                <div className="mt-4 grid gap-4">
                  {group.policies.map((policy) => (
                    <PolicyCard key={policy.id} policy={policy} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 pb-7">
          <AttachmentsSection attachments={attachments} />

          <div className="rounded-lg bg-[#f8fafc] p-4">
            <h2 className="font-semibold">免责声明</h2>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              本报告基于已上传保单文本和 AI 结构化解析结果生成，仅用于家庭保障梳理和沟通参考，不构成保险销售承诺、理赔结论或法律意见。具体保障责任、除外责任、等待期、缴费安排和权益解释，请以保险合同、批单及保险公司正式说明为准。
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}

function AttachmentsSection({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
      <SectionTitle icon={FileText} title="附件资料" />
      <p className="mt-3 text-xs leading-6 text-slate-500">如需查看具体保险合同、保单明细或原始报告，可打开下方附件阅读。</p>
      <div className="mt-3 grid gap-2">
        {attachments.map((attachment) =>
          attachment.url ? (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-[#fbfcfe] px-3 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{attachment.name}</span>
                <span className="mt-1 block text-xs text-slate-500">{formatSize(attachment.fileSize)}</span>
              </span>
              <Download className="h-4 w-4 shrink-0 text-brand" />
            </a>
          ) : (
            <div key={attachment.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3">
              <p className="truncate text-sm font-semibold">{attachment.name}</p>
              <p className="mt-1 text-xs text-slate-500">附件暂不可打开，请联系保险顾问获取。</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function BrandMark({ imageUrl }: { imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="品牌标识" className="h-11 w-11 rounded-md bg-white object-cover" />
    );
  }

  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand">
      <ShieldCheck className="h-6 w-6" />
    </span>
  );
}

function PolicyCard({ policy }: { policy: DisplayPolicy }) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-100 bg-[#fbfcfe] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold leading-6 [overflow-wrap:anywhere]">{cleanText(policy.productName) || "未命名主险"}</p>
          <p className="mt-1 text-xs text-slate-500">{policy.insurer || "未知保险公司"}</p>
        </div>
        <InsuranceTag value={policy.insuranceType} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric icon={ShieldCheck} label="保险金额" value={formatMoney(policy.coverageAmount)} />
        <Metric icon={Banknote} label="期缴保费" value={formatMoney(policy.annualPremium)} />
        <Metric icon={WalletCards} label="待缴保费" value={formatRemainingPremium(policy)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
        <InfoCell label="投保人" value={policy.policyHolder} />
        <InfoCell label="生效日" value={formatDate(policy.effectiveDate)} />
        <InfoCell label="缴费期间" value={policy.paymentPeriod} />
        <InfoCell label="缴费账户" value={policy.paymentAccount} />
        {policy.policyService ? <InfoCell label="保单服务" value={policy.policyService} wide /> : null}
      </div>

      <Block title="产品信息">
        <p className="text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{cleanText(policy.productInfo) || "未识别到产品信息"}</p>
      </Block>

      <Block title="受益人">
        {policy.beneficiaries.length === 0 ? (
          <p className="text-sm text-slate-500">未识别到受益人信息</p>
        ) : (
          <div className="grid gap-2">
            {policy.beneficiaries.map((beneficiary) => (
              <p key={beneficiary.id} className="text-sm text-slate-600">
                {beneficiary.name} · {beneficiary.relationship || "关系未填"} · {beneficiary.ratio ?? "-"}%
              </p>
            ))}
          </div>
        )}
      </Block>

      <Block title="保障内容详解">
        <p className="text-sm leading-6 text-slate-500">请参考家庭保障顾问报告明细</p>
      </Block>
    </article>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof ShieldCheck; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-red-50 text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}

function OverviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-white p-3">
      <Icon className="h-4 w-4 text-brand" />
      <p className="mt-2 text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-semibold [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 overflow-hidden rounded-md bg-slate-50 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function InfoCell({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-md bg-white p-3 ${wide ? "col-span-2" : ""}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium leading-5 text-slate-700 [overflow-wrap:anywhere]">{cleanText(value) || "未识别"}</p>
    </div>
  );
}

function InsuranceTag({ value }: { value?: string | null }) {
  return <span className="shrink-0 rounded-md bg-[#fff4e6] px-2.5 py-1 text-xs font-semibold text-[#b26b00]">{value || "其他"}</span>;
}

function getDisplayPolicies(summary: Json, policies: Policy[], beneficiaries: Beneficiary[], benefits: Benefit[], customerName: string | null): DisplayPolicy[] {
  const reportJsonPolicies = getReportJsonPolicies(summary);
  if (reportJsonPolicies.length > 0) {
    return reportJsonPolicies.map((policy, index) => ({
      id: `json-${index}`,
      policyHolder: normalizeDisplayPolicyHolder(policy.policy_holder, customerName),
      insured: cleanText(policy.insured) || "未识别被保人",
      insurer: cleanText(policy.insurer) || null,
      productName: cleanText(policy.main_policy_name) || null,
      productInfo: cleanText(policy.product_info) || null,
      insuranceType: cleanText(policy.insurance_type) || null,
      coverageAmount: toNumber(policy.coverage_amount),
      annualPremium: toNumber(policy.annual_premium),
      paymentPeriod: cleanText(policy.payment_period) || null,
      effectiveDate: cleanText(policy.effective_date) || null,
      remainingYears: toNumber(policy.remaining_years),
      remainingPremium: toNumber(policy.remaining_premium),
      policyService: cleanText(policy.policy_service) || null,
      paymentAccount: cleanText(policy.payment_account) || null,
      beneficiaries: (policy.beneficiaries ?? [])
        .filter((beneficiary) => cleanText(beneficiary.name))
        .map((beneficiary, beneficiaryIndex) => ({
          id: `json-${index}-beneficiary-${beneficiaryIndex}`,
          name: cleanText(beneficiary.name),
          relationship: cleanText(beneficiary.relationship) || null,
          ratio: toNumber(beneficiary.ratio)
        })),
      benefits: (policy.benefit_details ?? [])
        .filter((benefit) => cleanText(benefit.name) || cleanText(benefit.description))
        .map((benefit, benefitIndex) => ({
          id: `json-${index}-benefit-${benefitIndex}`,
          name: cleanText(benefit.name) || `保障责任 ${benefitIndex + 1}`,
          amount: toNumber(benefit.amount),
          description: cleanText(benefit.description) || null,
          waitingPeriod: cleanText(benefit.waiting_period) || null
        }))
    }));
  }

  return policies.map((policy) => ({
    id: policy.id,
    policyHolder: normalizeDisplayPolicyHolder(policy.policy_holder_name, customerName),
    insured: policy.insured_name || "未识别被保人",
    insurer: policy.insurer_name,
    productName: policy.product_name,
    productInfo: policy.product_info,
    insuranceType: policy.insurance_type,
    coverageAmount: policy.coverage_amount,
    annualPremium: policy.premium_amount,
    paymentPeriod: policy.premium_period,
    effectiveDate: policy.effective_date,
    remainingYears: policy.remaining_years,
    remainingPremium: policy.remaining_premium,
    policyService: policy.policy_service,
    paymentAccount: policy.payment_account,
    beneficiaries: beneficiaries
      .filter((item) => item.policy_id === policy.id)
      .map((beneficiary) => ({
        id: beneficiary.id,
        name: beneficiary.name,
        relationship: beneficiary.relationship,
        ratio: beneficiary.benefit_ratio
      })),
    benefits: benefits
      .filter((item) => item.policy_id === policy.id)
      .map((benefit) => ({
        id: benefit.id,
        name: benefit.benefit_name,
        amount: benefit.coverage_amount,
        description: benefit.description,
        waitingPeriod: benefit.waiting_period
      }))
  }));
}

async function loadReportAttachments(supabase: ReturnType<typeof createBrowserSupabaseClient>, report: Report, preview: boolean): Promise<Attachment[]> {
  const manualAttachments = await Promise.all(
    getManualAttachments(report.summary).map(async (attachment) => {
      const signedUrl = preview
        ? (await supabase.storage.from(attachment.bucket).createSignedUrl(attachment.object_path, 60 * 60)).data?.signedUrl
        : getPublicAttachmentUrl(report.id, attachment.id);
      return {
        id: attachment.id,
        name: attachment.original_filename,
        mimeType: attachment.mime_type,
        fileSize: attachment.file_size,
        url: signedUrl ?? null
      };
    })
  );
  if (isSourceAttachmentHidden(report.summary)) {
    return manualAttachments;
  }

  const sourceFileId = getSourceFileId(report.summary);
  const originalFilename = getOriginalFilename(report.summary);
  if (!sourceFileId) {
    const fallback = originalFilename
      ? [
          {
            id: "source-file",
            name: originalFilename,
            mimeType: null,
            fileSize: null,
            url: null
          }
        ]
      : [];
    return [...manualAttachments, ...fallback];
  }

  if (!preview) {
    return [
      ...manualAttachments,
      {
        id: sourceFileId,
        name: originalFilename || "原始上传文件",
        mimeType: null,
        fileSize: null,
        url: getPublicAttachmentUrl(report.id, sourceFileId)
      }
    ];
  }

  const { data: file } = await supabase
    .from("report_files")
    .select("id,bucket,object_path,original_filename,mime_type,file_size")
    .eq("id", sourceFileId)
    .maybeSingle<ReportFile>();

  if (!file) {
    const fallback = originalFilename
      ? [
          {
            id: sourceFileId,
            name: originalFilename,
            mimeType: null,
            fileSize: null,
            url: null
          }
        ]
      : [];
    return [...manualAttachments, ...fallback];
  }

  const { data: signedUrl } = await supabase.storage.from(file.bucket).createSignedUrl(file.object_path, 60 * 60);

  return [
    ...manualAttachments,
    {
      id: file.id,
      name: file.original_filename,
      mimeType: file.mime_type,
      fileSize: file.file_size,
      url: signedUrl?.signedUrl ?? null
    }
  ];
}

function getPublicAttachmentUrl(reportId: string, attachmentId: string) {
  return `/api/report-attachments/${encodeURIComponent(reportId)}/${encodeURIComponent(attachmentId)}`;
}

function getManualAttachments(summary: Json): AttachmentMeta[] {
  if (!isPlainObject(summary) || !Array.isArray(summary.attachments)) return [];
  return summary.attachments.filter(isAttachmentMeta);
}

function isAttachmentMeta(value: Json): value is AttachmentMeta {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.bucket === "string" &&
    typeof value.object_path === "string" &&
    typeof value.original_filename === "string" &&
    typeof value.created_at === "string"
  );
}

function getSourceFileId(summary: Json) {
  if (!isPlainObject(summary)) return "";
  const value = summary.report_file_id;
  return typeof value === "string" ? value : "";
}

function getOriginalFilename(summary: Json) {
  if (!isPlainObject(summary)) return "";
  const value = summary.original_filename;
  return typeof value === "string" ? value : "";
}

function isSourceAttachmentHidden(summary: Json) {
  return isPlainObject(summary) && summary.hide_source_attachment === true;
}

function normalizeDisplayPolicyHolder(value: unknown, customerName: string | null) {
  const text = value === null || value === undefined ? "" : cleanText(String(value));
  if (!text || /^(投保人|保险公司|主险名称|产品信息|被保险人|序号)$/.test(text) || /^\d+$/.test(text)) {
    return customerName;
  }
  return text;
}

function getReportJsonPolicies(summary: Json): ReportJsonPolicy[] {
  if (!isPlainObject(summary)) return [];
  const reportJson = summary.report_json;
  if (!isPlainObject(reportJson) || !Array.isArray(reportJson.policies)) return [];
  return reportJson.policies.filter(isPlainObject) as ReportJsonPolicy[];
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function groupByInsured(policies: DisplayPolicy[]) {
  const map = new Map<string, DisplayPolicy[]>();
  for (const policy of policies) {
    const name = policy.insured || "未识别被保人";
    map.set(name, [...(map.get(name) ?? []), policy]);
  }
  return Array.from(map.entries()).map(([insuredName, groupPolicies]) => ({ insuredName, policies: groupPolicies }));
}

function countByInsuranceType(policies: DisplayPolicy[]) {
  const map = new Map<string, number>();
  for (const policy of policies) {
    const type = policy.insuranceType || "其他";
    map.set(type, (map.get(type) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([type, count]) => ({ type, count }));
}

function sumMoney(values: Array<number | null>): number {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total;
}

function formatMoney(value?: number | null) {
  if (!value) return "¥0";
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value);
}

function formatRemainingPremium(policy: DisplayPolicy) {
  if (policy.annualPremium !== null && policy.remainingYears !== null) {
    return `${formatPlainMoney(policy.annualPremium)} × ${policy.remainingYears}年`;
  }
  return formatMoney(policy.remainingPremium);
}

function formatPlainMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function formatSize(size: number | null) {
  if (!size) return "文件";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value?: string | null) {
  if (!value) return "未识别";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function cleanText(value?: string | null) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}
