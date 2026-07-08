export const PLAN_LIMITS = {
  free: {
    label: "体验版",
    monthlyReportLimit: 3
  },
  experience: {
    label: "体验版",
    monthlyReportLimit: 3
  },
  professional: {
    label: "智惠版",
    monthlyReportLimit: 150
  },
  zhihui: {
    label: "智惠版",
    monthlyReportLimit: 150
  },
  team: {
    label: "智优版",
    monthlyReportLimit: 600
  },
  zhiyou: {
    label: "智优版",
    monthlyReportLimit: 600
  }
} as const;

export type PlanCode = keyof typeof PLAN_LIMITS;

export function normalizePlanCode(value?: string | null): PlanCode {
  if (value === "experience" || value === "professional" || value === "zhihui" || value === "team" || value === "zhiyou") return value;
  return "free";
}

export function getPlanLimit(planCode?: string | null, storedLimit?: number | null) {
  void storedLimit;
  const normalized = normalizePlanCode(planCode);
  return PLAN_LIMITS[normalized].monthlyReportLimit;
}

export function getPlanLabel(planCode?: string | null) {
  return PLAN_LIMITS[normalizePlanCode(planCode)].label;
}

export function isUsageLimitDisabled() {
  return process.env.NEXT_PUBLIC_DISABLE_USAGE_LIMITS === "true";
}

export function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}
