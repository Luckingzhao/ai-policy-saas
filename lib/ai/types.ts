import "server-only";
import type OpenAI from "openai";
import type { z } from "zod";

export type AiTaskType =
  | "policy_text_extraction"
  | "policy_image_extraction"
  | "policy_validation"
  | "family_gap_analysis"
  | "final_report_generation"
  | "product_analysis"
  | "customer_summary"
  | "customer_tagging"
  | "title_generation"
  | "background_classification"
  | "expert_review";

export type AiProvider = "openrouter" | "openclaw";

export type AiImage = {
  dataUrl: string;
  detail?: "auto" | "low" | "high";
};

export type RunAiTaskInput<TSchema extends z.ZodTypeAny> = {
  task: AiTaskType;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  images?: AiImage[];
  responseSchema: TSchema;
  tenantId: string;
  userId: string;
};

export type RunAiTaskResult<TSchema extends z.ZodTypeAny> = {
  data: z.infer<TSchema>;
  provider: AiProvider;
  model: string;
  reviewStatus: "pending_human_review";
};

export type ProviderRequest = {
  model: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  images?: AiImage[];
  tenantId: string;
  userId: string;
};

export type TaskRoute = {
  models: readonly string[];
  allowsImages: boolean;
  manualOnly: boolean;
};
