export type Plan = "free" | "plus" | "pro";

export interface PlanLimits {
  maxMembers: number;
  maxFlowMessages: number;
  maxRoutines: number;
  hasProactive: boolean;
  hasDocuments: boolean;
  hasSnapMap: boolean;
  hasThemes: boolean;
  hasExport: boolean;
  hasWeeklyDigest: boolean;
  hasExternalShare: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxMembers: 4,
    maxFlowMessages: 3,
    maxRoutines: 1,
    hasProactive: false,
    hasDocuments: false,
    hasSnapMap: false,
    hasThemes: false,
    hasExport: false,
    hasWeeklyDigest: false,
    hasExternalShare: false,
  },
  plus: {
    maxMembers: Infinity,
    maxFlowMessages: Infinity,
    maxRoutines: Infinity,
    hasProactive: true,
    hasDocuments: true,
    hasSnapMap: true,
    hasThemes: true,
    hasExport: true,
    hasWeeklyDigest: false,
    hasExternalShare: false,
  },
  pro: {
    maxMembers: Infinity,
    maxFlowMessages: Infinity,
    maxRoutines: Infinity,
    hasProactive: true,
    hasDocuments: true,
    hasSnapMap: true,
    hasThemes: true,
    hasExport: true,
    hasWeeklyDigest: true,
    hasExternalShare: true,
  },
};

export const PRICE_IDS = {
  plus_monthly: process.env.STRIPE_PRICE_PLUS_MONTHLY || "",
  plus_annual: process.env.STRIPE_PRICE_PLUS_ANNUAL || "",
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL || "",
};

export function getPlanLimits(plan: Plan | string | undefined): PlanLimits {
  if (plan === "plus" || plan === "pro") return PLAN_LIMITS[plan];
  return PLAN_LIMITS.free;
}

export function isActivePlan(plan: string | undefined, status: string | undefined): boolean {
  return (plan === "plus" || plan === "pro") && status === "active";
}
