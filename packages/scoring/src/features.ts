import { z } from "zod";

const FEATURE_SCHEMA_VERSION = "features-v1" as const;

const PROPOSAL_CATEGORIES = [
  "defi",
  "infrastructure",
  "developer_tools",
  "consumer",
  "other",
] as const;

const PROPOSAL_STAGES = ["idea", "mvp", "beta", "live", "scaling"] as const;
const PAYOUT_CHAINS = ["solana", "base_sepolia"] as const;

const EVIDENCE_SOURCE_KINDS = [
  "unbrowse_intent",
  "unbrowse_skill_search",
  "unbrowse_domain_search",
  "solana_rpc",
  "portfolio_context",
  "github_api",
  "market_search",
  "gemini_market",
  "internal_db",
  "other",
] as const;

const EVIDENCE_FACT_CATEGORIES = [
  "team",
  "founder",
  "product",
  "market",
  "traction",
  "wallet",
  "portfolio_context",
  "financials",
  "risk",
  "other",
] as const;

const SUPPORT_STATUSES = [
  "observed",
  "supported",
  "partially_supported",
  "contradicted",
  "mixed",
  "missing_evidence",
  "unverified",
] as const;

const FEATURE_SOURCES = ["proposal", "evidence", "derived", "default"] as const;
const COVERAGE_CATEGORIES = ["team", "product", "market", "traction", "wallet", "portfolio_context"] as const;
const WALLET_ACTIVITY_LEVELS = ["unknown", "none", "low", "medium", "high"] as const;
const WALLET_AGE_LABELS = ["unknown", "new", "emerging", "established", "mature"] as const;
const MARKET_TREND_LABELS = ["unknown", "declining", "stable", "rising", "hot"] as const;
const MARKET_NOVELTY_LABELS = ["unknown", "commodity", "incremental", "differentiated", "novel"] as const;
const VALUATION_CONFIDENCE_LABELS = ["unknown", "low", "medium", "high"] as const;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)]),
);

const OptionalStringSchema = z.preprocess(
  (value) => normalizeOptionalString(value),
  z.string().min(1).optional(),
);

const OptionalNumberSchema = z.preprocess(
  (value) => normalizeOptionalNumber(value),
  z.number().finite().nonnegative().optional(),
);

const OptionalIntegerSchema = z.preprocess(
  (value) => normalizeOptionalInteger(value),
  z.number().int().nonnegative().optional(),
);

const NullableIntegerSchema = z.preprocess(
  (value) => normalizeNullableInteger(value),
  z.number().int().nonnegative().nullable(),
);

const ProposalCategorySchema = z.preprocess(
  (value) => normalizeEnumValue(value, PROPOSAL_CATEGORIES, "other"),
  z.enum(PROPOSAL_CATEGORIES),
);

const ProposalStageSchema = z.preprocess(
  (value) => normalizeEnumValue(value, PROPOSAL_STAGES, "idea"),
  z.enum(PROPOSAL_STAGES),
);

const OptionalPayoutChainSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeEnumValue(value, PAYOUT_CHAINS, "base_sepolia") : undefined),
  z.enum(PAYOUT_CHAINS).optional(),
);

const EvidenceSourceKindSchema = z.preprocess(
  (value) => normalizeEnumValue(value, EVIDENCE_SOURCE_KINDS, "other"),
  z.enum(EVIDENCE_SOURCE_KINDS),
);

const EvidenceFactCategorySchema = z.preprocess(
  (value) => normalizeEnumValue(value, EVIDENCE_FACT_CATEGORIES, "other"),
  z.enum(EVIDENCE_FACT_CATEGORIES),
);

const SupportStatusSchema = z.preprocess(
  (value) => normalizeEnumValue(value, SUPPORT_STATUSES, "unverified"),
  z.enum(SUPPORT_STATUSES),
);

const FeatureSourceSchema = z.enum(FEATURE_SOURCES);

const BudgetLineItemSchema = z.object({
  category: z.string().min(1),
  amount_usd: z.preprocess(
    (value) => normalizeOptionalNumber(value) ?? 0,
    z.number().finite().nonnegative(),
  ),
  notes: OptionalStringSchema,
});

const FounderMilestoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  target_days: OptionalIntegerSchema,
  requested_release_ratio: z.preprocess(
    (value) => normalizeOptionalNumber(value),
    z.number().finite().min(0).max(1).optional(),
  ),
});

export const CanonicalProposalSchema = z.object({
  proposal_id: OptionalStringSchema,
  name: z.string().min(1),
  website_url: OptionalStringSchema,
  github_url: OptionalStringSchema,
  short_description: OptionalStringSchema,
  description: OptionalStringSchema,
  category: ProposalCategorySchema.default("other"),
  stage: ProposalStageSchema.default("idea"),
  team_size: OptionalIntegerSchema,
  requested_funding_usd: OptionalNumberSchema,
  recipient_wallet: OptionalStringSchema,
  recipient_solana_address: OptionalStringSchema,
  recipient_evm_address: OptionalStringSchema,
  preferred_payout_chain: OptionalPayoutChainSchema,
  team_background: OptionalStringSchema,
  market_summary: OptionalStringSchema,
  traction_summary: OptionalStringSchema,
  budget_breakdown: z.preprocess(
    (value) => normalizeBudgetBreakdown(value),
    z.array(BudgetLineItemSchema).default([]),
  ),
  requested_milestones: z.preprocess(
    (value) => normalizeMilestones(value),
    z.array(FounderMilestoneSchema).default([]),
  ),
});

const EvidenceProvenanceSchema = z.object({
  source_ids: z.array(z.string().min(1)).default([]),
  urls: z.array(z.string().min(1)).default([]),
  invocation_ids: z.array(z.string().min(1)).default([]),
  request_signatures: z.array(z.string().min(1)).default([]),
});

export const CanonicalEvidenceSourceSchema = z.object({
  id: z.string().min(1),
  kind: EvidenceSourceKindSchema,
  label: z.string().min(1),
  url: OptionalStringSchema,
  endpoint: OptionalStringSchema,
  method: OptionalStringSchema,
  invocation_id: OptionalStringSchema,
  request_signature: OptionalStringSchema,
  observed_at: z.string().min(1),
  raw_payload_hash: z.string().min(1),
  metadata: z.record(JsonValueSchema).optional(),
});

export const CanonicalEvidenceFactSchema = z.object({
  id: z.string().min(1),
  category: EvidenceFactCategorySchema,
  key: z.string().min(1),
  claim: z.string().min(1),
  value: JsonValueSchema,
  confidence: z.preprocess(
    (value) => normalizeOptionalNumber(value) ?? 0,
    z.number().min(0).max(1),
  ),
  observed_at: z.string().min(1),
  support_status: SupportStatusSchema.default("unverified"),
  freshness_days: NullableIntegerSchema,
  contradiction_flags: z.preprocess(
    (value) => normalizeStringArray(value),
    z.array(z.string().min(1)).default([]),
  ),
  provenance: EvidenceProvenanceSchema,
});

export const CanonicalEvidenceSchema = z.object({
  proposal_id: OptionalStringSchema,
  facts: z.preprocess(
    (value) => normalizeArray(value),
    z.array(CanonicalEvidenceFactSchema).default([]),
  ),
  sources: z.preprocess(
    (value) => normalizeArray(value),
    z.array(CanonicalEvidenceSourceSchema).default([]),
  ),
  timestamps: z
    .object({
      generated_at: OptionalStringSchema,
      source_observed_at: z.preprocess(
        (value) => normalizeStringArray(value),
        z.array(z.string().min(1)).default([]),
      ),
    })
    .default({ generated_at: undefined, source_observed_at: [] }),
  confidence: z
    .object({
      overall: z.preprocess(
        (value) => normalizeOptionalNumber(value) ?? 0,
        z.number().min(0).max(1),
      ),
      by_category: z.preprocess(
        (value) => normalizeConfidenceMap(value),
        z.record(z.enum(EVIDENCE_FACT_CATEGORIES), z.number().min(0).max(1)).default({}),
      ),
    })
    .default({ overall: 0, by_category: {} }),
  support_summary: z.preprocess(
    (value) => normalizeCountMap(value),
    z.record(z.enum(SUPPORT_STATUSES), z.number().int().nonnegative()).default({}),
  ),
  freshness_summary: z
    .object({
      min_days: NullableIntegerSchema,
      max_days: NullableIntegerSchema,
      stale_fact_count: z.preprocess(
        (value) => normalizeOptionalInteger(value) ?? 0,
        z.number().int().nonnegative(),
      ),
    })
    .default({ min_days: null, max_days: null, stale_fact_count: 0 }),
  contradiction_flags: z.preprocess(
    (value) => normalizeStringArray(value),
    z.array(z.string().min(1)).default([]),
  ),
  raw_payload_hash: OptionalStringSchema,
});

export const MissingnessEntrySchema = z.object({
  missing: z.boolean(),
  source: FeatureSourceSchema,
  reason: OptionalStringSchema,
});

const CategoryCoverageSchema = z.object({
  fact_count: z.number().int().nonnegative(),
  average_confidence: z.number().min(0).max(1),
  support_ratio: z.number().min(0).max(1),
  contradicted_fact_count: z.number().int().nonnegative(),
  stale_fact_count: z.number().int().nonnegative(),
  thin_evidence: z.boolean(),
});

const NumericFeaturesSchema = z.object({
  requested_funding_usd: z.number().finite().nonnegative(),
  budget_total_usd: z.number().finite().nonnegative(),
  budget_line_item_count: z.number().int().nonnegative(),
  budget_coverage_ratio: z.number().min(0).max(10),
  milestone_count: z.number().int().nonnegative(),
  funding_per_team_member_usd: z.number().finite().nonnegative(),
  funding_per_milestone_usd: z.number().finite().nonnegative(),
  team_size: z.number().int().nonnegative(),
  description_length_chars: z.number().int().nonnegative(),
  team_background_length_chars: z.number().int().nonnegative(),
  market_summary_length_chars: z.number().int().nonnegative(),
  traction_summary_length_chars: z.number().int().nonnegative(),
  proposal_completeness_ratio: z.number().min(0).max(1),
  evidence_fact_count: z.number().int().nonnegative(),
  evidence_source_count: z.number().int().nonnegative(),
  evidence_overall_confidence: z.number().min(0).max(1),
  evidence_support_ratio: z.number().min(0).max(1),
  evidence_contradicted_ratio: z.number().min(0).max(1),
  stale_fact_ratio: z.number().min(0).max(1),
  evidence_category_coverage_ratio: z.number().min(0).max(1),
  contradiction_flag_count: z.number().int().nonnegative(),
  team_fact_count: z.number().int().nonnegative(),
  product_fact_count: z.number().int().nonnegative(),
  market_fact_count: z.number().int().nonnegative(),
  traction_fact_count: z.number().int().nonnegative(),
  wallet_fact_count: z.number().int().nonnegative(),
  portfolio_context_fact_count: z.number().int().nonnegative(),
  github_stars: z.number().finite().nonnegative(),
  github_commits_90d: z.number().finite().nonnegative(),
  docs_quality_score: z.number().min(0).max(100),
  product_readiness_score: z.number().min(0).max(100),
  active_users: z.number().finite().nonnegative(),
  customers: z.number().finite().nonnegative(),
  monthly_revenue_usd: z.number().finite().nonnegative(),
  tam_usd: z.number().finite().nonnegative(),
  market_growth_pct: z.number().finite().nonnegative(),
  market_demand_score: z.number().min(0).max(100),
  market_validation_score: z.number().min(0).max(100),
  market_intelligence_score: z.number().min(0).max(100),
  wallet_sol_balance_lamports: z.number().finite().nonnegative(),
  wallet_holdings_count: z.number().finite().nonnegative(),
  wallet_transactions_30d: z.number().finite().nonnegative(),
  wallet_failed_transaction_rate: z.number().min(0).max(1),
  portfolio_overlap_count: z.number().int().nonnegative(),
});

const BooleanFeaturesSchema = z.object({
  has_website_url: z.boolean(),
  has_github_url: z.boolean(),
  has_recipient_wallet: z.boolean(),
  has_recipient_solana_address: z.boolean(),
  has_recipient_evm_address: z.boolean(),
  has_team_background: z.boolean(),
  has_market_summary: z.boolean(),
  has_traction_summary: z.boolean(),
  has_budget_breakdown: z.boolean(),
  has_requested_milestones: z.boolean(),
  has_team_evidence: z.boolean(),
  has_product_evidence: z.boolean(),
  has_market_evidence: z.boolean(),
  has_traction_evidence: z.boolean(),
  has_wallet_evidence: z.boolean(),
  has_portfolio_context_evidence: z.boolean(),
  has_contradictions: z.boolean(),
});

const CategoricalFeaturesSchema = z.object({
  category: ProposalCategorySchema,
  stage: ProposalStageSchema,
  wallet_activity_level: z.enum(WALLET_ACTIVITY_LEVELS),
  wallet_age_label: z.enum(WALLET_AGE_LABELS),
  market_trend_label: z.enum(MARKET_TREND_LABELS),
  market_novelty_label: z.enum(MARKET_NOVELTY_LABELS),
  valuation_confidence_label: z.enum(VALUATION_CONFIDENCE_LABELS),
  contradiction_flags: z.array(z.string().min(1)),
  thin_evidence_categories: z.array(z.enum(COVERAGE_CATEGORIES)),
});

const CoverageSchema = z.object({
  by_category: z.object({
    team: CategoryCoverageSchema,
    product: CategoryCoverageSchema,
    market: CategoryCoverageSchema,
    traction: CategoryCoverageSchema,
    wallet: CategoryCoverageSchema,
    portfolio_context: CategoryCoverageSchema,
  }),
  support_summary: z.record(z.enum(SUPPORT_STATUSES), z.number().int().nonnegative()),
  freshness_summary: z.object({
    min_days: z.number().int().nonnegative().nullable(),
    max_days: z.number().int().nonnegative().nullable(),
    stale_fact_count: z.number().int().nonnegative(),
  }),
});

const MissingnessSummarySchema = z.object({
  total_missing_count: z.number().int().nonnegative(),
  missing_proposal_fields: z.number().int().nonnegative(),
  missing_evidence_fields: z.number().int().nonnegative(),
  thin_evidence_categories: z.array(z.enum(COVERAGE_CATEGORIES)),
});

export const FeatureVectorSchema = z.object({
  schema_version: z.literal(FEATURE_SCHEMA_VERSION),
  proposal_id: OptionalStringSchema,
  extracted_at: z.string().datetime(),
  numeric: NumericFeaturesSchema,
  boolean_flags: BooleanFeaturesSchema,
  categorical: CategoricalFeaturesSchema,
  coverage: CoverageSchema,
  missingness_map: z.record(z.string(), MissingnessEntrySchema),
  missingness_summary: MissingnessSummarySchema,
});

export type CanonicalProposal = z.infer<typeof CanonicalProposalSchema>;
export type CanonicalEvidence = z.infer<typeof CanonicalEvidenceSchema>;
export type Features = z.infer<typeof FeatureVectorSchema>;

export const FEATURE_UNITS: Record<keyof Features["numeric"], string> = {
  requested_funding_usd: "usd",
  budget_total_usd: "usd",
  budget_line_item_count: "count",
  budget_coverage_ratio: "ratio",
  milestone_count: "count",
  funding_per_team_member_usd: "usd_per_person",
  funding_per_milestone_usd: "usd_per_milestone",
  team_size: "people",
  description_length_chars: "chars",
  team_background_length_chars: "chars",
  market_summary_length_chars: "chars",
  traction_summary_length_chars: "chars",
  proposal_completeness_ratio: "ratio",
  evidence_fact_count: "count",
  evidence_source_count: "count",
  evidence_overall_confidence: "ratio",
  evidence_support_ratio: "ratio",
  evidence_contradicted_ratio: "ratio",
  stale_fact_ratio: "ratio",
  evidence_category_coverage_ratio: "ratio",
  contradiction_flag_count: "count",
  team_fact_count: "count",
  product_fact_count: "count",
  market_fact_count: "count",
  traction_fact_count: "count",
  wallet_fact_count: "count",
  portfolio_context_fact_count: "count",
  github_stars: "count",
  github_commits_90d: "count_90d",
  docs_quality_score: "score_0_100",
  product_readiness_score: "score_0_100",
  active_users: "users",
  customers: "count",
  monthly_revenue_usd: "usd_per_month",
  tam_usd: "usd",
  market_growth_pct: "percent",
  market_demand_score: "score_0_100",
  market_validation_score: "score_0_100",
  market_intelligence_score: "score_0_100",
  wallet_sol_balance_lamports: "lamports",
  wallet_holdings_count: "count",
  wallet_transactions_30d: "count_30d",
  wallet_failed_transaction_rate: "ratio",
  portfolio_overlap_count: "count",
};

export function normalizeProposal(proposal: unknown): CanonicalProposal {
  return CanonicalProposalSchema.parse(remapProposalInput(proposal));
}

export function normalizeEvidence(evidence: unknown): CanonicalEvidence {
  return CanonicalEvidenceSchema.parse(evidence);
}

export function extractFeatures(proposalInput: unknown, evidenceInput: unknown): Features {
  const proposal = normalizeProposal(proposalInput);
  const evidence = normalizeEvidence(evidenceInput);
  const factsByKey = groupFactsByKey(evidence.facts);
  const missingnessMap: Record<string, z.infer<typeof MissingnessEntrySchema>> = {};
  const coverageByCategory = buildCoverageByCategory(evidence.facts);
  const thinEvidenceCategories = COVERAGE_CATEGORIES.filter((key) => coverageByCategory[key].thin_evidence);
  const contradictionFlags = uniqueStrings([
    ...evidence.contradiction_flags,
    ...evidence.facts.flatMap((fact) => fact.contradiction_flags),
  ]);

  const requestedFundingUsd = recordFeatureNumber(
    missingnessMap,
    "numeric.requested_funding_usd",
    proposal.requested_funding_usd,
    "proposal",
    "Requested funding was not provided.",
  );
  const budgetTotalUsd = recordFeatureNumber(
    missingnessMap,
    "numeric.budget_total_usd",
    proposal.budget_breakdown.reduce((sum, item) => sum + item.amount_usd, 0),
    proposal.budget_breakdown.length > 0 ? "derived" : "default",
    "Budget breakdown was not provided.",
  );
  const milestoneCount = recordFeatureNumber(
    missingnessMap,
    "numeric.milestone_count",
    proposal.requested_milestones.length,
    proposal.requested_milestones.length > 0 ? "derived" : "default",
    "Founder milestones were not provided.",
  );
  const teamSize = recordFeatureNumber(
    missingnessMap,
    "numeric.team_size",
    proposal.team_size,
    "proposal",
    "Team size was not provided.",
  );

  const features = FeatureVectorSchema.parse({
    schema_version: FEATURE_SCHEMA_VERSION,
    proposal_id: proposal.proposal_id ?? evidence.proposal_id,
    extracted_at: new Date().toISOString(),
    numeric: {
      requested_funding_usd: requestedFundingUsd,
      budget_total_usd: budgetTotalUsd,
      budget_line_item_count: proposal.budget_breakdown.length,
      budget_coverage_ratio: requestedFundingUsd > 0 ? clamp(budgetTotalUsd / requestedFundingUsd, 0, 10) : 0,
      milestone_count: milestoneCount,
      funding_per_team_member_usd: teamSize > 0 ? requestedFundingUsd / teamSize : 0,
      funding_per_milestone_usd: milestoneCount > 0 ? requestedFundingUsd / milestoneCount : 0,
      team_size: teamSize,
      description_length_chars: textLength(proposal.description),
      team_background_length_chars: textLength(proposal.team_background),
      market_summary_length_chars: textLength(proposal.market_summary),
      traction_summary_length_chars: textLength(proposal.traction_summary),
      proposal_completeness_ratio: computeProposalCompletenessRatio(proposal),
      evidence_fact_count: evidence.facts.length,
      evidence_source_count: evidence.sources.length,
      evidence_overall_confidence: clamp(evidence.confidence.overall, 0, 1),
      evidence_support_ratio: computeSupportRatio(evidence.facts),
      evidence_contradicted_ratio: computeContradictedRatio(evidence.facts),
      stale_fact_ratio: 0,
      evidence_category_coverage_ratio: computeCoverageRatio(coverageByCategory),
      contradiction_flag_count: contradictionFlags.length,
      team_fact_count: coverageByCategory.team.fact_count,
      product_fact_count: coverageByCategory.product.fact_count,
      market_fact_count: coverageByCategory.market.fact_count,
      traction_fact_count: coverageByCategory.traction.fact_count,
      wallet_fact_count: coverageByCategory.wallet.fact_count,
      portfolio_context_fact_count: coverageByCategory.portfolio_context.fact_count,
      github_stars: readFactNumber(factsByKey, "github_stars") ?? 0,
      github_commits_90d: readFactNumber(factsByKey, "github_commits_90d") ?? 0,
      docs_quality_score: clamp(readFactNumber(factsByKey, "github_docs_quality_score") ?? 0, 0, 100),
      product_readiness_score: clamp(readFactNumber(factsByKey, "github_product_readiness_score") ?? 0, 0, 100),
      active_users: readFactNumber(factsByKey, "active_users") ?? 0,
      customers: readFactNumber(factsByKey, "customers") ?? 0,
      monthly_revenue_usd: readFactNumber(factsByKey, "monthly_revenue_usd") ?? 0,
      tam_usd: readFactNumber(factsByKey, "tam_usd") ?? 0,
      market_growth_pct: readFactNumber(factsByKey, "market_growth_pct") ?? 0,
      market_demand_score: clamp(readFactNumber(factsByKey, "market_demand_score") ?? 0, 0, 100),
      market_validation_score: clamp(
        readFactObjectNumber(factsByKey, "market_intelligence_score", "market_validation_score") ?? 0,
        0,
        100,
      ),
      market_intelligence_score: clamp(
        readFactObjectNumber(factsByKey, "market_intelligence_score", "market_intelligence_score") ?? 0,
        0,
        100,
      ),
      wallet_sol_balance_lamports: readFactNumber(factsByKey, "sol_balance_lamports") ?? 0,
      wallet_holdings_count: readFactNumber(factsByKey, "holdings_count") ?? 0,
      wallet_transactions_30d:
        readFactNumber(factsByKey, "transactions_30d") ??
        readFactObjectNumber(factsByKey, "indexed_analytics", "transactions_30d") ??
        0,
      wallet_failed_transaction_rate: clamp(
        readFactObjectNumber(factsByKey, "indexed_analytics", "failed_transaction_rate") ?? 0,
        0,
        1,
      ),
      portfolio_overlap_count: readFactArrayLength(factsByKey, "portfolio_overlap_projects"),
    },
    boolean_flags: {
      has_website_url: Boolean(proposal.website_url),
      has_github_url: Boolean(proposal.github_url),
      has_recipient_wallet: Boolean(proposal.recipient_wallet || proposal.recipient_solana_address),
      has_recipient_solana_address: Boolean(proposal.recipient_solana_address || proposal.recipient_wallet),
      has_recipient_evm_address: Boolean(proposal.recipient_evm_address),
      has_team_background: Boolean(proposal.team_background),
      has_market_summary: Boolean(proposal.market_summary),
      has_traction_summary: Boolean(proposal.traction_summary),
      has_budget_breakdown: proposal.budget_breakdown.length > 0,
      has_requested_milestones: proposal.requested_milestones.length > 0,
      has_team_evidence: coverageByCategory.team.fact_count > 0,
      has_product_evidence: coverageByCategory.product.fact_count > 0,
      has_market_evidence: coverageByCategory.market.fact_count > 0,
      has_traction_evidence: coverageByCategory.traction.fact_count > 0,
      has_wallet_evidence: coverageByCategory.wallet.fact_count > 0,
      has_portfolio_context_evidence: coverageByCategory.portfolio_context.fact_count > 0,
      has_contradictions: contradictionFlags.length > 0,
    },
    categorical: {
      category: proposal.category,
      stage: proposal.stage,
      wallet_activity_level: normalizeEnumValue(
        readFactString(factsByKey, "activity_level"),
        WALLET_ACTIVITY_LEVELS,
        "unknown",
      ),
      wallet_age_label: normalizeEnumValue(
        readFactObjectString(factsByKey, "wallet_age_estimate", "label"),
        WALLET_AGE_LABELS,
        "unknown",
      ),
      market_trend_label: normalizeEnumValue(
        readFactObjectPathString(factsByKey, "market_intelligence_summary", ["trend", "trend_label"]),
        MARKET_TREND_LABELS,
        "unknown",
      ),
      market_novelty_label: normalizeEnumValue(
        readFactObjectPathString(factsByKey, "market_intelligence_summary", ["novelty", "novelty_label"]),
        MARKET_NOVELTY_LABELS,
        "unknown",
      ),
      valuation_confidence_label: normalizeEnumValue(
        readFactObjectString(factsByKey, "valuation_estimate_range", "confidence"),
        VALUATION_CONFIDENCE_LABELS,
        "unknown",
      ),
      contradiction_flags: contradictionFlags,
      thin_evidence_categories: thinEvidenceCategories,
    },
    coverage: {
      by_category: coverageByCategory,
      support_summary: buildSupportSummary(evidence.facts, evidence.support_summary),
      freshness_summary: evidence.freshness_summary,
    },
    missingness_map: buildMissingnessMap(missingnessMap, proposal, coverageByCategory),
    missingness_summary: {
      total_missing_count: 0,
      missing_proposal_fields: 0,
      missing_evidence_fields: 0,
      thin_evidence_categories: thinEvidenceCategories,
    },
  });

  return FeatureVectorSchema.parse({
    ...features,
    numeric: {
      ...features.numeric,
      stale_fact_ratio: evidence.facts.length > 0 ? evidence.freshness_summary.stale_fact_count / evidence.facts.length : 0,
    },
    missingness_summary: summarizeMissingness(features.missingness_map, thinEvidenceCategories),
  });
}

export function validateFeatures(features: unknown): { ok: boolean; errors: string[] } {
  const parsed = FeatureVectorSchema.safeParse(features);
  if (parsed.success) {
    return { ok: true, errors: [] };
  }
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    }),
  };
}

function remapProposalInput(input: unknown): Record<string, unknown> {
  const record = asRecord(input);
  return {
    proposal_id: getString(record, "proposal_id", "id"),
    name: getString(record, "name") ?? "",
    website_url: getString(record, "website_url"),
    github_url: getString(record, "github_url"),
    short_description: getString(record, "short_description"),
    description: getString(record, "description"),
    category: getString(record, "category"),
    stage: getString(record, "stage"),
    team_size: record?.team_size,
    requested_funding_usd: record?.requested_funding_usd ?? record?.requested_funding,
    recipient_wallet: getString(record, "recipient_wallet"),
    recipient_solana_address: getString(record, "recipient_solana_address"),
    recipient_evm_address: getString(record, "recipient_evm_address"),
    preferred_payout_chain: getString(record, "preferred_payout_chain"),
    team_background: getString(record, "team_background"),
    market_summary: getString(record, "market_summary"),
    traction_summary: getString(record, "traction_summary"),
    budget_breakdown: record?.budget_breakdown,
    requested_milestones: record?.requested_milestones,
  };
}

function groupFactsByKey(facts: CanonicalEvidence["facts"]): Map<string, CanonicalEvidence["facts"]> {
  const result = new Map<string, CanonicalEvidence["facts"]>();
  for (const fact of facts) {
    const bucket = result.get(fact.key) ?? [];
    bucket.push(fact);
    result.set(fact.key, bucket);
  }
  return result;
}

function buildCoverageByCategory(
  facts: CanonicalEvidence["facts"],
): Record<(typeof COVERAGE_CATEGORIES)[number], z.infer<typeof CategoryCoverageSchema>> {
  const initial = Object.fromEntries(
    COVERAGE_CATEGORIES.map((key) => [
      key,
      {
        fact_count: 0,
        average_confidence: 0,
        support_ratio: 0,
        contradicted_fact_count: 0,
        stale_fact_count: 0,
        thin_evidence: true,
      },
    ]),
  ) as Record<(typeof COVERAGE_CATEGORIES)[number], z.infer<typeof CategoryCoverageSchema>>;

  for (const key of COVERAGE_CATEGORIES) {
    const categoryFacts = facts.filter((fact) => fact.category === key);
    const factCount = categoryFacts.length;
    const averageConfidence =
      factCount > 0 ? categoryFacts.reduce((sum, fact) => sum + fact.confidence, 0) / factCount : 0;
    const supportRatio = computeSupportRatio(categoryFacts);
    const contradictedFactCount = categoryFacts.filter((fact) => fact.support_status === "contradicted").length;
    const staleFactCount = categoryFacts.filter((fact) => (fact.freshness_days ?? 0) > 180).length;

    initial[key] = {
      fact_count: factCount,
      average_confidence: round(averageConfidence, 4),
      support_ratio: round(supportRatio, 4),
      contradicted_fact_count: contradictedFactCount,
      stale_fact_count: staleFactCount,
      thin_evidence: factCount === 0 || averageConfidence < 0.55 || supportRatio < 0.5,
    };
  }

  return initial;
}

function buildSupportSummary(
  facts: CanonicalEvidence["facts"],
  current: CanonicalEvidence["support_summary"],
): Record<(typeof SUPPORT_STATUSES)[number], number> {
  const result = Object.fromEntries(SUPPORT_STATUSES.map((status) => [status, 0])) as Record<
    (typeof SUPPORT_STATUSES)[number],
    number
  >;
  for (const fact of facts) {
    result[fact.support_status] += 1;
  }
  for (const status of SUPPORT_STATUSES) {
    const incoming = current[status];
    if (typeof incoming === "number") {
      result[status] = Math.max(result[status], incoming);
    }
  }
  return result;
}

function buildMissingnessMap(
  map: Record<string, z.infer<typeof MissingnessEntrySchema>>,
  proposal: CanonicalProposal,
  coverage: Record<(typeof COVERAGE_CATEGORIES)[number], z.infer<typeof CategoryCoverageSchema>>,
): Record<string, z.infer<typeof MissingnessEntrySchema>> {
  const result = { ...map };
  for (const [key, present, reason] of [
    ["proposal.website_url", Boolean(proposal.website_url), "Website URL was not provided."],
    ["proposal.github_url", Boolean(proposal.github_url), "GitHub URL was not provided."],
    ["proposal.team_background", Boolean(proposal.team_background), "Team background was not provided."],
    ["proposal.market_summary", Boolean(proposal.market_summary), "Market summary was not provided."],
    ["proposal.traction_summary", Boolean(proposal.traction_summary), "Traction summary was not provided."],
  ] as const) {
    result[key] = present ? { missing: false, source: "proposal" } : { missing: true, source: "proposal", reason };
  }
  for (const category of COVERAGE_CATEGORIES) {
    result[`coverage.${category}`] =
      coverage[category].fact_count > 0
        ? { missing: false, source: "evidence" }
        : {
            missing: true,
            source: "evidence",
            reason: `No normalized ${category} evidence was available.`,
          };
  }
  return result;
}

function summarizeMissingness(
  map: Record<string, z.infer<typeof MissingnessEntrySchema>>,
  thinEvidenceCategories: Array<(typeof COVERAGE_CATEGORIES)[number]>,
): z.infer<typeof MissingnessSummarySchema> {
  const entries = Object.entries(map);
  return {
    total_missing_count: entries.filter(([, entry]) => entry.missing).length,
    missing_proposal_fields: entries.filter(([key, entry]) => key.startsWith("proposal.") && entry.missing).length,
    missing_evidence_fields: entries.filter(([key, entry]) => !key.startsWith("proposal.") && entry.missing).length,
    thin_evidence_categories: thinEvidenceCategories,
  };
}

function recordFeatureNumber(
  map: Record<string, z.infer<typeof MissingnessEntrySchema>>,
  key: string,
  value: number | undefined,
  source: z.infer<typeof FeatureSourceSchema>,
  reason: string,
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    map[key] = { missing: false, source };
    return value;
  }
  map[key] = { missing: true, source: source === "proposal" ? "proposal" : "default", reason };
  return 0;
}

function computeSupportRatio(facts: ReadonlyArray<CanonicalEvidence["facts"][number]>): number {
  if (facts.length === 0) {
    return 0;
  }
  const supportedCount = facts.filter((fact) =>
    ["observed", "supported", "partially_supported", "mixed"].includes(fact.support_status),
  ).length;
  return supportedCount / facts.length;
}

function computeContradictedRatio(facts: ReadonlyArray<CanonicalEvidence["facts"][number]>): number {
  if (facts.length === 0) {
    return 0;
  }
  const contradictedCount = facts.filter((fact) => fact.support_status === "contradicted").length;
  return contradictedCount / facts.length;
}

function computeCoverageRatio(
  coverage: Record<(typeof COVERAGE_CATEGORIES)[number], z.infer<typeof CategoryCoverageSchema>>,
): number {
  const populated = COVERAGE_CATEGORIES.filter((key) => coverage[key].fact_count > 0).length;
  return populated / COVERAGE_CATEGORIES.length;
}

function computeProposalCompletenessRatio(proposal: CanonicalProposal): number {
  const checkpoints = [
    Boolean(proposal.website_url),
    Boolean(proposal.github_url),
    Boolean(proposal.description),
    Boolean(proposal.team_background),
    Boolean(proposal.market_summary),
    Boolean(proposal.traction_summary),
    typeof proposal.team_size === "number",
    typeof proposal.requested_funding_usd === "number",
    proposal.budget_breakdown.length > 0,
    proposal.requested_milestones.length > 0,
    Boolean(proposal.recipient_wallet || proposal.recipient_solana_address || proposal.recipient_evm_address),
  ];
  return checkpoints.filter(Boolean).length / checkpoints.length;
}

function pickBestFact(
  factsByKey: Map<string, CanonicalEvidence["facts"]>,
  key: string,
): CanonicalEvidence["facts"][number] | undefined {
  const facts = factsByKey.get(key) ?? [];
  return [...facts].sort((left, right) => {
    const leftRank = supportRank(left.support_status);
    const rightRank = supportRank(right.support_status);
    if (leftRank !== rightRank) {
      return rightRank - leftRank;
    }
    if (left.confidence !== right.confidence) {
      return right.confidence - left.confidence;
    }
    return right.observed_at.localeCompare(left.observed_at);
  })[0];
}

function supportRank(status: z.infer<typeof SupportStatusSchema>): number {
  const ranks: Record<z.infer<typeof SupportStatusSchema>, number> = {
    observed: 6,
    supported: 5,
    partially_supported: 4,
    mixed: 3,
    unverified: 2,
    missing_evidence: 1,
    contradicted: 0,
  };
  return ranks[status];
}

function readFactNumber(
  factsByKey: Map<string, CanonicalEvidence["facts"]>,
  key: string,
): number | undefined {
  return parseNumber(pickBestFact(factsByKey, key)?.value);
}

function readFactString(
  factsByKey: Map<string, CanonicalEvidence["facts"]>,
  key: string,
): string | undefined {
  const value = pickBestFact(factsByKey, key)?.value;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFactArrayLength(
  factsByKey: Map<string, CanonicalEvidence["facts"]>,
  key: string,
): number {
  const value = pickBestFact(factsByKey, key)?.value;
  return Array.isArray(value) ? value.length : 0;
}

function readFactObjectNumber(
  factsByKey: Map<string, CanonicalEvidence["facts"]>,
  key: string,
  property: string,
): number | undefined {
  const record = asRecord(pickBestFact(factsByKey, key)?.value);
  return parseNumber(record?.[property]);
}

function readFactObjectString(
  factsByKey: Map<string, CanonicalEvidence["facts"]>,
  key: string,
  property: string,
): string | undefined {
  const record = asRecord(pickBestFact(factsByKey, key)?.value);
  return typeof record?.[property] === "string" && String(record[property]).trim()
    ? String(record[property]).trim()
    : undefined;
}

function readFactObjectPathString(
  factsByKey: Map<string, CanonicalEvidence["facts"]>,
  key: string,
  path: string[],
): string | undefined {
  let current: unknown = pickBestFact(factsByKey, key)?.value;
  for (const part of path) {
    const record = asRecord(current);
    if (!record || !(part in record)) {
      return undefined;
    }
    current = record[part];
  }
  return typeof current === "string" && current.trim() ? current.trim() : undefined;
}

function normalizeEnumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value.replace(/[$,%\s,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  const parsed = normalizeOptionalNumber(value);
  return typeof parsed === "number" ? Math.trunc(parsed) : undefined;
}

function normalizeNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return normalizeOptionalInteger(value) ?? null;
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeBudgetBreakdown(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = asRecord(item);
    return {
      category: getString(record, "category") ?? "unspecified",
      amount_usd: record?.amount ?? record?.amount_usd ?? 0,
      notes: getString(record, "notes"),
    };
  });
}

function normalizeMilestones(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = asRecord(item);
    return {
      name: getString(record, "name") ?? "Unnamed milestone",
      description: getString(record, "description") ?? "No description provided.",
      target_days: record?.target_days,
      requested_release_ratio: record?.requested_release_ratio,
    };
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeConfidenceMap(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, inner] of Object.entries(record)) {
    const parsed = parseNumber(inner);
    if (typeof parsed === "number") {
      result[normalizeEnumValue(key, EVIDENCE_FACT_CATEGORIES, "other")] = clamp(parsed, 0, 1);
    }
  }
  return result;
}

function normalizeCountMap(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, inner] of Object.entries(record)) {
    result[normalizeEnumValue(key, SUPPORT_STATUSES, "unverified")] = Math.max(
      0,
      normalizeOptionalInteger(inner) ?? 0,
    );
  }
  return result;
}

function parseNumber(value: unknown): number | undefined {
  return normalizeOptionalNumber(value);
}

function getString(record: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function textLength(value: string | undefined): number {
  return value?.length ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}
