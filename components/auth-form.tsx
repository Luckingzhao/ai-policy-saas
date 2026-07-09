"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!isSupabaseConfigured) {
      setMessage("请先配置 Supabase 环境变量。");
      return;
    }

    setIsLoading(true);
    const redirectTo = `${window.location.origin}/dashboard`;
    const result = isRegister
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              full_name: fullName,
              brand_name: brandName
            }
          }
        })
      : await supabase.auth.signInWithPassword({ email, password });

    setIsLoading(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (isRegister && !result.data.session) {
      setMessage("注册成功，请到邮箱完成验证后登录。");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-soft md:grid-cols-[0.95fr_1.05fr]">
        <div className="bg-ink px-8 py-10 text-white md:px-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-brand">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-8 break-keep text-3xl font-semibold leading-tight">
            <span className="block sm:inline">AI 家庭保障</span>
            <span className="block sm:inline">顾问平台</span>
          </h1>
          <div className="mt-10 grid gap-3 text-sm text-white/80">
            <span>独立业务员账号</span>
            <span>独立客户与保单数据</span>
            <span>独立品牌信息与报告链接</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-10 md:px-10">
          <p className="text-sm font-medium text-brand">{isRegister ? "创建业务员账号" : "欢迎回来"}</p>
          <h2 className="mt-2 text-2xl font-semibold">{isRegister ? "注册" : "登录"}</h2>

          {isRegister ? (
            <div className="mt-7 grid gap-4">
              <label className="grid gap-2 text-sm font-medium">
                姓名
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="rounded-md border border-slate-200 px-4 py-3 outline-none focus:border-brand"
                  placeholder="例如：张顾问"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                品牌名称
                <input
                  value={brandName}
                  onChange={(event) => setBrandName(event.target.value)}
                  className="rounded-md border border-slate-200 px-4 py-3 outline-none focus:border-brand"
                  placeholder="例如：安心家庭保障工作室"
                />
              </label>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              邮箱
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-md border border-slate-200 px-4 py-3 outline-none focus:border-brand"
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
                className="rounded-md border border-slate-200 px-4 py-3 outline-none focus:border-brand"
                placeholder="至少 6 位"
              />
            </label>
          </div>

          {message ? <p className="mt-4 rounded-md bg-coral/10 px-4 py-3 text-sm text-coral">{message}</p> : null}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isRegister ? "注册并进入工作台" : "登录工作台"}
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            {isRegister ? "已有账号？" : "还没有账号？"}
            <Link className="ml-1 font-semibold text-brand" href={isRegister ? "/login" : "/register"}>
              {isRegister ? "去登录" : "去注册"}
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
