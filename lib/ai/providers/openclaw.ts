import "server-only";
import OpenAI from "openai";
import { AiConfigurationError } from "@/lib/ai/errors";
import type { AiTaskType, ProviderRequest } from "@/lib/ai/types";

export async function callOpenClaw(request: ProviderRequest) {
  const apiKey = process.env.OPENCLAW_GATEWAY_TOKEN;
  const baseURL = process.env.OPENCLAW_BASE_URL;
  if (!apiKey || !baseURL) throw new AiConfigurationError("OpenClaw Gateway 环境变量未完整配置。");
  const client = new OpenAI({
    apiKey,
    baseURL: baseURL.replace(/\/+$/, ""),
    timeout: 55_000,
    defaultHeaders: process.env.OPENCLAW_ACCESS_TOKEN
      ? { "X-OpenClaw-Access": process.env.OPENCLAW_ACCESS_TOKEN }
      : undefined
  });

  const completion = await client.chat.completions.create({
    model: request.model,
    temperature: 0.1,
    max_tokens: 5000,
    response_format: { type: "json_object" },
    messages: attachImages(request.messages, request.images)
  });

  return completion.choices[0]?.message?.content ?? "";
}

export function getOpenClawAgent(task: AiTaskType) {
  const configuredAgent = getConfiguredAgent(task);
  const normalized = configuredAgent.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized) throw new AiConfigurationError(`任务 ${task} 未配置 OpenClaw Agent。`);
  if (normalized === "openclaw" || normalized.startsWith("openclaw/")) return normalized;
  return `openclaw/${normalized}`;
}

function getConfiguredAgent(task: AiTaskType) {
  if (task === "final_report_generation" || task === "title_generation") {
    return process.env.OPENCLAW_REPORT_AGENT || "openclaw/report-generation";
  }
  if (
    task === "family_gap_analysis" ||
    task === "customer_summary" ||
    task === "customer_tagging" ||
    task === "background_classification"
  ) {
    return process.env.OPENCLAW_CUSTOMER_AGENT || "openclaw/customer-analysis";
  }
  return process.env.OPENCLAW_POLICY_AGENT || "openclaw/policy-analysis";
}

function attachImages(messages: ProviderRequest["messages"], images: ProviderRequest["images"]) {
  if (!images?.length) return messages;
  return [
    ...messages,
    {
      role: "user" as const,
      content: images.map((image) => ({
        type: "image_url" as const,
        image_url: { url: image.dataUrl, detail: image.detail || "high" }
      }))
    }
  ];
}
