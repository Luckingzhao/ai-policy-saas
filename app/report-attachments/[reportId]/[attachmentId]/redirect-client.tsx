"use client";

import { useEffect, useMemo } from "react";
import { Download, FileText } from "lucide-react";

export function AttachmentRedirectClient({ apiPath }: { apiPath: string }) {
  const attachmentUrl = useMemo(() => {
    if (typeof window === "undefined") return apiPath;
    return `${window.location.origin}${apiPath}`;
  }, [apiPath]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = attachmentUrl;
    }, 500);

    return () => window.clearTimeout(timer);
  }, [attachmentUrl]);

  return (
    <main className="min-h-screen bg-[#edf4f3] px-4 py-8 text-ink">
      <section className="mx-auto max-w-[430px] rounded-lg bg-white p-6 shadow-soft">
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-red-50 text-brand">
          <FileText className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">正在打开附件</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          如果微信没有自动打开附件，请点击下方按钮。附件链接为临时授权链接，仅用于查看本次报告资料。
        </p>
        <a
          href={attachmentUrl}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white"
        >
          <Download className="h-4 w-4" />
          打开附件
        </a>
      </section>
    </main>
  );
}
