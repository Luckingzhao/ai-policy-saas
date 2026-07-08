"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { appNavItems } from "@/lib/navigation";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

type AppShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function AppShell({ title, description, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsChecking(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setUser(data.user);
      setIsChecking(false);
    });
  }, [router, supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (isChecking) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">正在进入工作台...</div>;
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-lg rounded-lg bg-white p-8 shadow-soft">
          <h1 className="text-xl font-semibold">需要配置 Supabase</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            请复制 .env.example 为 .env.local，填入 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY 后重新启动。
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-mist">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">AI 家庭保障</span>
            <span className="block text-xs text-slate-500">顾问平台</span>
          </span>
        </Link>

        <nav className="mt-8 grid gap-2">
          {appNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition ${
                  isActive ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
              {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-500 sm:inline">{user?.email}</span>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:text-ink"
                aria-label="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
          <nav className="mx-auto mt-4 flex max-w-6xl gap-2 overflow-x-auto pb-1 lg:hidden">
            {appNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href.includes("#") && pathname === item.href.split("#")[0]);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                    isActive ? "bg-brand text-white" : "bg-slate-50 text-slate-600"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
