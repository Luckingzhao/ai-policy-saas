import "server-only";
import { z } from "zod";

const nullableText = z.string().nullable().default(null);
const nullableNumber = z.number().finite().nullable().default(null);

export const policySchema = z.object({
  policy_holder: nullableText,
  insured: nullableText,
  beneficiaries: z.array(
    z.object({
      name: nullableText,
      relationship: nullableText,
      ratio: nullableNumber,
      type: nullableText
    })
  ).default([]),
  insurer: nullableText,
  main_policy_name: nullableText,
  product_category: z.enum(["年金", "增额寿", "重疾", "医疗"]).nullable().default(null),
  product_info: nullableText,
  insurance_type: z.enum(["重疾险", "医疗险", "意外险", "年金险", "寿险", "其他"]).nullable(),
  coverage_amount: nullableNumber,
  annual_premium: nullableNumber,
  payment_period: nullableText,
  effective_date: nullableText,
  paid_years: nullableNumber,
  remaining_years: nullableNumber,
  remaining_premium: nullableNumber,
  policy_service: nullableText,
  payment_account: nullableText,
  core_benefits: nullableText,
  major_disease_benefit: nullableText,
  moderate_disease_benefit: nullableText,
  mild_disease_benefit: nullableText,
  death_benefit: nullableText,
  total_disability_benefit: nullableText,
  terminal_illness_benefit: nullableText,
  other_benefits: nullableText,
  premium_waiver: nullableText,
  exclusions: nullableText,
  cash_value_returns: nullableText,
  product_constraints: nullableText,
  benefit_details: z.array(
    z.object({
      name: nullableText,
      type: nullableText,
      amount: nullableNumber,
      description: nullableText,
      waiting_period: nullableText
    })
  ).default([])
});

export const policyExtractionSchema = z.object({
  policies: z.array(policySchema),
  review_status: z.literal("pending_human_review").default("pending_human_review")
});

const evidenceItemSchema = z.object({
  product_name: z.string().nullable(),
  title: z.string().min(1),
  evidence: z.string().min(1),
  talking_point: z.string().min(1)
});

export const productAnalysisSchema = z.object({
  advantages: z.array(evidenceItemSchema),
  weaknesses: z.array(
    evidenceItemSchema.extend({
      risk_level: z.enum(["高", "中", "提示"])
    })
  ),
  fit_and_comparison: z.object({
    fit_customers: z.array(z.object({ profile: z.string().min(1), reason: z.string().min(1) })),
    unsuitable_customers: z.array(z.object({ profile: z.string().min(1), reason: z.string().min(1) })),
    comparison_advice: z.array(
      z.object({ scenario: z.string().min(1), recommendation: z.string().min(1), evidence: z.string().min(1) })
    ),
    broker_script: z.array(z.string().min(1))
  })
});

export type ProductAnalysis = z.infer<typeof productAnalysisSchema>;
