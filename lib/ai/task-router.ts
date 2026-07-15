import "server-only";
import { AiConfigurationError } from "@/lib/ai/errors";
import type { AiTaskType, TaskRoute } from "@/lib/ai/types";

const FAST_TEXT_TASKS = new Set<AiTaskType>([
  "policy_text_extraction",
  "customer_summary",
  "customer_tagging",
  "title_generation",
  "background_classification"
]);

const PRO_TEXT_TASKS = new Set<AiTaskType>([
  "policy_validation",
  "family_gap_analysis",
  "final_report_generation",
  "product_analysis"
]);

export function getTaskRoute(task: AiTaskType): TaskRoute {
  if (task === "policy_image_extraction") {
    return {
      models: uniqueModels([
        process.env.AI_VISION_MODEL_PRIMARY || "google/gemini-3.1-pro-preview",
        process.env.AI_VISION_MODEL_FALLBACK || "qwen/qwen3-vl-235b-a22b-instruct"
      ]),
      allowsImages: true,
      manualOnly: false
    };
  }

  if (FAST_TEXT_TASKS.has(task)) {
    return {
      models: uniqueModels([
        process.env.AI_TEXT_MODEL_FAST || "deepseek/deepseek-v4-flash",
        process.env.AI_TEXT_MODEL_PRO || "deepseek/deepseek-v4-pro"
      ]),
      allowsImages: false,
      manualOnly: false
    };
  }

  if (PRO_TEXT_TASKS.has(task)) {
    return {
      models: [process.env.AI_TEXT_MODEL_PRO || "deepseek/deepseek-v4-pro"],
      allowsImages: false,
      manualOnly: false
    };
  }

  if (task === "expert_review") {
    return {
      models: [process.env.AI_EXPERT_REVIEW_MODEL || "openai/gpt-5.6-terra"],
      allowsImages: false,
      manualOnly: true
    };
  }

  throw new AiConfigurationError(`未配置 AI 任务：${task}`);
}

function uniqueModels(models: string[]) {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}
