import "server-only";
import OpenAI from "openai";
import { AiConfigurationError } from "@/lib/ai/errors";
import type { ProviderRequest } from "@/lib/ai/types";

export async function callOpenRouter(request: ProviderRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AiConfigurationError("OPENROUTER_API_KEY 未配置。");

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 55_000,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-OpenRouter-Title": "AI Policy SaaS"
    }
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
