import { z } from "zod";

import { FeatureVectorSchema, type Features } from "./features.js";

const SCORECARD_SCHEMA_VERSION = "scorecard-v1" as const;
const FUNDING_PACKAGE_SCHEMA_VERSION = "funding-package-v1" as const;

const SCORE_DIMENSIONS = [
  "team_quality",
  "market_opportunity",
  "product_feasibility",
  "capital_efficiency",
  "traction_signals",
  "risk_indicators",
] as const;

const RISK_TOLERANCES = ["conservative", "balanced", "aggressive"] as const;
const RISK_CLASSIFICATIONS = ["low", "medium", "high"] as const;
const FUNDING_RECOMMENDATION_LABELS = ["reject", "accept", "accept_reduced"] as const;
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

const SCORE_DIMENSION_SCHEMA = z.enum(SCORE_DIMENSIONS);
const RISK_TOLERANCE_SCHEMA = z.enum(RISK_TOLERANCES);
const RISK_CLASSIFICATION_SCHEMA = z.enum(RISK_CLASSIFICATIONS);
const FUNDING_RECOMMENDATION_LABEL_SCHEMA = z.enum(FUNDING_RECOMMENDATION_LABELS);
const DELIVERABLE_TYPE_SCHEMA = z.enum(DELIVERABLE_TYPES);
const VERIFICATION_METHOD_SCHEMA = z.enum(VERIFICATION_METHODS);

const DEFAULT_SUBSCORE_WEIGHTS = {
  team_quality: 0.2,
  market_opportunity: 0.2,
  product_feasibility: 0.2,
  capital_efficiency: 0.15,
  traction_signals: 0.15,
  risk_indicators: 0.1,
} satisfies Record<(typeof SCORE_DIMENSIONS)[number], number>;

const OwnerPrefsSchema = z.object({
  subscore_weights: z
    .object({
      team_quality: z.number().min(0).max(1).optional(),
      market_opportunity: z.number().min(0).max(1).optional(),
      product_feasibility: z.number().min(0).max(1).optional(),
      capital_efficiency: z.number().min(0).max(1).optional(),
      traction_signals: z.number().min(0).max(1).optional(),
      risk_indicators: z.number().min(0).max(1).optional(),
    })
    .default({}),
  risk_tolerance: RISK_TOLERANCE_SCHEMA.default("balanced"),
  minimum_confidence: z.number().min(0).max(1).default(0.45),
  minimum_overall_score: z.number().min(0).max(100).default(60),
  minimum_ticket_usd: z.number().finite().nonnegative().default(10000),
  target_initial_release_ratio: z.number().min(0.1).max(0.5).default(0.2),
  default_milestone_count: z.number().int().min(2).max(5).default(3),
  max_milestone_count: z.number().int().min(2).max(6).default(4),
  max_single_milestone_ratio: z.number().min(0.2).max(0.7).default(0.45),
  milestone_window_days: z.number().int().min(21).max(120).default(35),
});

const ScoreSubscoresSchema = z.object({
  team_quality: z.number().min(0).max(100),
  market_opportunity: z.number().min(0).max(100),
  product_feasibility: z.number().min(0).max(100),
  capital_efficiency: z.number().min(0).max(100),
  traction_signals: z.number().min(0).max(100),
  risk_indicators: z.number().min(0).max(100),
});

const DimensionReasonCodesSchema = z.object({
  team_quality: z.array(z.string().min(1)),
  market_opportunity: z.array(z.string().min(1)),
  product_feasibility: z.array(z.string().min(1)),
  capital_efficiency: z.array(z.string().min(1)),
  traction_signals: z.array(z.string().min(1)),
  risk_indicators: z.array(z.string().min(1)),
});

const ProposalContextSchema = z.object({
  proposal_id: z.string().min(1).optional(),
  requested_amount_usd: z.number().finite().nonnegative(),
  requested_milestone_count: z.number().int().nonnegative(),
  stage: FeatureVectorSchema.shape.categorical.shape.stage,
  category: FeatureVectorSchema.shape.categorical.shape.category,
  team_size: z.number().int().nonnegative(),
  thin_evidence_categories: z.array(z.string().min(1)),
  missing_fields_count: z.number().int().nonnegative(),
  contradiction_flag_count: z.number().int().nonnegative(),
});

const RiskBandSchema = z.object({
  classification: RISK_CLASSIFICATION_SCHEMA,
  score: z.number().min(0).max(100),
  reason_codes: z.array(z.string().min(1)),
});

const ScorecardSchema = z.object({
  schema_version: z.literal(SCORECARD_SCHEMA_VERSION),
  proposal_id: z.string().min(1).optional(),
  subscores: ScoreSubscoresSchema,
  dimension_reason_codes: DimensionReasonCodesSchema,
  overall_score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  confidence_level: z.number().min(0).max(1),
  risk_band: RiskBandSchema,
  risk_classification: RISK_CLASSIFICATION_SCHEMA,
  reason_codes: z.array(z.string().min(1)),
  owner_preferences_used: OwnerPrefsSchema,
  proposal_context: ProposalContextSchema,
  missingness_summary: FeatureVectorSchema.shape.missingness_summary,
});

const TreasurySnapshotSchema = z.object({
  hot_reserve_usd: z.number().finite().nonnegative(),
  committed_reserve_usd: z.number().finite().nonnegative().default(0),
  idle_treasury_usd: z.number().finite().nonnegative(),
  strategic_buffer_usd: z.number().finite().nonnegative(),
  available_for_new_commitments_usd: z.number().finite().nonnegative().optional(),
});

const FundingPackageMilestoneSchema = z.object({
  index: z.number().int().positive(),
  amount_usd: z.number().finite().nonnegative(),
  deliverable_type: DELIVERABLE_TYPE_SCHEMA,
  deadline: z.string().min(1),
  verification_method: VERIFICATION_METHOD_SCHEMA,
  rationale_codes: z.array(z.string().min(1)),
});

const FundingPackageDraftSchema = z.object({
  schema_version: z.literal(FUNDING_PACKAGE_SCHEMA_VERSION),
  proposal_id: z.string().min(1).optional(),
  recommendation_label: FUNDING_RECOMMENDATION_LABEL_SCHEMA,
  requested_amount_usd: z.number().finite().nonnegative(),
  recommended_amount_usd: z.number().finite().nonnegative(),
  treasury_capacity_usd: z.number().finite().nonnegative(),
  rationale_codes: z.array(z.string().min(1)),
  milestones: z.array(FundingPackageMilestoneSchema),
});

export type OwnerPrefs = z.infer<typeof OwnerPrefsSchema>;
export type Scorecard = z.infer<typeof ScorecardSchema>;
export type TreasurySnapshot = z.infer<typeof TreasurySnapshotSchema>;
export type FundingPackageDraft = z.infer<typeof FundingPackageDraftSchema>;

export function score(featuresInput: unknown, ownerPrefsInput: unknown = {}): Scorecard {
  const features = FeatureVectorSchema.parse(featuresInput);
  const ownerPrefs = normalizeOwnerPrefs(ownerPrefsInput);

  const confidence = computeConfidence(features);
  const teamQuality = computeTeamQuality(features);
  const marketOpportunity = computeMarketOpportunity(features);
  const productFeasibility = computeProductFeasibility(features);
  const capitalEfficiency = computeCapitalEfficiency(features);
  const tractionSignals = computeTractionSignals(features);
  const riskComputation = computeRisk(features, confidence, capitalEfficiency, ownerPrefs.risk_tolerance);

  const dimensionReasonCodes = {
    team_quality: deriveTeamReasonCodes(features, teamQuality),
    market_opportunity: deriveMarketReasonCodes(features, marketOpportunity),
    product_feasibility: deriveProductReasonCodes(features, productFeasibility),
    capital_efficiency: deriveCapitalReasonCodes(features, capitalEfficiency),
    traction_signals: deriveTractionReasonCodes(features, tractionSignals),
    risk_indicators: riskComputation.reason_codes,
  };

  const subscores = ScoreSubscoresSchema.parse({
    team_quality: teamQuality,
    market_opportunity: marketOpportunity,
    product_feasibility: productFeasibility,
    capital_efficiency: capitalEfficiency,
    traction_signals: tractionSignals,
    risk_indicators: riskComputation.risk_indicator_score,
  });

  const overallScore = round(
    SCORE_DIMENSIONS.reduce(
      (sum, key) => sum + subscores[key] * (ownerPrefs.subscore_weights[key] ?? DEFAULT_SUBSCORE_WEIGHTS[key]),
      0,
    ),
  );

  return ScorecardSchema.parse({
    schema_version: SCORECARD_SCHEMA_VERSION,
    proposal_id: features.proposal_id,
    subscores,
    dimension_reason_codes: dimensionReasonCodes,
    overall_score: overallScore,
    confidence,
    confidence_level: confidence,
    risk_band: {
      classification: riskComputation.classification,
      score: riskComputation.raw_risk_score,
      reason_codes: riskComputation.reason_codes,
    },
    risk_classification: riskComputation.classification,
    reason_codes: uniqueStrings([
      ...Object.values(dimensionReasonCodes).flat(),
      ...deriveTopLevelReasonCodes(subscores, confidence, riskComputation.classification, features),
    ]),
    owner_preferences_used: ownerPrefs,
    proposal_context: {
      proposal_id: features.proposal_id,
      requested_amount_usd: features.numeric.requested_funding_usd,
      requested_milestone_count: features.numeric.milestone_count,
      stage: features.categorical.stage,
      category: features.categorical.category,
      team_size: features.numeric.team_size,
      thin_evidence_categories: features.categorical.thin_evidence_categories,
      missing_fields_count: features.missingness_summary.total_missing_count,
      contradiction_flag_count: features.numeric.contradiction_flag_count,
    },
    missingness_summary: features.missingness_summary,
  });
}

export function recommendPackage(scorecardInput: unknown, treasuryInput: unknown): FundingPackageDraft {
  const scorecard = ScorecardSchema.parse(scorecardInput);
  const treasury = TreasurySnapshotSchema.parse(treasuryInput);

  const requestedAmountUsd = scorecard.proposal_context.requested_amount_usd;
  const treasuryCapacityUsd = computeTreasuryCapacity(treasury);
  const qualityFactor = computeQualityFactor(scorecard.overall_score);
  const riskFactor = computeRiskFactor(
    scorecard.risk_classification,
    scorecard.owner_preferences_used.risk_tolerance,
  );
  const confidenceFactor = clamp(0.55 + scorecard.confidence * 0.45, 0, 1);
  const thresholdBlocked =
    scorecard.overall_score < scorecard.owner_preferences_used.minimum_overall_score &&
    scorecard.confidence < scorecard.owner_preferences_used.minimum_confidence;
  const highRiskBlocked =
    scorecard.risk_classification === "high" &&
    scorecard.overall_score < scorecard.owner_preferences_used.minimum_overall_score + 12;

  let recommendedAmountUsd =
    thresholdBlocked || highRiskBlocked
      ? 0
      : roundCurrency(requestedAmountUsd * qualityFactor * riskFactor * confidenceFactor);

  if (treasuryCapacityUsd < scorecard.owner_preferences_used.minimum_ticket_usd / 2) {
    recommendedAmountUsd = 0;
  }
  if (recommendedAmountUsd > treasuryCapacityUsd) {
    recommendedAmountUsd = roundCurrency(treasuryCapacityUsd);
  }
  if (recommendedAmountUsd > 0 && recommendedAmountUsd < scorecard.owner_preferences_used.minimum_ticket_usd) {
    recommendedAmountUsd = 0;
  }

  const recommendationLabel =
    recommendedAmountUsd <= 0
      ? "reject"
      : recommendedAmountUsd >= requestedAmountUsd * 0.9 &&
          scorecard.confidence >= scorecard.owner_preferences_used.minimum_confidence &&
          scorecard.overall_score >= scorecard.owner_preferences_used.minimum_overall_score &&
          scorecard.risk_classification !== "high"
        ? "accept"
        : "accept_reduced";

  return FundingPackageDraftSchema.parse({
    schema_version: FUNDING_PACKAGE_SCHEMA_VERSION,
    proposal_id: scorecard.proposal_id,
    recommendation_label: recommendationLabel,
    requested_amount_usd: requestedAmountUsd,
    recommended_amount_usd: recommendedAmountUsd,
    treasury_capacity_usd: treasuryCapacityUsd,
    rationale_codes: derivePackageReasonCodes(
      scorecard,
      treasuryCapacityUsd,
      recommendedAmountUsd,
      thresholdBlocked,
      highRiskBlocked,
    ),
    milestones:
      recommendationLabel === "reject"
        ? []
        : buildMilestones(scorecard, recommendedAmountUsd, treasury.hot_reserve_usd),
  });
}

function normalizeOwnerPrefs(input: unknown): OwnerPrefs {
  const parsed = OwnerPrefsSchema.parse(input);
  const mergedWeights = {
    ...DEFAULT_SUBSCORE_WEIGHTS,
    ...parsed.subscore_weights,
  };
  const total = Object.values(mergedWeights).reduce((sum, value) => sum + value, 0);
  const normalizedWeights = Object.fromEntries(
    SCORE_DIMENSIONS.map((key) => [key, round(mergedWeights[key] / (total || 1), 6)]),
  ) as OwnerPrefs["subscore_weights"];

  return OwnerPrefsSchema.parse({
    ...parsed,
    subscore_weights: normalizedWeights,
  });
}

function computeConfidence(features: Features): number {
  const thinCategoryPenalty = features.categorical.thin_evidence_categories.length * 0.03;
  const contradictionFlagPenalty = Math.min(features.numeric.contradiction_flag_count, 4) * 0.02;
  const raw =
    features.numeric.proposal_completeness_ratio * 0.2 +
    features.numeric.evidence_overall_confidence * 0.25 +
    features.numeric.evidence_category_coverage_ratio * 0.2 +
    features.numeric.evidence_support_ratio * 0.2 +
    (1 - features.numeric.evidence_contradicted_ratio) * 0.1 +
    (1 - features.numeric.stale_fact_ratio) * 0.05 -
    thinCategoryPenalty -
    contradictionFlagPenalty;

  return round(clamp(raw, 0, 1), 4);
}

function computeTeamQuality(features: Features): number {
  return boundedScore(
    scaleLinear(features.numeric.team_size, 1, 5) * 0.25 +
      scaleLinear(features.numeric.team_background_length_chars, 120, 900) * 0.2 +
      computeCategoryEvidenceScore(features.coverage.by_category.team, features.numeric.team_fact_count) * 0.35 +
      features.numeric.proposal_completeness_ratio * 100 * 0.2 -
      features.coverage.by_category.team.contradicted_fact_count * 6,
  );
}

function computeMarketOpportunity(features: Features): number {
  return boundedScore(
    scaleLog(features.numeric.tam_usd, 10_000_000, 20_000_000_000) * 0.18 +
      scaleLinear(features.numeric.market_growth_pct, 5, 35) * 0.12 +
      features.numeric.market_demand_score * 0.25 +
      features.numeric.market_intelligence_score * 0.15 +
      computeCategoryEvidenceScore(features.coverage.by_category.market, features.numeric.market_fact_count) * 0.2 +
      trendLabelScore(features.categorical.market_trend_label) * 0.1,
  );
}

function computeProductFeasibility(features: Features): number {
  return boundedScore(
    features.numeric.product_readiness_score * 0.28 +
      features.numeric.docs_quality_score * 0.18 +
      scaleLog(features.numeric.github_commits_90d, 5, 500) * 0.18 +
      scaleLog(features.numeric.github_stars, 10, 100_000) * 0.08 +
      computeCategoryEvidenceScore(features.coverage.by_category.product, features.numeric.product_fact_count) * 0.2 +
      stageFeasibilityScore(features.categorical.stage) * 0.08,
  );
}

function computeCapitalEfficiency(features: Features): number {
  return boundedScore(
    rangeScore(features.numeric.budget_coverage_ratio, 0.75, 1.1, 0.3, 1.5) * 0.35 +
      rangeScore(features.numeric.funding_per_team_member_usd, 15_000, 120_000, 5_000, 250_000) * 0.25 +
      rangeScore(features.numeric.funding_per_milestone_usd, 12_000, 100_000, 5_000, 250_000) * 0.25 +
      scaleLinear(features.numeric.budget_line_item_count, 2, 8) * 0.15,
  );
}

function computeTractionSignals(features: Features): number {
  return boundedScore(
    scaleLog(features.numeric.active_users, 10, 1_000_000) * 0.2 +
      scaleLog(features.numeric.customers, 1, 2_000) * 0.15 +
      scaleLog(features.numeric.monthly_revenue_usd, 1_000, 500_000) * 0.2 +
      features.numeric.market_validation_score * 0.25 +
      computeCategoryEvidenceScore(features.coverage.by_category.traction, features.numeric.traction_fact_count) * 0.2 +
      stageTractionLift(features.categorical.stage),
  );
}

function computeRisk(
  features: Features,
  confidence: number,
  capitalEfficiency: number,
  riskTolerance: OwnerPrefs["risk_tolerance"],
): {
  raw_risk_score: number;
  risk_indicator_score: number;
  classification: Scorecard["risk_classification"];
  reason_codes: string[];
} {
  const rawRiskScore = round(
    clamp(
      features.numeric.evidence_contradicted_ratio * 100 * 0.35 +
        (features.categorical.thin_evidence_categories.length / 6) * 100 * 0.15 +
        features.numeric.stale_fact_ratio * 100 * 0.1 +
        features.numeric.wallet_failed_transaction_rate * 100 * 0.1 +
        scaleLinear(features.numeric.portfolio_overlap_count, 1, 3) * 0.1 +
        (100 - capitalEfficiency) * 0.1 +
        (1 - features.numeric.evidence_support_ratio) * 100 * 0.1 +
        (1 - confidence) * 100 * 0.1,
      0,
      100,
    ),
  );

  return {
    raw_risk_score: rawRiskScore,
    risk_indicator_score: round(100 - rawRiskScore),
    classification: classifyRisk(rawRiskScore, riskTolerance),
    reason_codes: deriveRiskReasonCodes(features, confidence, capitalEfficiency, rawRiskScore),
  };
}

function classifyRisk(
  rawRiskScore: number,
  riskTolerance: OwnerPrefs["risk_tolerance"],
): Scorecard["risk_classification"] {
  const thresholds =
    riskTolerance === "conservative"
      ? { low: 35, medium: 60 }
      : riskTolerance === "aggressive"
        ? { low: 55, medium: 75 }
        : { low: 45, medium: 70 };

  if (rawRiskScore <= thresholds.low) {
    return "low";
  }
  if (rawRiskScore <= thresholds.medium) {
    return "medium";
  }
  return "high";
}

function deriveTeamReasonCodes(features: Features, subscore: number): string[] {
  return uniqueStrings([
    features.numeric.team_size <= 1 ? "TEAM_SIZE_THIN" : "",
    features.numeric.team_background_length_chars < 120 ? "TEAM_BACKGROUND_SHALLOW" : "",
    features.coverage.by_category.team.thin_evidence ? "TEAM_EVIDENCE_THIN" : "",
    subscore >= 75 ? "TEAM_QUALITY_STRONG" : "",
    subscore < 50 ? "TEAM_QUALITY_WEAK" : "",
  ]);
}

function deriveMarketReasonCodes(features: Features, subscore: number): string[] {
  return uniqueStrings([
    features.numeric.tam_usd >= 500_000_000 ? "MARKET_SIZE_LARGE" : "",
    features.numeric.market_growth_pct >= 20 ? "MARKET_GROWTH_STRONG" : "",
    features.numeric.market_demand_score < 45 ? "DEMAND_SIGNAL_WEAK" : "",
    features.coverage.by_category.market.thin_evidence ? "MARKET_EVIDENCE_THIN" : "",
    subscore >= 75 ? "MARKET_OPPORTUNITY_STRONG" : "",
    subscore < 50 ? "MARKET_OPPORTUNITY_WEAK" : "",
  ]);
}

function deriveProductReasonCodes(features: Features, subscore: number): string[] {
  return uniqueStrings([
    features.numeric.product_readiness_score >= 70 ? "PRODUCT_READINESS_STRONG" : "",
    features.numeric.github_commits_90d < 20 ? "REPO_ACTIVITY_LIGHT" : "",
    features.numeric.docs_quality_score < 50 ? "DOCS_QUALITY_WEAK" : "",
    features.coverage.by_category.product.thin_evidence ? "PRODUCT_EVIDENCE_THIN" : "",
    subscore >= 75 ? "PRODUCT_FEASIBILITY_STRONG" : "",
    subscore < 50 ? "PRODUCT_FEASIBILITY_WEAK" : "",
  ]);
}

function deriveCapitalReasonCodes(features: Features, subscore: number): string[] {
  return uniqueStrings([
    features.numeric.budget_coverage_ratio < 0.7 ? "BUDGET_COVERAGE_THIN" : "",
    features.numeric.funding_per_team_member_usd > 120_000 ? "CAPITAL_INTENSITY_HIGH" : "",
    features.numeric.funding_per_milestone_usd > 120_000 ? "MILESTONE_BUDGET_HEAVY" : "",
    subscore >= 75 ? "CAPITAL_EFFICIENCY_STRONG" : "",
    subscore < 50 ? "CAPITAL_EFFICIENCY_WEAK" : "",
  ]);
}

function deriveTractionReasonCodes(features: Features, subscore: number): string[] {
  return uniqueStrings([
    features.numeric.active_users >= 1_000 ? "ACTIVE_USAGE_OBSERVED" : "",
    features.numeric.monthly_revenue_usd >= 10_000 ? "REVENUE_SIGNAL_PRESENT" : "",
    features.coverage.by_category.traction.thin_evidence ? "TRACTION_EVIDENCE_THIN" : "",
    subscore >= 75 ? "TRACTION_STRONG" : "",
    subscore < 45 ? "TRACTION_WEAK" : "",
  ]);
}

function deriveRiskReasonCodes(
  features: Features,
  confidence: number,
  capitalEfficiency: number,
  rawRiskScore: number,
): string[] {
  return uniqueStrings([
    features.numeric.evidence_contradicted_ratio > 0.08 ? "CONTRADICTIONS_PRESENT" : "",
    features.categorical.thin_evidence_categories.length >= 3 ? "EVIDENCE_THIN" : "",
    features.numeric.stale_fact_ratio > 0.2 ? "EVIDENCE_STALE" : "",
    features.numeric.wallet_failed_transaction_rate > 0.05 ? "WALLET_FAILURES_ELEVATED" : "",
    features.numeric.portfolio_overlap_count > 0 ? "PORTFOLIO_OVERLAP_PRESENT" : "",
    confidence < 0.55 ? "CONFIDENCE_CONSTRAINED" : "",
    capitalEfficiency < 50 ? "CAPITAL_EFFICIENCY_RISK" : "",
    rawRiskScore >= 70 ? "RISK_PRESSURE_HIGH" : rawRiskScore >= 45 ? "RISK_PRESSURE_MODERATE" : "RISK_PRESSURE_LOW",
  ]);
}

function deriveTopLevelReasonCodes(
  subscores: Scorecard["subscores"],
  confidence: number,
  riskClassification: Scorecard["risk_classification"],
  features: Features,
): string[] {
  return uniqueStrings([
    subscores.team_quality < 50 ? "TEAM_REVIEW_NEEDED" : "",
    subscores.market_opportunity < 50 ? "MARKET_REVIEW_NEEDED" : "",
    subscores.product_feasibility < 50 ? "PRODUCT_REVIEW_NEEDED" : "",
    subscores.traction_signals < 45 ? "TRACTION_REVIEW_NEEDED" : "",
    confidence < 0.5 ? "LOW_CONFIDENCE_BASELINE" : confidence >= 0.75 ? "HIGH_CONFIDENCE_BASELINE" : "",
    riskClassification === "high" ? "HIGH_RISK_CLASSIFICATION" : "",
    features.missingness_summary.total_missing_count >= 5 ? "MISSINGNESS_ELEVATED" : "",
  ]);
}

function computeCategoryEvidenceScore(
  coverage: Features["coverage"]["by_category"]["team"],
  factCount: number,
): number {
  return boundedScore(
    coverage.average_confidence * 100 * 0.4 +
      coverage.support_ratio * 100 * 0.4 +
      scaleLinear(factCount, 1, 6) * 0.2,
  );
}

function computeTreasuryCapacity(treasury: TreasurySnapshot): number {
  if (typeof treasury.available_for_new_commitments_usd === "number") {
    return roundCurrency(treasury.available_for_new_commitments_usd);
  }
  return roundCurrency(Math.max(0, treasury.hot_reserve_usd + treasury.idle_treasury_usd - treasury.strategic_buffer_usd));
}

function computeQualityFactor(overallScore: number): number {
  if (overallScore >= 85) {
    return 1;
  }
  if (overallScore >= 75) {
    return 0.9;
  }
  if (overallScore >= 65) {
    return 0.7;
  }
  if (overallScore >= 60) {
    return 0.55;
  }
  if (overallScore >= 50) {
    return 0.3;
  }
  return 0;
}

function computeRiskFactor(
  riskClassification: Scorecard["risk_classification"],
  riskTolerance: OwnerPrefs["risk_tolerance"],
): number {
  if (riskClassification === "low") {
    return 1;
  }
  if (riskClassification === "medium") {
    return riskTolerance === "conservative" ? 0.75 : riskTolerance === "aggressive" ? 0.88 : 0.82;
  }
  return riskTolerance === "aggressive" ? 0.55 : riskTolerance === "balanced" ? 0.45 : 0.35;
}

function derivePackageReasonCodes(
  scorecard: Scorecard,
  treasuryCapacityUsd: number,
  recommendedAmountUsd: number,
  thresholdBlocked: boolean,
  highRiskBlocked: boolean,
): string[] {
  return uniqueStrings([
    thresholdBlocked ? "OVERALL_OR_CONFIDENCE_BELOW_FLOOR" : "",
    highRiskBlocked ? "HIGH_RISK_REDUCTION_REQUIRED" : "",
    treasuryCapacityUsd < scorecard.proposal_context.requested_amount_usd ? "TREASURY_CAPACITY_CONSTRAINED" : "",
    recommendedAmountUsd === 0 ? "FUNDING_NOT_RECOMMENDED" : "",
    recommendedAmountUsd > 0 && recommendedAmountUsd < scorecard.proposal_context.requested_amount_usd
      ? "REDUCED_FUNDING_RECOMMENDED"
      : "",
    recommendedAmountUsd >= scorecard.proposal_context.requested_amount_usd * 0.9 ? "FULL_FUNDING_SUPPORTED" : "",
    scorecard.risk_classification === "medium" ? "MEDIUM_RISK_MILESTONED_RELEASE" : "",
    scorecard.risk_classification === "high" ? "HIGH_RISK_MILESTONED_RELEASE" : "",
  ]);
}

function buildMilestones(
  scorecard: Scorecard,
  recommendedAmountUsd: number,
  hotReserveUsd: number,
): FundingPackageDraft["milestones"] {
  const milestoneCount = resolveMilestoneCount(scorecard);
  const ratios = buildMilestoneRatios(scorecard, recommendedAmountUsd, hotReserveUsd, milestoneCount);
  const amounts = allocateRoundedCurrency(recommendedAmountUsd, ratios);
  const templates = milestoneTemplatesForStage(scorecard.proposal_context.stage, milestoneCount);
  const baseWindow = stageWindowDays(scorecard.proposal_context.stage, scorecard.owner_preferences_used.milestone_window_days);

  return amounts.map((amountUsd, index) => ({
    index: index + 1,
    amount_usd: amountUsd,
    deliverable_type: templates[index].deliverable_type,
    deadline: `P${baseWindow * (index + 1)}D`,
    verification_method: templates[index].verification_method,
    rationale_codes: buildMilestoneReasonCodes(scorecard, index, milestoneCount),
  }));
}

function resolveMilestoneCount(scorecard: Scorecard): number {
  const preferred =
    scorecard.proposal_context.requested_milestone_count ||
    defaultMilestonesForStage(
      scorecard.proposal_context.stage,
      scorecard.owner_preferences_used.default_milestone_count,
    );

  return clampInt(preferred, 2, scorecard.owner_preferences_used.max_milestone_count);
}

function buildMilestoneRatios(
  scorecard: Scorecard,
  recommendedAmountUsd: number,
  hotReserveUsd: number,
  milestoneCount: number,
): number[] {
  const basePatterns: Record<number, number[]> = {
    2: [0.35, 0.65],
    3: [0.2, 0.35, 0.45],
    4: [0.15, 0.2, 0.25, 0.4],
    5: [0.12, 0.16, 0.2, 0.22, 0.3],
    6: [0.1, 0.14, 0.16, 0.18, 0.18, 0.24],
  };
  const pattern = [...(basePatterns[milestoneCount] ?? basePatterns[3])];

  let firstRatio = clamp(
    pattern[0] +
      (scorecard.confidence - 0.6) * 0.08 +
      (scorecard.risk_classification === "low" ? 0.02 : scorecard.risk_classification === "high" ? -0.05 : -0.02),
    0.1,
    Math.min(scorecard.owner_preferences_used.max_single_milestone_ratio, 0.45),
  );

  if (recommendedAmountUsd > 0) {
    const hotReserveCap = clamp(hotReserveUsd / recommendedAmountUsd, 0, 1);
    firstRatio = Math.min(firstRatio, Math.max(0.1, hotReserveCap));
  }

  const remainingRatio = Math.max(0, 1 - firstRatio);
  const trailingBase = pattern.slice(1);
  const trailingTotal = trailingBase.reduce((sum, value) => sum + value, 0) || 1;

  return [firstRatio, ...trailingBase.map((value) => (value / trailingTotal) * remainingRatio)];
}

function buildMilestoneReasonCodes(
  scorecard: Scorecard,
  index: number,
  milestoneCount: number,
): string[] {
  return uniqueStrings([
    index === 0 ? "INITIAL_RELEASE" : "",
    index === milestoneCount - 1 ? "FINAL_VERIFICATION_GATE" : "",
    scorecard.risk_classification !== "low" ? "RISK_CONTROLLED_ESCROW" : "",
    scorecard.confidence < 0.65 ? "EVIDENCE_GAPS_REQUIRE_MILESTONE_PROOF" : "",
  ]);
}

function milestoneTemplatesForStage(
  stage: Scorecard["proposal_context"]["stage"],
  milestoneCount: number,
): Array<{
  deliverable_type: FundingPackageDraft["milestones"][number]["deliverable_type"];
  verification_method: FundingPackageDraft["milestones"][number]["verification_method"];
}> {
  const templatesByStage = {
    idea: [
      { deliverable_type: "technical_spec", verification_method: "documentation_review" },
      { deliverable_type: "prototype_demo", verification_method: "repository_activity" },
      { deliverable_type: "user_validation", verification_method: "committee_validation" },
    ],
    mvp: [
      { deliverable_type: "prototype_demo", verification_method: "repository_activity" },
      { deliverable_type: "mvp_release", verification_method: "deployment_proof" },
      { deliverable_type: "integration_proof", verification_method: "deployment_proof" },
      { deliverable_type: "user_validation", verification_method: "kpi_evidence" },
    ],
    beta: [
      { deliverable_type: "beta_release", verification_method: "deployment_proof" },
      { deliverable_type: "feature_release", verification_method: "repository_activity" },
      { deliverable_type: "usage_growth", verification_method: "kpi_evidence" },
      { deliverable_type: "scale_readiness", verification_method: "committee_validation" },
    ],
    live: [
      { deliverable_type: "feature_release", verification_method: "deployment_proof" },
      { deliverable_type: "reliability_kpis", verification_method: "kpi_evidence" },
      { deliverable_type: "revenue_growth", verification_method: "financial_review" },
      { deliverable_type: "scale_readiness", verification_method: "committee_validation" },
    ],
    scaling: [
      { deliverable_type: "reliability_kpis", verification_method: "kpi_evidence" },
      { deliverable_type: "revenue_growth", verification_method: "financial_review" },
      { deliverable_type: "scale_readiness", verification_method: "deployment_proof" },
      { deliverable_type: "governance_controls", verification_method: "committee_validation" },
    ],
  } satisfies Record<
    Scorecard["proposal_context"]["stage"],
    Array<{
      deliverable_type: FundingPackageDraft["milestones"][number]["deliverable_type"];
      verification_method: FundingPackageDraft["milestones"][number]["verification_method"];
    }>
  >;

  const templates = templatesByStage[stage];
  return Array.from({ length: milestoneCount }, (_, index) => templates[Math.min(index, templates.length - 1)]);
}

function defaultMilestonesForStage(
  stage: Scorecard["proposal_context"]["stage"],
  fallback: number,
): number {
  const defaults = {
    idea: 3,
    mvp: 3,
    beta: 4,
    live: 4,
    scaling: 4,
  } satisfies Record<Scorecard["proposal_context"]["stage"], number>;

  return defaults[stage] ?? fallback;
}

function stageWindowDays(
  stage: Scorecard["proposal_context"]["stage"],
  baseWindowDays: number,
): number {
  const lift = {
    idea: -7,
    mvp: 0,
    beta: 7,
    live: 14,
    scaling: 21,
  } satisfies Record<Scorecard["proposal_context"]["stage"], number>;

  return Math.max(21, baseWindowDays + lift[stage]);
}

function stageFeasibilityScore(stage: Features["categorical"]["stage"]): number {
  const score = {
    idea: 42,
    mvp: 58,
    beta: 72,
    live: 85,
    scaling: 90,
  } satisfies Record<Features["categorical"]["stage"], number>;

  return score[stage];
}

function stageTractionLift(stage: Features["categorical"]["stage"]): number {
  const lift = {
    idea: -4,
    mvp: 0,
    beta: 4,
    live: 8,
    scaling: 10,
  } satisfies Record<Features["categorical"]["stage"], number>;

  return lift[stage];
}

function trendLabelScore(label: Features["categorical"]["market_trend_label"]): number {
  const score = {
    unknown: 50,
    declining: 30,
    stable: 55,
    rising: 75,
    hot: 90,
  } satisfies Record<Features["categorical"]["market_trend_label"], number>;

  return score[label];
}

function rangeScore(value: number, low: number, high: number, hardMin: number, hardMax: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= low && value <= high) {
    return 100;
  }
  if (value < low) {
    return scaleLinear(value, hardMin, low);
  }
  return scaleLinear(hardMax - value, 0, hardMax - high);
}

function scaleLinear(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= min) {
    return 0;
  }
  if (value >= max) {
    return 100;
  }
  return ((value - min) / (max - min)) * 100;
}

function scaleLog(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= min) {
    return 0;
  }
  if (value >= max) {
    return 100;
  }
  const minLog = Math.log10(min);
  const maxLog = Math.log10(max);
  const valueLog = Math.log10(value);
  return ((valueLog - minLog) / (maxLog - minLog)) * 100;
}

function boundedScore(value: number): number {
  return round(clamp(value, 0, 100));
}

function allocateRoundedCurrency(totalUsd: number, ratios: number[]): number[] {
  if (totalUsd <= 0 || ratios.length === 0) {
    return [];
  }

  const rounded = ratios.map((ratio, index) =>
    index === ratios.length - 1 ? 0 : roundCurrency(totalUsd * ratio),
  );
  const allocatedBeforeLast = rounded.reduce((sum, value) => sum + value, 0);
  rounded[rounded.length - 1] = round(totalUsd - allocatedBeforeLast);
  return rounded;
}

function roundCurrency(value: number, granularity = 250): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value / granularity) * granularity;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

export const scoringSchemas = {
  ownerPrefs: OwnerPrefsSchema,
  scorecard: ScorecardSchema,
  treasurySnapshot: TreasurySnapshotSchema,
  fundingPackageDraft: FundingPackageDraftSchema,
  scoreDimension: SCORE_DIMENSION_SCHEMA,
};
