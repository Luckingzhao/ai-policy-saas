import "server-only";
import { z } from "zod";
import { AiConfigurationError, AiOutputValidationError, AiRetryableError, classifyAiFailure } from "@/lib/ai/errors";
import { callOpenClaw } from "@/lib/ai/providers/openclaw";
import { callOpenRouter } from "@/lib/ai/providers/openrouter";
import { safeAiErrorMessage } from "@/lib/ai/redaction";
import { getTaskRoute } from "@/lib/ai/task-router";
import type { AiProvider, RunAiTaskInput, RunAiTaskResult } from "@/lib/ai/types";

export type { AiTaskType, RunAiTaskInput, RunAiTaskResult } from "@/lib/ai/types";

export async function runAiTask<TSchema extends z.ZodTypeAny>(
  input: RunAiTaskInput<TSchema>
): Promise<RunAiTaskResult<TSchema>> {
  assertServerContext(input.tenantId, input.userId);
  const route = getTaskRoute(input.task);
  if (route.manualOnly) {
    throw new AiConfigurationError("专家复核只能通过受保护的人工确认接口触发，当前统一自动入口禁止调用。");
  }
  if (input.images?.length && !route.allowsImages) {
    throw new AiConfigurationError(`任务 ${input.task} 不允许图片输入。`);
  }

  const provider = resolveProvider();
  let lastError: unknown;

  for (let index = 0; index < route.models.length; index += 1) {
    const model = route.models[index];
    try {
      const content = await callProvider(provider, {
        model,
        messages: input.messages,
        images: input.images,
        tenantId: input.tenantId,
        userId: input.userId
      });
      const json = parseJson(content);
      const parsed = input.responseSchema.safeParse(json);
      if (!parsed.success) {
        throw new AiOutputValidationError("模型返回的 JSON 未通过结构校验，已转入人工复核。", {
          cause: parsed.error
        });
      }
      return { data: parsed.data, provider, model, reviewStatus: "pending_human_review" };
    } catch (error) {
      lastError = error;
      const mayFallback = classifyAiFailure(error) === "fallback_allowed" && index < route.models.length - 1;
      if (!mayFallback) throw normalizePublicError(error);
    }
  }

  throw normalizePublicError(lastError);
}

function resolveProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || "openrouter";
  if (provider === "openrouter" || provider === "openclaw") return provider;
  throw new AiConfigurationError(`不支持的 AI_PROVIDER：${provider}`);
}

function callProvider(provider: AiProvider, request: Parameters<typeof callOpenRouter>[0]) {
  return provider === "openclaw" ? callOpenClaw(request) : callOpenRouter(request);
}

function parseJson(content: string) {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!normalized) throw new AiOutputValidationError("模型未返回 JSON，已转入人工复核。");
  try {
    return JSON.parse(normalized) as unknown;
  } catch (error) {
    throw new AiOutputValidationError("模型返回的内容不是有效 JSON，已转入人工复核。", { cause: error });
  }
}

function assertServerContext(tenantId: string, userId: string) {
  if (!tenantId.trim() || !userId.trim()) {
    throw new AiConfigurationError("AI 请求缺少 tenantId 或 userId。");
  }
}

function normalizePublicError(error: unknown) {
  if (error instanceof AiOutputValidationError || error instanceof AiConfigurationError) return error;
  if (classifyAiFailure(error) === "fallback_allowed") {
    return new AiRetryableError("AI 服务暂时不可用，请稍后重试或转入人工复核。", { cause: error });
  }
  return new Error(`AI 服务调用失败：${safeAiErrorMessage(error)}`);
}
