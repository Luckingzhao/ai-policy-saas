import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getAiRuntimes, isRetryableGatewayError, type AiRuntime } from "@/lib/ai/gateway";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

type TalkingAnalysis = {
  advantages: Array<{ product_name: string | null; title: string; evidence: string; talking_point: string }>;
  weaknesses: Array<{
    product_name: string | null;
    title: string;
    evidence: string;
    risk_level: "高" | "中" | "提示";
    talking_point: string;
  }>;
  fit_and_comparison: {
    fit_customers: Array<{ profile: string; reason: string }>;
    unsuitable_customers: Array<{ profile: string; reason: string }>;
    comparison_advice: Array<{ scenario: string; recommendation: string; evidence: string }>;
    broker_script: string[];
  };
};

export async function POST(request: Request, context: RouteContext) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return NextResponse.json({ error: "Supabase 环境变量未配置。" }, { status: 500 });

  const authorization = request.headers.get("authorization");
  if (!authorization) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const { id } = await context.params;
  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "登录状态无效。" }, { status: 401 });

  const { data: report, error: reportError } = await supabase
    .from("h5_reports")
    .select("id,user_id,summary")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();
  if (reportError || !report) return NextResponse.json({ error: "评测报告不存在或无权访问。" }, { status: 404 });

  const summary = isObject(report.summary) ? report.summary : {};
  const reportJson = isObject(summary.report_json) ? summary.report_json : null;
  const policies = reportJson && Array.isArray(reportJson.policies) ? reportJson.policies : [];
  if (!reportJson || policies.length === 0) return NextResponse.json({ error: "请先完成方案资料解析。" }, { status: 400 });

  try {
    const analysis = await generateTalkingAnalysis(policies, typeof reportJson.source_text === "string" ? reportJson.source_text : "");
    const nextReportJson = {
      ...reportJson,
      analysis_status: "completed",
      analyzed_at: new Date().toISOString(),
      talking_analysis: analysis as unknown as Json
    };
    const nextSummary = { ...summary, report_json: nextReportJson };
    const { error } = await supabase.from("h5_reports").update({ summary: nextSummary as Json }).eq("id", id).eq("user_id", userData.user.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "谈单分析生成失败。";
    await supabase
      .from("h5_reports")
      .update({ summary: { ...summary, report_json: { ...reportJson, analysis_status: "failed", analysis_error: message } } as Json })
      .eq("id", id)
      .eq("user_id", userData.user.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function generateTalkingAnalysis(policies: Json[], sourceText: string): Promise<TalkingAnalysis> {
  const runtimes = getAiRuntimes("report");
  if (runtimes.length === 0) throw new Error("请配置 OpenClaw Gateway、OpenRouter、DeepSeek 或 OpenAI。");
  let lastError: unknown;
  for (const runtime of runtimes) {
    try {
      return await callAnalysisModel(runtime, policies, sourceText);
    } catch (error) {
      lastError = error;
      if (!isRetryableGatewayError(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI 服务暂时不可用，请稍后重试。");
}

async function callAnalysisModel(runtime: AiRuntime, policies: Json[], sourceText: string) {
  const completion = await runtime.client.chat.completions.create({
    model: runtime.model,
    temperature: 0.15,
    max_tokens: 4200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是资深保险经纪人培训与产品测评助手。所有判断必须来自输入 JSON 或原文证据。缺失的免责、现金价值、领取或减保规则只能写‘原文未提供，需查阅正式条款’，不得推测。禁止使用保证收益、绝对理赔、最好等误导性表述。只输出 JSON。"
      },
      {
        role: "user",
        content: `输入包含保险方案完整结构化 JSON 和原始方案文本。请生成可直接给保险经纪人使用的谈单素材，语言通俗、专业、克制。

严格输出以下 JSON：
{"advantages":[{"product_name":null,"title":"优势标题","evidence":"原文或JSON中的事实依据","talking_point":"可直接使用的通俗谈单表达"}],"weaknesses":[{"product_name":null,"title":"短板或隐性坑点","evidence":"免责限制、减保规则、领取门槛、理赔约束等事实；缺失时明确原文未提供","risk_level":"高/中/提示","talking_point":"经纪人应如何向客户解释或进一步核对"}],"fit_and_comparison":{"fit_customers":[{"profile":"适配客户画像","reason":"适配原因"}],"unsuitable_customers":[{"profile":"不建议客户画像","reason":"原因"}],"comparison_advice":[{"scenario":"客户关注场景","recommendation":"对比建议，不得简单宣称某产品最好","evidence":"比较依据"}],"broker_script":["可直接使用的谈单句子"]}}

分析要求：
1. 核心优势覆盖缴费、收益、赔付、附加责任亮点；没有收益资料时不得评价收益。
2. 短板重点检查免责限制、减保、领取门槛、理赔次数/间隔/分组、年龄限制和资料缺失。
3. 多产品时必须给出按客户需求场景的对比建议。
4. 每条优势或短板必须带 evidence，不得脱离原文。

结构化 JSON：
${JSON.stringify(policies).slice(0, 30000)}

原始方案文本：
${sourceText.slice(0, 28000)}`
      }
    ]
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("模型未返回谈单分析结果。");
  const parsed = parseAnalysisJson(content);
  validateAnalysis(parsed);
  return parsed;
}

function parseAnalysisJson(content: string): TalkingAnalysis {
  try {
    return JSON.parse(content) as TalkingAnalysis;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型返回的谈单分析不是有效 JSON。");
    return JSON.parse(match[0]) as TalkingAnalysis;
  }
}

function validateAnalysis(value: TalkingAnalysis) {
  if (!value || !Array.isArray(value.advantages) || !Array.isArray(value.weaknesses) || !value.fit_and_comparison) {
    throw new Error("模型返回的谈单分析结构不完整。");
  }
  value.fit_and_comparison.fit_customers ??= [];
  value.fit_and_comparison.unsuitable_customers ??= [];
  value.fit_and_comparison.comparison_advice ??= [];
  value.fit_and_comparison.broker_script ??= [];
}

function isObject(value: unknown): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
