import { ArrowDown, ArrowRight, BadgeCheck, BarChart3, FileDown, GitCompareArrows, LineChart, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { UploadClient } from "@/app/upload/upload-client";
import { PolicyBuilderReports } from "./policy-builder-reports";

const featureCards = [
  {
    title: "保险产品评测",
    description: "围绕保障责任、等待期、免责条款、续保条件和价格结构，生成产品专业评分。",
    icon: BadgeCheck
  },
  {
    title: "产品优劣势拆解",
    description: "把产品亮点、限制条件、适合人群和沟通话术拆成业务员可直接使用的要点。",
    icon: Target
  },
  {
    title: "方案对比",
    description: "对比不同产品或多套家庭配置方案，展示保障差异、保费差异和配置建议。",
    icon: GitCompareArrows
  },
  {
    title: "保单 IRR 收益精算",
    description: "面向年金险、寿险和分红类产品，测算现金流、IRR、回本时间和长期收益表现。",
    icon: LineChart
  }
];

const workflow = ["导入产品资料", "AI 拆解条款", "配置对比方案", "生成 PDF 方案"];

export default function PolicyBuilderPage() {
  return (
    <AppShell title="保单智成" description="用于保险产品评测、方案对比、IRR 收益精算和最终 PDF 方案输出。">
      <div className="grid gap-6">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-7">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-brand">
                <Sparkles className="h-4 w-4" />
                新方案智能生成工作台
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-ink sm:text-3xl">从产品测评到方案交付，一次完成</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                保单智检解决“客户已有保单怎么看”，保单智成解决“下一步方案怎么配”。未来可结合产品条款、客户需求、预算和家庭结构，输出可交付的 PDF 方案。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#solution-entry"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white shadow-sm"
                >
                  上传产品资料
                  <ArrowDown className="h-4 w-4" />
                </a>
                <a href="#generated-reports" className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">
                  生成或查看报告<ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-500">最终交付</p>
              <div className="mt-5 grid gap-3">
                <Deliverable label="PDF 产品测评报告" value="专业版式" />
                <Deliverable label="家庭配置方案" value="可讲解" />
                <Deliverable label="IRR 收益测算表" value="可核对" />
              </div>
            </div>
          </div>
        </section>

        <section id="solution-entry" className="scroll-mt-6">
          <div className="mb-4">
            <p className="text-sm font-semibold text-brand">第一步</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">选择客户并上传产品资料</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              支持图片、PDF、Excel、Word 或手动录入。解析结果统一绑定客户，并生成产品评测、方案对比和 PDF 交付页。
            </p>
          </div>
          <UploadClient mode="builder" />
        </section>

        <PolicyBuilderReports />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureCards.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{feature.description}</p>
              </div>
            );
          })}
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">建议产品边界</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              这个模块非常适合做成商业化增值功能，但建议和“保单智检”分开计费或分权限开放。智检偏存量客户服务，智成偏销售方案生成，用户心智更清楚。
            </p>
            <div className="mt-5 grid gap-3">
              <Insight title="适合智优版或团队版开放" description="IRR 精算和 PDF 方案输出属于高价值能力，适合放进更高套餐。" icon={BarChart3} />
              <Insight title="需要独立资料库" description="后续建议建立产品库、条款库、测评模板和方案模板，避免每次都完全依赖 AI 即兴生成。" icon={FileDown} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">工作流程</h2>
            <div className="mt-5 grid gap-3">
              {workflow.map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-md bg-slate-50 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-sm font-semibold text-brand shadow-sm">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Deliverable({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-white px-4 py-3">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-brand">{value}</span>
    </div>
  );
}

function Insight({ title, description, icon: Icon }: { title: string; description: string; icon: typeof BarChart3 }) {
  return (
    <div className="flex gap-3 rounded-md bg-slate-50 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}
