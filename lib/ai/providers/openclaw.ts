import "server-only";
import OpenAI from "openai";
import { AiConfigurationError } from "@/lib/ai/errors";
import type { ProviderRequest } from "@/lib/ai/types";

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
    model: toOpenClawModel(request.model),
    temperature: 0.1,
    max_tokens: 5000,
    response_format: { type: "json_object" },
    messages: attachImages(request.messages, request.images)
  });

  return completion.choices[0]?.message?.content ?? "";
}

function toOpenClawModel(openRouterModel: string) {
  return openRouterModel.startsWith("openrouter/") ? openRouterModel : `openrouter/${openRouterModel}`;
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
