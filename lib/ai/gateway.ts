import OpenAI from "openai";

export type AiProvider = "openclaw" | "openrouter" | "deepseek" | "openai";
export type AiTask = "policy" | "customer" | "report" | "vision";

export type AiRuntime = {
  provider: AiProvider;
  apiKey: string;
  client: OpenAI;
  model: string;
};

const PROVIDER_ORDER: AiProvider[] = ["openclaw", "openrouter", "deepseek", "openai"];

export function getAiRuntimes(task: AiTask): AiRuntime[] {
  const preferred = normalizeProvider(process.env.AI_PROVIDER);
  const fallback = normalizeProvider(process.env.AI_FALLBACK_PROVIDER);
  const order = uniqueProviders([preferred, fallback, ...PROVIDER_ORDER]);

  return order.flatMap((provider) => {
    const runtime = createRuntime(provider, task);
    return runtime ? [runtime] : [];
  });
}

export function isRetryableGatewayError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /connection|fetch failed|timeout|socket|ECONNREFUSED|ECONNRESET|premature close|gateway|503|502/i.test(message);
}

function createRuntime(provider: AiProvider, task: AiTask): AiRuntime | null {
  if (provider === "openclaw") {
    if (task === "vision") return null;
    const apiKey = process.env.OPENCLAW_GATEWAY_TOKEN;
    if (!apiKey) return null;
    const baseURL = trimTrailingSlash(process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1");
    const model = task === "report"
      ? process.env.OPENCLAW_REPORT_AGENT || "openclaw/report-generation"
      : task === "customer"
        ? process.env.OPENCLAW_CUSTOMER_AGENT || "openclaw/customer-analysis"
        : process.env.OPENCLAW_POLICY_AGENT || "openclaw/policy-analysis";
    return {
      provider,
      apiKey,
      model,
      client: new OpenAI({
        apiKey,
        baseURL,
        timeout: 55000,
        defaultHeaders: process.env.OPENCLAW_ACCESS_TOKEN
          ? { "X-OpenClaw-Access": process.env.OPENCLAW_ACCESS_TOKEN }
          : undefined
      })
    };
  }

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;
    const model = task === "vision"
      ? process.env.OPENROUTER_VISION_MODEL || "google/gemini-2.5-flash"
      : process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat";
    return {
      provider,
      apiKey,
      model,
      client: new OpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        timeout: 55000,
        defaultHeaders: {
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-OpenRouter-Title": "AI Policy SaaS"
        }
      })
    };
  }

  if (provider === "deepseek") {
    if (task === "vision") return null;
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      client: new OpenAI({ apiKey, baseURL: "https://api.deepseek.com", timeout: 55000 })
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    provider,
    apiKey,
    model: task === "vision"
      ? process.env.OPENAI_VISION_MODEL || "gpt-4o-mini"
      : process.env.OPENAI_MODEL || "gpt-4o-mini",
    client: new OpenAI({ apiKey, timeout: 55000 })
  };
}

function normalizeProvider(value: string | undefined): AiProvider | null {
  const normalized = value?.trim().toLowerCase();
  return PROVIDER_ORDER.includes(normalized as AiProvider) ? (normalized as AiProvider) : null;
}

function uniqueProviders(values: Array<AiProvider | null>) {
  return Array.from(new Set(values.filter((value): value is AiProvider => Boolean(value))));
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
