"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  ClipboardList,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  UsersRound
} from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

const advantages = [
  {
    title: "AI 保单解析",
    description: "上传 PDF、图片或文档，AI 自动提取保单信息、保障责任和缴费信息，减少手工整理。",
    icon: Bot
  },
  {
    title: "客户档案管理",
    description: "集中管理客户、家庭成员、保单、历史方案和服务记录，重要资料随时可查。",
    icon: UsersRound
  },
  {
    title: "一键生成专业报告",
    description: "自动生成 H5 微信分享、PDF 报告、Excel 明细、PPT 汇报，满足不同客户沟通场景。",
    icon: FileArchive
  },
  {
    title: "AI 智能分析",
    description: "自动计算待缴保费、剩余缴费年限、家庭保障结构、保障责任摘要和保障缺口分析。",
    icon: BarChart3
  }
];

const imports = [
  { title: "手动录入", description: "快速创建客户、家庭成员及保单信息", icon: ClipboardList },
  { title: "PDF 导入", description: "自动解析保单、保障报告等 PDF 文件", icon: FileText },
  { title: "图片导入", description: "OCR 识别保单照片、聊天截图、体检报告", icon: ImageIcon },
  { title: "Office 文档", description: "支持 Excel、Word、PPT、CSV 等格式", icon: FileSpreadsheet },
  { title: "文本导入", description: "粘贴微信聊天、客户需求、健康告知，AI 自动提取关键信息", icon: MessageSquareText }
];

const audiences = ["保险代理人", "保险经纪人", "保险团队", "财富管理顾问", "家庭保障规划师"];

const values = [
  "减少重复整理保单的时间",
  "自动生成标准化家庭保障报告",
  "客户资料统一管理",
  "微信分享更加便捷",
  "AI 协助完成保单检视",
  "提升客户服务体验与专业形象"
];

const outputs = ["家庭保障分析", "保单明细", "保费统计", "待缴保费", "保障责任摘要", "微信 H5 分享", "PDF", "Excel"];

const workflowSteps = [
  {
    title: "上传资料",
    description: "上传 PDF、Excel 或手动录入客户保单资料。",
    icon: FileText
  },
  {
    title: "AI 自动解析",
    description: "提取投保人、被保人、保费、责任和受益人信息。",
    icon: Bot
  },
  {
    title: "生成客户档案",
    description: "按客户和家庭成员归档，形成可持续维护的数据资产。",
    icon: UsersRound
  },
  {
    title: "输出专业报告",
    description: "生成适合微信沟通和客户核对的家庭保障报告。",
    icon: FileArchive
  }
];

export function LoginLanding() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!isSupabaseConfigured) {
      setMessage("请先配置 Supabase 环境变量。");
      return;
    }

    setIsLoading(true);
    const result = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleResetPassword() {
    setMessage("");
    if (!email) {
      setMessage("请先输入邮箱，再点击忘记密码。");
      return;
    }
    if (!isSupabaseConfigured) {
      setMessage("请先配置 Supabase 环境变量。");
      return;
    }

    setIsResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`
    });
    setIsResetting(false);

    setMessage(error ? error.message : "重置密码邮件已发送，请查看邮箱。");
  }

  return (
    <main className="min-h-screen bg-[#f4f6f5] text-ink">
      <section className="mx-auto min-h-screen max-w-7xl px-5 py-6 lg:px-8 lg:py-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/login" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand text-white shadow-soft">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-lg font-semibold">AI保单智检</span>
              <span className="block text-xs text-slate-500">保险业务员的 AI 工作台</span>
            </span>
          </Link>
          <a href="#login-panel" className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm lg:hidden">
            登录
          </a>
        </header>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_420px]">
          <section className="flex min-h-[590px] flex-col justify-between rounded-lg border border-slate-200 bg-white p-7 shadow-soft lg:p-8">
            <div>
              <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
                <span className="h-10 w-1.5 rounded-full bg-coral" />
                <div>
                  <p className="text-sm font-semibold text-coral">家庭保障报告智能工作台</p>
                  <p className="mt-1 text-xs text-slate-500">上传一次保单，自动生成多种专业交付格式</p>
                </div>
              </div>

              <h1 className="mt-8 max-w-4xl break-keep text-[38px] font-semibold leading-[1.12] tracking-normal sm:text-5xl xl:whitespace-nowrap xl:text-[56px]">
                <span className="block sm:inline">AI 家庭保障</span>
                <span className="block sm:inline">顾问平台</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                专为保险业务员打造，一站式完成保单整理、客户管理、家庭保障分析与专业报告生成，让 AI 成为您的专属保险助理。
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white shadow-soft hover:bg-red-800"
                >
                  免费开始使用
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:text-ink"
                >
                  查看演示
                </a>
              </div>
            </div>

            <div className="mt-8 rounded-md bg-slate-50 p-4">
              <p className="text-sm leading-7 text-slate-600">
                帮助客户更容易看懂保障，也让您的服务更加高效、标准化、更具专业形象。
              </p>
            </div>
          </section>

          <aside id="login-panel" className="self-start">
          <form onSubmit={handleLogin} className="min-h-[590px] rounded-lg border border-slate-200 bg-white p-6 shadow-soft sm:p-7">
            <p className="text-sm font-semibold text-brand">业务员登录</p>
            <h2 className="mt-2 text-2xl font-semibold">进入 AI 保险工作台</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">管理客户、解析保单、生成报告，都从这里开始。</p>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm font-medium">
                邮箱
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-brand"
                  placeholder="agent@example.com"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                密码
                <input
                  required
                  minLength={6}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-brand"
                  placeholder="至少 6 位"
                />
              </label>
            </div>

            {message ? <p className="mt-4 rounded-md bg-coral/10 px-4 py-3 text-sm leading-6 text-coral">{message}</p> : null}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              登录
              <ArrowRight className="h-4 w-4" />
            </button>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
              <Link href="/register" className="font-semibold text-brand">
                注册新账号
              </Link>
              <button type="button" onClick={handleResetPassword} disabled={isResetting} className="font-semibold text-slate-500 hover:text-ink">
                {isResetting ? "发送中..." : "忘记密码"}
              </button>
            </div>
          </form>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <SectionHeading eyebrow="产品优势" title="为什么选择 AI保单智检？" />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {advantages.map((item) => (
            <FeatureCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <SectionHeading
          eyebrow="资料导入"
          title="多种资料导入方式"
          description="无需重复整理资料，支持多种格式一键导入，AI 自动建立客户档案。"
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {imports.map((item) => (
            <SmallCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-12 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <SectionHeading
            eyebrow="工作流程"
            title="四步完成专业家庭保障报告"
            description="从资料到报告交付，所有动作围绕客户服务闭环设计，让保单整理更顺手。"
          />
          <div className="rounded-lg border border-red-100 bg-white px-5 py-4 shadow-soft">
            <p className="text-sm font-semibold text-brand">业务员工作台</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              每一份报告都可以先核对、再确认、最后发布，减少客户看到错误信息的风险。
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft lg:p-7">
            <div className="grid gap-4 md:grid-cols-4">
              {workflowSteps.map((step, index) => (
                <WorkflowCard key={step.title} index={index} {...step} />
              ))}
            </div>
            <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">发布前确认机制</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">AI 解析完成后，先人工核对，再生成可分享的 H5 报告。</p>
                </div>
                <Link
                  href="/register"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-red-800"
                >
                  免费开始使用
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-ink p-5 text-white shadow-soft lg:p-7">
            <p className="text-sm font-semibold text-white/70">报告输出中心</p>
            <h3 className="mt-2 text-2xl font-semibold">一次整理，多种交付</h3>
            <p className="mt-3 text-sm leading-6 text-white/65">
              H5 适合微信分享，Excel 适合核对明细，PDF 和 PPT 可用于正式沟通场景。
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {outputs.map((item) => (
                <span key={item} className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white/90">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
        <div className="rounded-lg bg-ink p-6 text-white shadow-soft">
          <h2 className="text-2xl font-semibold">适用于</h2>
          <div className="mt-5 grid gap-3">
            {audiences.map((item) => (
              <p key={item} className="rounded-md bg-white/10 px-4 py-3 text-sm font-semibold text-white/85">
                {item}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/80 bg-white p-6 shadow-soft">
          <h2 className="text-2xl font-semibold">AI 帮您节省更多时间，把精力留给客户</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {values.map((item) => (
              <p key={item} className="flex items-center gap-2 rounded-md bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                <BadgeCheck className="h-4 w-4 shrink-0 text-brand" />
                {item}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-14 pt-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-lg bg-ink px-6 py-10 text-white shadow-soft lg:px-10">
          <h2 className="text-3xl font-semibold">开启您的 AI 保险工作台</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">
            让 AI 帮您整理保单、管理客户、生成专业报告，提升服务效率与客户体验。
          </p>
          <Link
            href="/register"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-red-700"
          >
            立即免费体验
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-brand">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold">{title}</h2>
      {description ? <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">{description}</p> : null}
    </div>
  );
}

function FeatureCard({ title, description, icon: Icon }: { title: string; description: string; icon: typeof ShieldCheck }) {
  return (
    <article className="rounded-lg border border-white/80 bg-white p-5 shadow-soft">
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-brand">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </article>
  );
}

function SmallCard({ title, description, icon: Icon }: { title: string; description: string; icon: typeof ShieldCheck }) {
  return (
    <article className="rounded-lg border border-white/80 bg-white p-4 shadow-soft">
      <Icon className="h-5 w-5 text-brand" />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </article>
  );
}

function WorkflowCard({
  title,
  description,
  icon: Icon,
  index
}: {
  title: string;
  description: string;
  icon: typeof ShieldCheck;
  index: number;
}) {
  return (
    <article className="relative rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-200 hover:border-red-200">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-red-50 text-brand">
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-xs font-semibold text-slate-400">0{index + 1}</span>
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </article>
  );
}
