import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 家庭保障顾问平台",
  description: "面向保险业务员的多租户保单解析与 H5 家庭保障报告 SaaS"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
