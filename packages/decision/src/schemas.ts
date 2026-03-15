import { z } from "zod";

const DECISION_SCHEMA_VERSION = "decision-v1" as const;
const VERIFIER_SCHEMA_VERSION = "verifier-v1" as const;
const REVIEW_SCHEMA_VERSION = "decision-review-v1" as const;

const PROJECT_CATEGORIES = [
  "defi",
  "infrastructure",
  "developer_tools",
  "consumer",
  "other",
] as const;

const PROJECT_STAGES = ["idea", "mvp", "beta", "live", "scaling"] as const;
const DECISION_LABELS = ["reject", "accept", "accept_reduced"] as const;
const RISK_LABELS = ["low", "medium", "high"] as const;
const AGENT_MODES = ["gemini", "heuristic", "heuristic_fallback"] as const;
const DELIVERABLE_TYPES = [
  "technical_spec",
  "prototype_demo",
  "mvp_release",
  "integration_proof",
  "user_validation",
  "beta_release",
  "feature_release",
  "usage_growth",
  "reliability_kpis",
  "revenue_growth",
  "scale_readiness",
  "governance_controls",
] as const;
const VERIFICATION_METHODS = [
  "documentation_review",
  "repository_activity",
  "deployment_proof",
  "kpi_evidence",
  "committee_validation",
  "financial_review",
] as const;

const RequestedMilestoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  target_days: z.number().int().nonnegative().optional(),
  requested_release_ratio: z.number().min(0).max(1).optional(),
});

export const DecisionProposalSchema = z.object({
  schema_version: z.literal(DECISION_SCHEMA_VERSION).default(DECISION_SCHEMA_VERSION),
  decision: z.enum(DECISION_LABELS),
  approved_amount: z.number().finite().nonnegative(),
  milestones: z.array(
    z.object({
      amount: z.number().finite().nonnegative(),
      deliverable_type: z.enum(DELIVERABLE_TYPES),
      verification_method: z.enum(VERIFICATION_METHODS),
      deadline: z.string().min(1),
    }),
  ),
  rationale: z.string().min(12).max(400),
  score_inputs_used: z.array(z.string().min(1)).min(1).max(12),
  assumptions: z.array(z.string().min(1)).max(8).default([]),
  requested_revisions: z.array(z.string().min(1)).max(6).optional(),
  confidence: z.number().min(0).max(1),
  uncertainty_flags: z.array(z.string().min(1)).max(8).default([]),
});

export const ViolationSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().min(1).optional(),
});

export const VerifierResultSchema = z.object({
  schema_version: z.literal(VERIFIER_SCHEMA_VERSION).default(VERIFIER_SCHEMA_VERSION),
  passed: z.boolean(),
  approved_for_execution: z.boolean(),
  violation_codes: z.array(z.string().min(1)).default([]),
  violations: z.array(ViolationSchema).default([]),
  check_results: z.array(
    z.object({
      code: z.string().min(1),
      passed: z.boolean(),
      message: z.string().min(1),
    }),
  ),
});

export const DecisionReviewSchema = z.object({
  schema_version: z.literal(REVIEW_SCHEMA_VERSION).default(REVIEW_SCHEMA_VERSION),
  approved_for_execution: z.boolean(),
  agent_mode_used: z.enum(AGENT_MODES),
  decision_package: DecisionProposalSchema,
  verifier_result: VerifierResultSchema,
  revision_attempts: z.number().int().nonnegative(),
  attempts: z.array(
    z.object({
      attempt: z.number().int().positive(),
      agent_mode: z.enum(AGENT_MODES),
      decision_package: DecisionProposalSchema,
      verifier_result: VerifierResultSchema,
    }),
  ),
  warnings: z.array(z.string().min(1)).default([]),
});

export const DecisionContextSchema = z.object({
  proposal: z.object({
    proposal_id: z.string().min(1).optional(),
    name: z.string().min(1),
    category: z.enum(PROJECT_CATEGORIES),
    stage: z.enum(PROJECT_STAGES),
    requested_amount_usd: z.number().finite().nonnegative(),
    short_description: z.string().optional(),
    description: z.string().optional(),
    requested_milestones: z.array(RequestedMilestoneSchema).default([]),
  }),
  evidence: z.object({
    facts_count: z.number().int().nonnegative().default(0),
    sources_count: z.number().int().nonnegative().default(0),
    overall_confidence: z.number().min(0).max(1).default(0),
    thin_evidence_categories: z.array(z.string().min(1)).default([]),
    contradiction_flag_count: z.number().int().nonnegative().default(0),
    raw_payload_hash: z.string().optional(),
  }),
  scorecard: z.object({
    overall_score: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1),
    risk_classification: z.enum(RISK_LABELS),
    reason_codes: z.array(z.string().min(1)).default([]),
    subscores: z.object({
      team_quality: z.number().min(0).max(100),
      market_opportunity: z.number().min(0).max(100),
      product_feasibility: z.number().min(0).max(100),
      capital_efficiency: z.number().min(0).max(100),
      traction_signals: z.number().min(0).max(100),
      risk_indicators: z.number().min(0).max(100),
    }),
  }),
  funding_package_draft: z.object({
    recommendation_label: z.enum(DECISION_LABELS),
    requested_amount_usd: z.number().finite().nonnegative(),
    recommended_amount_usd: z.number().finite().nonnegative(),
    treasury_capacity_usd: z.number().finite().nonnegative(),
    rationale_codes: z.array(z.string().min(1)).default([]),
    milestones: z.array(
      z.object({
        index: z.number().int().positive(),
        amount_usd: z.number().finite().nonnegative(),
        deliverable_type: z.enum(DELIVERABLE_TYPES),
        deadline: z.string().min(1),
        verification_method: z.enum(VERIFICATION_METHODS),
        rationale_codes: z.array(z.string().min(1)).default([]),
      }),
    ),
  }),
  treasury_snapshot: z.object({
    total_capital_usd: z.number().finite().nonnegative(),
    min_hot_reserve_usd: z.number().finite().nonnegative(),
    hot_reserve_usd: z.number().finite().nonnegative(),
    committed_reserve_usd: z.number().finite().nonnegative(),
    idle_treasury_usd: z.number().finite().nonnegative(),
    strategic_buffer_usd: z.number().finite().nonnegative(),
    available_for_new_commitments_usd: z.number().finite().nonnegative(),
  }),
  portfolio_context: z.object({
    active_approved_total_usd: z.number().finite().nonnegative().default(0),
    active_project_count: z.number().int().nonnegative().default(0),
    sector_exposure_usd: z.record(z.string(), z.number().finite().nonnegative()).default({}),
  }),
  policy: z.object({
    treasury_total_usd: z.number().finite().nonnegative(),
    strategic_buffer_usd: z.number().finite().nonnegative(),
    min_hot_reserve_usd: z.number().finite().nonnegative(),
    per_proposal_cap_ratio: z.number().min(0).max(1).default(0.2),
    sector_exposure_cap_ratio: z.number().min(0).max(1).default(0.35),
    minimum_fundable_score: z.number().min(0).max(100).default(60),
    minimum_accept_score: z.number().min(0).max(100).default(78),
    minimum_confidence: z.number().min(0).max(1).default(0.45),
    high_risk_reject_below_score: z.number().min(0).max(100).default(72),
    high_risk_min_confidence: z.number().min(0).max(1).default(0.55),
    max_revision_attempts: z.number().int().min(1).max(5).default(3),
    min_milestone_count: z.number().int().min(1).max(5).default(2),
    max_milestone_count: z.number().int().min(2).max(8).default(5),
  }),
});

export const DecisionAgentConfigSchema = z.object({
  mode: z.enum(AGENT_MODES).default("gemini"),
  apiKey: z.string().optional(),
  baseUrl: z.string().default("https://generativelanguage.googleapis.com/v1beta"),
  model: z.string().default("gemini-3.1-flash-lite-preview"),
  timeoutMs: z.number().int().positive().default(45_000),
  maxRetries: z.number().int().min(0).max(2).default(0),
  minRequestIntervalSeconds: z.number().min(0).default(5),
  allowHeuristicFallback: z.boolean().default(true),
});

export type DecisionContext = z.infer<typeof DecisionContextSchema>;
export type DecisionProposal = z.infer<typeof DecisionProposalSchema>;
export type VerifierResult = z.infer<typeof VerifierResultSchema>;
export type DecisionReview = z.infer<typeof DecisionReviewSchema>;
export type DecisionAgentConfig = z.infer<typeof DecisionAgentConfigSchema>;

export const decisionConstants = {
  decisionSchemaVersion: DECISION_SCHEMA_VERSION,
  verifierSchemaVersion: VERIFIER_SCHEMA_VERSION,
  reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
};
