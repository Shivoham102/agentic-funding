import {
  DecisionAgentConfigSchema,
  DecisionContextSchema,
  DecisionProposalSchema,
  decisionConstants,
  type DecisionAgentConfig,
  type DecisionContext,
  type DecisionProposal,
} from "./schemas.js";

export interface DecisionAgentRequest {
  context: DecisionContext;
  attempt: number;
  previousProposal?: DecisionProposal;
  violationCodes?: string[];
}

export interface DecisionAgent {
  readonly mode: "gemini" | "heuristic" | "heuristic_fallback";
  propose(request: DecisionAgentRequest): Promise<DecisionProposal>;
}

export class HeuristicDecisionAgent implements DecisionAgent {
  readonly mode: "heuristic" | "heuristic_fallback";

  constructor(mode: "heuristic" | "heuristic_fallback" = "heuristic") {
    this.mode = mode;
  }

  async propose(request: DecisionAgentRequest): Promise<DecisionProposal> {
    const context = DecisionContextSchema.parse(request.context);
    return DecisionProposalSchema.parse(
      buildHeuristicProposal(context, request.previousProposal, request.violationCodes ?? []),
    );
  }
}

export function buildHeuristicProposal(
  context: DecisionContext,
  previousProposal: DecisionProposal | undefined,
  violationCodes: string[],
): DecisionProposal {
  const requestedAmount = context.proposal.requested_amount_usd;
  const deterministicCap = Math.min(
    requestedAmount,
    context.funding_package_draft.recommended_amount_usd,
    context.funding_package_draft.treasury_capacity_usd,
    context.treasury_snapshot.available_for_new_commitments_usd,
    context.policy.treasury_total_usd * context.policy.per_proposal_cap_ratio,
  );
  const highRiskReject =
    context.scorecard.risk_classification === "high" &&
    (context.scorecard.overall_score < context.policy.high_risk_reject_below_score ||
      context.scorecard.confidence < context.policy.high_risk_min_confidence);

  let approvedAmount = Math.max(0, roundCurrency(deterministicCap));
  if (
    previousProposal &&
    violationCodes.some((code) =>
      [
        "APPROVED_EXCEEDS_REQUESTED",
        "APPROVED_EXCEEDS_DETERMINISTIC_DRAFT",
        "APPROVED_EXCEEDS_TREASURY_CAPACITY",
        "APPROVED_EXCEEDS_PER_PROPOSAL_CAP",
        "SECTOR_EXPOSURE_CAP_EXCEEDED",
      ].includes(code),
    )
  ) {
    approvedAmount = Math.max(0, roundCurrency(deterministicCap));
  }

  let decision: DecisionProposal["decision"];
  if (highRiskReject || approvedAmount <= 0 || context.funding_package_draft.recommendation_label === "reject") {
    decision = "reject";
    approvedAmount = 0;
  } else if (
    approvedAmount >= requestedAmount * 0.9 &&
    context.scorecard.overall_score >= context.policy.minimum_accept_score &&
    context.scorecard.confidence >= context.policy.minimum_confidence &&
    context.scorecard.risk_classification !== "high"
  ) {
    decision = "accept";
  } else {
    decision = "accept_reduced";
  }

  if (context.scorecard.risk_classification === "high" && decision === "accept") {
    decision = "accept_reduced";
  }
  if (violationCodes.includes("ACCEPT_LABEL_REQUIRES_NEAR_FULL_AMOUNT")) {
    decision = "accept_reduced";
  }
  if (violationCodes.includes("REJECT_MUST_ZERO")) {
    decision = "reject";
    approvedAmount = 0;
  }

  const milestones =
    decision === "reject"
      ? []
      : buildMilestones(context, approvedAmount, previousProposal, violationCodes);

  const thinCategories = context.evidence.thin_evidence_categories;
  const uncertaintyFlags = [
    ...(thinCategories.length > 0 ? [`thin_evidence:${thinCategories.join(",")}`] : []),
    ...(context.evidence.contradiction_flag_count > 0 ? ["contradictions_present"] : []),
    ...(context.scorecard.risk_classification === "high" ? ["high_risk"] : []),
    ...(context.treasury_snapshot.available_for_new_commitments_usd < requestedAmount
      ? ["treasury_constrained"]
      : []),
  ].slice(0, 8);

  return {
    schema_version: decisionConstants.decisionSchemaVersion,
    decision,
    approved_amount: approvedAmount,
    milestones,
    rationale: buildRationale(context, decision, approvedAmount),
    score_inputs_used: [
      "overall_score",
      "confidence",
      "risk_classification",
      "subscores.team_quality",
      "subscores.market_opportunity",
      "subscores.product_feasibility",
      "subscores.traction_signals",
      "funding_package_draft.recommended_amount_usd",
      "treasury_snapshot.available_for_new_commitments_usd",
    ],
    assumptions: [
      ...(context.funding_package_draft.treasury_capacity_usd > 0
        ? ["Treasury capacity remains available until escrow creation."]
        : []),
      ...(thinCategories.length > 0
        ? ["Thin evidence categories should be revisited before follow-on funding."]
        : []),
    ].slice(0, 8),
    requested_revisions:
      violationCodes.length > 0
        ? [`Revised after verifier violations: ${violationCodes.join(", ").toLowerCase()}.`]
        : undefined,
    confidence: clampConfidence(context.scorecard.confidence, thinCategories.length, context.evidence.contradiction_flag_count),
    uncertainty_flags: uncertaintyFlags,
  };
}

export function normalizeDecisionAgentConfig(input: unknown): DecisionAgentConfig {
  return DecisionAgentConfigSchema.parse(input);
}

function buildMilestones(
  context: DecisionContext,
  approvedAmount: number,
  previousProposal: DecisionProposal | undefined,
  violationCodes: string[],
): DecisionProposal["milestones"] {
  const shouldRebuild =
    !previousProposal ||
    violationCodes.some((code) =>
      [
        "MILESTONE_SUM_MISMATCH",
        "MILESTONE_AMOUNT_NON_POSITIVE",
        "MILESTONE_COUNT_OUT_OF_RANGE",
        "MILESTONE_DEADLINES_NON_MONOTONE",
        "MILESTONE_DEADLINE_INVALID",
        "REJECT_MUST_HAVE_NO_MILESTONES",
      ].includes(code),
    );

  if (!shouldRebuild && previousProposal) {
    return rebalanceMilestones(previousProposal.milestones, approvedAmount);
  }

  if (context.funding_package_draft.milestones.length > 0) {
    const draftMilestones = context.funding_package_draft.milestones
      .slice(0, context.policy.max_milestone_count)
      .map((item) => ({
        amount: item.amount_usd,
        deliverable_type: item.deliverable_type,
        verification_method: item.verification_method,
        deadline: item.deadline,
      }));
    return rebalanceMilestones(draftMilestones, approvedAmount);
  }

  const requestedMilestones = context.proposal.requested_milestones.slice(0, context.policy.max_milestone_count);
  if (requestedMilestones.length > 0) {
    const ratios = normalizeRatios(
      requestedMilestones.map((item) => item.requested_release_ratio ?? 1 / requestedMilestones.length),
    );
    const amounts = allocateRoundedCurrency(approvedAmount, ratios);
    return requestedMilestones.map((item, index) => ({
      amount: amounts[index] ?? 0,
      deliverable_type: inferDeliverableType(item.name, item.description, context.proposal.stage),
      verification_method: inferVerificationMethod(item.name, item.description, context.proposal.stage),
      deadline: item.target_days ? `P${item.target_days}D` : `P${35 * (index + 1)}D`,
    }));
  }

  const templates = stageTemplates(context.proposal.stage)
    .slice(0, context.policy.max_milestone_count)
    .slice(0, Math.max(context.policy.min_milestone_count, 3));
  const amounts = allocateRoundedCurrency(
    approvedAmount,
    normalizeRatios(templates.map((item) => item.ratio)),
  );
  return templates.map((item, index) => ({
    amount: amounts[index] ?? 0,
    deliverable_type: item.deliverable_type,
    verification_method: item.verification_method,
    deadline: `P${item.base_day}D`,
  }));
}

function stageTemplates(stage: DecisionContext["proposal"]["stage"]) {
  const templates = {
    idea: [
      { ratio: 0.25, deliverable_type: "technical_spec", verification_method: "documentation_review", base_day: 21 },
      { ratio: 0.35, deliverable_type: "prototype_demo", verification_method: "repository_activity", base_day: 49 },
      { ratio: 0.4, deliverable_type: "user_validation", verification_method: "committee_validation", base_day: 84 },
    ],
    mvp: [
      { ratio: 0.2, deliverable_type: "prototype_demo", verification_method: "repository_activity", base_day: 21 },
      { ratio: 0.35, deliverable_type: "mvp_release", verification_method: "deployment_proof", base_day: 56 },
      { ratio: 0.45, deliverable_type: "integration_proof", verification_method: "kpi_evidence", base_day: 98 },
    ],
    beta: [
      { ratio: 0.18, deliverable_type: "beta_release", verification_method: "deployment_proof", base_day: 21 },
      { ratio: 0.27, deliverable_type: "feature_release", verification_method: "repository_activity", base_day: 49 },
      { ratio: 0.25, deliverable_type: "usage_growth", verification_method: "kpi_evidence", base_day: 84 },
      { ratio: 0.3, deliverable_type: "scale_readiness", verification_method: "committee_validation", base_day: 126 },
    ],
    live: [
      { ratio: 0.15, deliverable_type: "feature_release", verification_method: "deployment_proof", base_day: 21 },
      { ratio: 0.25, deliverable_type: "reliability_kpis", verification_method: "kpi_evidence", base_day: 56 },
      { ratio: 0.3, deliverable_type: "revenue_growth", verification_method: "financial_review", base_day: 98 },
      { ratio: 0.3, deliverable_type: "scale_readiness", verification_method: "committee_validation", base_day: 140 },
    ],
    scaling: [
      { ratio: 0.15, deliverable_type: "reliability_kpis", verification_method: "kpi_evidence", base_day: 21 },
      { ratio: 0.25, deliverable_type: "revenue_growth", verification_method: "financial_review", base_day: 56 },
      { ratio: 0.25, deliverable_type: "scale_readiness", verification_method: "deployment_proof", base_day: 98 },
      { ratio: 0.35, deliverable_type: "governance_controls", verification_method: "committee_validation", base_day: 140 },
    ],
  } as const;
  return templates[stage];
}

function inferDeliverableType(name: string, description: string, stage: DecisionContext["proposal"]["stage"]) {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes("revenue")) return "revenue_growth";
  if (text.includes("usage") || text.includes("growth")) return "usage_growth";
  if (text.includes("reliability")) return "reliability_kpis";
  if (text.includes("governance")) return "governance_controls";
  if (text.includes("integration")) return "integration_proof";
  if (text.includes("demo") || text.includes("prototype")) return "prototype_demo";
  if (text.includes("beta")) return "beta_release";
  if (text.includes("mvp")) return "mvp_release";
  if (stage === "idea") return "technical_spec";
  if (stage === "mvp") return "mvp_release";
  return "feature_release";
}

function inferVerificationMethod(name: string, description: string, stage: DecisionContext["proposal"]["stage"]) {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes("revenue") || text.includes("financial")) return "financial_review";
  if (text.includes("kpi") || text.includes("growth") || text.includes("usage")) return "kpi_evidence";
  if (text.includes("deploy") || text.includes("launch")) return "deployment_proof";
  if (text.includes("repo") || text.includes("code") || text.includes("build")) return "repository_activity";
  if (stage === "idea") return "documentation_review";
  return "committee_validation";
}

function buildRationale(
  context: DecisionContext,
  decision: DecisionProposal["decision"],
  approvedAmount: number,
) {
  if (decision === "reject") {
    return `Rejected because the deterministic draft and current policy bounds do not support funding above ${formatCurrency(approvedAmount)}.`;
  }
  const score = context.scorecard.overall_score.toFixed(1);
  const risk = context.scorecard.risk_classification;
  if (decision === "accept") {
    return `Accepted because score ${score}, ${risk} risk, and treasury capacity support near-full funding at ${formatCurrency(approvedAmount)}.`;
  }
  return `Approved with reduced funding at ${formatCurrency(approvedAmount)} because score ${score}, ${risk} risk, or treasury policy constrain the request.`;
}

function clampConfidence(confidence: number, thinCount: number, contradictionCount: number) {
  return Math.max(0, Math.min(1, round(confidence - thinCount * 0.025 - contradictionCount * 0.03, 4)));
}

function rebalanceMilestones(
  milestones: DecisionProposal["milestones"],
  approvedAmount: number,
) {
  if (milestones.length === 0 || approvedAmount <= 0) return [];
  const ratios = normalizeRatios(milestones.map((item) => item.amount));
  const amounts = allocateRoundedCurrency(approvedAmount, ratios);
  return milestones.map((item, index) => ({
    ...item,
    amount: amounts[index] ?? 0,
  }));
}

function allocateRoundedCurrency(total: number, ratios: number[]) {
  if (total <= 0 || ratios.length === 0) return [];
  const rounded = ratios.map((ratio, index) =>
    index === ratios.length - 1 ? 0 : roundCurrency(total * ratio),
  );
  const allocated = rounded.reduce((sum, value) => sum + value, 0);
  rounded[rounded.length - 1] = round(total - allocated, 2);
  return rounded;
}

function normalizeRatios(values: number[]) {
  const positive = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = positive.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return positive.map(() => 1 / positive.length);
  }
  return positive.map((value) => value / total);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function roundCurrency(value: number, granularity = 250) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value / granularity) * granularity;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
