"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

interface BudgetLineItem {
  category: string;
  amount: number;
  notes?: string;
}

interface FounderMilestone {
  name: string;
  description: string;
  target_days?: number;
  requested_release_ratio?: number;
}

interface FundingPackage {
  requested_amount?: number;
  recommended_amount?: number;
  approved_amount: number;
  immediate_release_amount: number;
  escrow_amount: number;
}

interface Milestone {
  sequence: number;
  name: string;
  description: string;
  target_days: number;
  verification_type: string;
  success_metric?: string;
  release_percentage?: number;
  release_amount: number;
}

interface EvaluationSummary {
  overall_score: number;
  confidence_level: string;
  confidence_score?: number;
  risk_classification: string;
  risk_score?: number;
  data_completeness?: number;
  evidence_coverage?: number;
  recommended_funding_amount?: number;
  recommended_allocation_ratio?: number;
  strengths?: string[];
  concerns?: string[];
  policy_notes?: string[];
}

interface ScoreBreakdown {
  team_quality: number;
  market_opportunity: number;
  product_feasibility: number;
  capital_efficiency: number;
  traction_signals: number;
  risk_indicators: number;
}

interface Scorecard {
  schema_version?: string;
  overall_score: number;
  confidence?: number;
  confidence_level?: number;
  risk_classification?: string;
  reason_codes?: string[];
  subscores?: ScoreBreakdown;
  dimension_reason_codes?: Record<string, string[]>;
  risk_band?: {
    label?: string;
    score?: number;
    reason_codes?: string[];
  };
  owner_preferences_used?: Record<string, number>;
  proposal_context?: Record<string, unknown>;
  missingness_summary?: {
    thin_evidence_categories?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface FundingDecision {
  decision: string;
  rationale: string;
  funding_package: FundingPackage;
  milestone_schedule: Milestone[];
  policy_explanation?: string[];
}

interface FundingPackageDraftMilestone {
  amount_usd?: number;
  deliverable_type?: string;
  verification_method?: string;
  deadline?: string;
  [key: string]: unknown;
}

interface FundingPackageDraft {
  schema_version?: string;
  recommendation_label?: string;
  requested_amount_usd?: number;
  recommended_amount_usd?: number;
  treasury_capacity_usd?: number;
  rationale_codes?: string[];
  milestones?: FundingPackageDraftMilestone[];
  [key: string]: unknown;
}

interface DecisionPackageMilestone {
  amount: number;
  deliverable_type: string;
  verification_method: string;
  deadline: string;
}

interface DecisionPackage {
  schema_version?: string;
  decision: string;
  approved_amount: number;
  milestones: DecisionPackageMilestone[];
  rationale: string;
  score_inputs_used?: string[];
  assumptions?: string[];
  requested_revisions?: string[];
  confidence?: number;
  uncertainty_flags?: string[];
  [key: string]: unknown;
}

interface VerifierViolation {
  code: string;
  message: string;
  path?: string;
}

interface VerifierCheck {
  code: string;
  passed: boolean;
  message: string;
}

interface VerifierResult {
  schema_version?: string;
  passed: boolean;
  approved_for_execution?: boolean;
  violation_codes?: string[];
  violations?: VerifierViolation[];
  check_results?: VerifierCheck[];
  [key: string]: unknown;
}

interface DecisionReview {
  schema_version?: string;
  approved_for_execution?: boolean;
  agent_mode_used?: string;
  revision_attempts?: number;
  warnings?: string[];
  attempts?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface TreasuryStrategyAllocation {
  strategy_name: string;
  amount: number;
  liquidity_profile: string;
  rationale: string;
}

interface TreasuryAllocation {
  total_capital: number;
  available_for_new_commitments: number;
  hot_reserve: number;
  committed_reserve: number;
  idle_treasury: number;
  strategic_buffer: number;
  policy_compliant: boolean;
  liquidity_gap?: number;
  strategy_allocations?: TreasuryStrategyAllocation[];
  notes?: string[];
}

interface EvidenceSource {
  id?: string;
  kind?: string;
  label?: string;
  category?: string;
  url?: string;
  provider?: string;
  source_type?: string;
  source_id?: string;
  invocation_id?: string;
  observed_at?: string;
  endpoint?: string;
  method?: string;
  request_signature?: string;
  raw_payload_hash?: string;
  metadata?: Record<string, unknown>;
}

interface EvidenceFact {
  id?: string;
  category?: string;
  key?: string;
  claim?: string;
  value?: unknown;
  observed_at?: string;
  support_status?: string;
  contradiction_flags?: string[];
  confidence?: number;
  freshness_days?: number;
}

interface EvidenceBundle {
  facts?: EvidenceFact[];
  sources?: EvidenceSource[];
  confidence?: {
    overall?: number;
  };
  contradiction_flags?: string[];
  raw_payload_hash?: string;
}

interface ClaimAssessment {
  category?: string;
  claim?: string;
  status?: string;
  support_status?: string;
  contradiction_flags?: string[];
  rationale?: string;
  evidence_ids?: string[];
  [key: string]: unknown;
}

interface FeatureVector {
  schema_version?: string;
  extracted_at?: string;
  numeric?: Record<string, number>;
  boolean_flags?: Record<string, boolean | number>;
  categorical?: Record<string, string>;
  coverage?: Record<string, number>;
  missingness_map?: Record<string, boolean>;
  missingness_summary?: {
    thin_evidence_categories?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface EnrichedData {
  project_name?: string;
  generated_at?: string;
  website_scraped?: boolean;
  github_scraped?: boolean;
  wallet_scraped?: boolean;
  portfolio_context_applied?: boolean;
  market_intelligence_applied?: boolean;
  metrics?: Record<string, unknown>;
  raw_data?: Record<string, unknown>;
  evidence_sources?: EvidenceSource[];
  evidence_bundle?: EvidenceBundle;
  notes?: string[];
  web_targets?: Array<Record<string, unknown>>;
  support_summary?: Record<string, number>;
  freshness_summary?: {
    stale_fact_count?: number;
    [key: string]: unknown;
  };
  claim_assessments?: ClaimAssessment[];
  market_intelligence_report?: Record<string, unknown> | null;
  market_intelligence_cache?: Record<string, unknown> | null;
}

interface Project {
  id: string;
  name: string;
  website_url: string;
  short_description?: string;
  description?: string;
  category: string;
  status: string;
  ranking_score?: number;
  funding_amount?: number;
  created_at?: string;
  updated_at?: string;
  reviewed_at?: string;
  stage?: string;
  team_size?: number;
  requested_funding?: number;
  github_url?: string;
  recipient_wallet?: string;
  recipient_solana_address?: string;
  recipient_evm_address?: string;
  preferred_payout_chain?: string;
  team_background?: string;
  market_summary?: string;
  traction_summary?: string;
  budget_breakdown?: BudgetLineItem[];
  requested_milestones?: FounderMilestone[];
  evaluation?: EvaluationSummary;
  enriched_data?: EnrichedData;
  feature_vector?: FeatureVector;
  scorecard?: Scorecard;
  funding_package_draft?: FundingPackageDraft;
  decision_package?: DecisionPackage;
  verifier_result?: VerifierResult;
  decision_review?: DecisionReview;
  treasury_allocation?: TreasuryAllocation;
  funding_decision?: FundingDecision;
  execution_status?: string;
  execution_plan_json?: Record<string, unknown>;
}

interface FundingExecutionRecord {
  record_id: string;
  project_id: string;
  plan_id: string;
  action_id: string;
  action_type: string;
  status: string;
  payout_chain: string;
  recipient: string;
  amount: number;
  milestone_id?: string;
  milestone_name?: string;
  verification_method?: string;
  provider: string;
  provider_metadata?: Record<string, unknown>;
  escrow_uid?: string;
  tx_hash?: string;
  error?: string;
  raw_result?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

const STATUS_STEPS = ["submitted", "processing", "reviewed", "funded"] as const;

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  processing: "Reviewing",
  reviewed: "Scored",
  funded: "Decision",
};

function getStepIndex(status: string): number {
  switch (status) {
    case "submitted":
      return 0;
    case "processing":
      return 1;
    case "reviewed":
    case "ranked":
      return 2;
    case "funded":
    case "rejected":
      return 3;
    default:
      return 0;
  }
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || Number.isNaN(amount)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: number | undefined, digits = 2): string {
  if (value === undefined || Number.isNaN(value)) return "N/A";
  return value.toFixed(digits);
}

function formatPercent(value: number | undefined, fractionDigits = 0): string {
  if (value === undefined || Number.isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

function formatPercentValue(value: number | undefined, fractionDigits = 0): string {
  if (value === undefined || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(fractionDigits)}%`;
}

function labelize(value: string | undefined): string {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shortenWallet(value: string): string {
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortenHash(value: string | undefined): string {
  if (!value) return "N/A";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function executionStatusTone(
  status: string | undefined,
): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "completed":
      return "success";
    case "dry_run":
    case "processing":
    case "partial":
      return "warning";
    case "failed":
    case "blocked":
      return "danger";
    default:
      return "neutral";
  }
}

function recordStatusTone(
  status: string | undefined,
): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "succeeded":
      return "success";
    case "dry_run":
    case "planned":
      return "warning";
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}

function sourceLabel(source: EvidenceSource, index: number): string {
  return labelize(
    source.label ||
      source.kind ||
      source.source_type ||
      source.provider ||
      source.source_id ||
      source.invocation_id ||
      `source_${index + 1}`,
  );
}

function sourceHref(source: EvidenceSource): string | null {
  return typeof source.url === "string" && source.url.trim() ? source.url : null;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function filterProjects(projects: Project[], query: string): Project[] {
  const searchTerm = query.trim().toLowerCase();
  if (!searchTerm) return [];
  return projects.filter((project) =>
    [
      project.id,
      project.name,
      project.website_url,
      project.github_url,
      project.recipient_wallet,
      project.recipient_solana_address,
      project.recipient_evm_address,
    ]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(searchTerm)),
  );
}

function primitiveMetricEntries(
  record: Record<string, unknown> | undefined,
  keys?: string[],
): Array<[string, string]> {
  if (!record) return [];
  const entries = keys
    ? keys
        .filter((key) => key in record)
        .map((key) => [key, record[key]] as const)
    : Object.entries(record);
  return entries
    .filter(([, value]) =>
      ["string", "number", "boolean"].includes(typeof value),
    )
    .map(([key, value]) => [key, String(value)]);
}

function JsonBlock({
  value,
  emptyMessage,
}: {
  value: unknown;
  emptyMessage: string;
}) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "object" && Object.keys(value as object).length === 0)
  ) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyMessage}</p>;
  }

  return (
    <pre className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-xs leading-6 text-[var(--text-secondary)]">
      {formatJson(value)}
    </pre>
  );
}

function KpiCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="motion-card rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
      <p className="mb-1 text-[11px] text-[var(--text-muted)]">{label}</p>
      <div className="text-base font-semibold text-white">{value}</div>
    </div>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const palette = {
    neutral: {
      background: "rgba(255,255,255,0.04)",
      color: "var(--text-secondary)",
    },
    success: {
      background: "rgba(34,197,94,0.15)",
      color: "var(--success)",
    },
    warning: {
      background: "rgba(234,179,8,0.15)",
      color: "var(--warning)",
    },
    danger: {
      background: "rgba(239,68,68,0.15)",
      color: "var(--error)",
    },
  }[tone];

  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
      style={palette}
    >
      {children}
    </span>
  );
}

function DetailPanel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 motion-card ${className}`.trim()}
    >
      <div className="mb-4">
        <p className="text-sm font-semibold text-white">{title}</p>
        {subtitle && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function StatusTimeline({ status }: { status: string }) {
  const currentIndex = getStepIndex(status);

  return (
    <div className="flex w-full items-center gap-0">
      {STATUS_STEPS.map((step, i) => {
        const isCompleted = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                  isCompleted
                    ? "text-white"
                    : "border border-[var(--border-hover)] bg-transparent text-[var(--text-muted)]"
                }${isCurrent ? " shadow-[0_0_12px_rgba(139,92,246,0.5)]" : ""}`}
                style={
                  isCompleted
                    ? {
                        background:
                          "linear-gradient(135deg, var(--violet), var(--blue))",
                      }
                    : undefined
                }
              >
                {isCompleted ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`mt-1.5 whitespace-nowrap text-[10px] ${
                  isCompleted
                    ? "text-[var(--text-secondary)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {STATUS_LABELS[step]}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className="mx-1.5 flex-1">
                <div
                  className="mb-5 h-0.5 w-full rounded-full"
                  style={
                    i < currentIndex
                      ? {
                          background:
                            "linear-gradient(90deg, var(--violet), var(--blue))",
                        }
                      : { background: "var(--border)" }
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProjectCard({
  project,
  apiUrl,
  onProjectUpdated,
}: {
  project: Project;
  apiUrl: string;
  onProjectUpdated: (project: Project) => void;
}) {
  const [draftFields, setDraftFields] = useState({
    website_url: project.website_url || "",
    github_url: project.github_url || "",
    recipient_wallet: project.recipient_wallet || "",
    recipient_solana_address: project.recipient_solana_address || "",
    recipient_evm_address: project.recipient_evm_address || "",
    preferred_payout_chain: project.preferred_payout_chain || "",
  });
  const [activeAction, setActiveAction] = useState<
    "save" | "enrich" | "review" | "execute" | "refresh" | null
  >(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [executionRecords, setExecutionRecords] = useState<FundingExecutionRecord[]>([]);
  const [executionRecordsLoading, setExecutionRecordsLoading] = useState(false);
  const [executionRecordsError, setExecutionRecordsError] = useState("");

  useEffect(() => {
    setDraftFields({
      website_url: project.website_url || "",
      github_url: project.github_url || "",
      recipient_wallet: project.recipient_wallet || "",
      recipient_solana_address: project.recipient_solana_address || "",
      recipient_evm_address: project.recipient_evm_address || "",
      preferred_payout_chain: project.preferred_payout_chain || "",
    });
  }, [
    project.id,
    project.website_url,
    project.github_url,
    project.recipient_wallet,
    project.recipient_solana_address,
    project.recipient_evm_address,
      project.preferred_payout_chain,
  ]);

  useEffect(() => {
    let isActive = true;

    const loadExecutionRecords = async () => {
      if (
        !project.execution_status ||
        project.execution_status === "not_started"
      ) {
        if (isActive) {
          setExecutionRecords([]);
          setExecutionRecordsError("");
          setExecutionRecordsLoading(false);
        }
        return;
      }

      if (isActive) {
        setExecutionRecordsLoading(true);
        setExecutionRecordsError("");
      }

      try {
        const response = await fetch(
          `${apiUrl}/api/projects/${project.id}/execution-records`,
        );
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }
        const data = (await response.json()) as FundingExecutionRecord[];
        if (isActive) {
          setExecutionRecords(data);
        }
      } catch (error) {
        if (isActive) {
          setExecutionRecordsError(
            error instanceof Error
              ? error.message
              : "Unable to load execution records.",
          );
        }
      } finally {
        if (isActive) {
          setExecutionRecordsLoading(false);
        }
      }
    };

    void loadExecutionRecords();

    return () => {
      isActive = false;
    };
  }, [apiUrl, project.execution_status, project.id, project.updated_at]);

  const runAction = async (
    action: "save" | "enrich" | "review" | "execute" | "refresh",
  ) => {
    setActiveAction(action);
    setActionError("");
    setActionMessage("");

    try {
      let response: Response;

      if (action === "save") {
        response = await fetch(`${apiUrl}/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            website_url: draftFields.website_url.trim(),
            github_url: draftFields.github_url.trim() || null,
            recipient_wallet: draftFields.recipient_wallet.trim() || null,
            recipient_solana_address:
              draftFields.recipient_solana_address.trim() || null,
            recipient_evm_address:
              draftFields.recipient_evm_address.trim() || null,
            preferred_payout_chain:
              draftFields.preferred_payout_chain.trim() || null,
          }),
        });
      } else if (action === "enrich") {
        response = await fetch(`${apiUrl}/api/projects/${project.id}/enrich`, {
          method: "POST",
        });
      } else if (action === "review") {
        response = await fetch(`${apiUrl}/api/projects/${project.id}/review`, {
          method: "POST",
        });
      } else if (action === "execute") {
        response = await fetch(
          `${apiUrl}/api/projects/${project.id}/execute-funding`,
          {
            method: "POST",
          },
        );
      } else {
        response = await fetch(`${apiUrl}/api/projects/${project.id}`);
      }

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      let updatedProject: Project;
      if (action === "execute") {
        const executionResponse = (await response.json()) as {
          payment_records?: FundingExecutionRecord[];
        };
        setExecutionRecords(executionResponse.payment_records ?? []);
        setExecutionRecordsError("");
        const refreshedResponse = await fetch(`${apiUrl}/api/projects/${project.id}`);
        if (!refreshedResponse.ok) {
          throw new Error("Execution completed but the project could not be reloaded.");
        }
        updatedProject = (await refreshedResponse.json()) as Project;
      } else {
        updatedProject = (await response.json()) as Project;
      }
      onProjectUpdated(updatedProject);
      setActionMessage(
        action === "save"
          ? "Project inputs updated."
          : action === "enrich"
            ? "Live enrichment completed and review reran."
            : action === "review"
              ? "Deterministic review reran."
              : action === "execute"
                ? "Funding execution completed for the latest verified plan."
              : "Project reloaded from the backend.",
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Action failed unexpectedly.",
      );
    } finally {
      setActiveAction(null);
    }
  };

  const decision = project.funding_decision?.decision;
  const fundingPackage = project.funding_decision?.funding_package;
  const milestones = project.funding_decision?.milestone_schedule ?? [];
  const evidenceBundle = project.enriched_data?.evidence_bundle;
  const evidenceFacts = evidenceBundle?.facts ?? [];
  const evidenceSources = evidenceBundle?.sources ?? [];
  const supportSummary =
    project.enriched_data?.support_summary ?? project.enriched_data?.metrics ?? {};
  const staleFactCount =
    project.enriched_data?.freshness_summary?.stale_fact_count;
  const thinEvidenceCategories =
    project.scorecard?.missingness_summary?.thin_evidence_categories ??
    project.feature_vector?.missingness_summary?.thin_evidence_categories ??
    [];
  const verifierViolations = project.verifier_result?.violations ?? [];
  const failedChecks =
    project.verifier_result?.check_results?.filter((check) => !check.passed) ?? [];
  const strategyAllocations =
    project.treasury_allocation?.strategy_allocations ?? [];
  const treasuryNotes = project.treasury_allocation?.notes ?? [];
  const budgetItems = project.budget_breakdown ?? [];
  const founderMilestones = project.requested_milestones ?? [];
  const claimAssessments = project.enriched_data?.claim_assessments ?? [];
  const marketReport = project.enriched_data?.market_intelligence_report;
  const executionPlan = project.execution_plan_json;
  const executionEscrowActions = Array.isArray(executionPlan?.escrow_actions)
    ? executionPlan.escrow_actions.length
    : 0;
  const executionHasImmediatePayout = Boolean(executionPlan?.immediate_payout);
  const executionTxHashes = executionRecords
    .map((record) => record.tx_hash)
    .filter((value): value is string => Boolean(value));
  const executionEscrowUids = executionRecords
    .map((record) => record.escrow_uid)
    .filter((value): value is string => Boolean(value));
  const marketMetrics = primitiveMetricEntries(project.enriched_data?.metrics, [
    "market_intelligence_score",
    "market_intelligence_confidence_score",
    "market_demand_score",
    "market_validation_score",
    "market_novelty_score",
    "market_trend_score",
    "competition_intensity",
    "github_stars",
    "github_commits_90d",
    "wallet_recent_signature_count",
    "wallet_holdings_count",
  ]);
  const featureNumericEntries = primitiveMetricEntries(
    project.feature_vector?.numeric,
  );
  const featureBooleanEntries = primitiveMetricEntries(
    project.feature_vector?.boolean_flags,
  );
  const featureCategoricalEntries = primitiveMetricEntries(
    project.feature_vector?.categorical,
  );
  const missingFeatureKeys = Object.entries(
    project.feature_vector?.missingness_map ?? {},
  )
    .filter(([, missing]) => Boolean(missing))
    .map(([key]) => key);
  const factCategoryCounts = evidenceFacts.reduce<Record<string, number>>(
    (accumulator, fact) => {
      const category = fact.category || "uncategorized";
      accumulator[category] = (accumulator[category] ?? 0) + 1;
      return accumulator;
    },
    {},
  );

  return (
    <div className="glass-card motion-card p-6 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-white">{project.name}</h3>
            <Badge tone={project.status === "rejected" ? "danger" : "neutral"}>
              {labelize(project.status)}
            </Badge>
            {decision && (
              <Badge
                tone={
                  decision === "reject"
                    ? "danger"
                    : decision === "accept_reduced"
                      ? "warning"
                      : "success"
                }
              >
                {labelize(decision)}
              </Badge>
            )}
          </div>
          {project.short_description && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {project.short_description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>ID: {project.id}</span>
            {project.github_url && <span>Repo: {project.github_url}</span>}
            {project.recipient_wallet && (
              <span title={project.recipient_wallet}>
                Legacy Wallet: {shortenWallet(project.recipient_wallet)}
              </span>
            )}
            {project.recipient_solana_address && (
              <span title={project.recipient_solana_address}>
                Solana: {shortenWallet(project.recipient_solana_address)}
              </span>
            )}
            {project.recipient_evm_address && (
              <span title={project.recipient_evm_address}>
                EVM: {shortenWallet(project.recipient_evm_address)}
              </span>
            )}
          </div>
          <a
            href={project.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs text-[var(--violet)] transition-colors hover:text-[var(--blue)]"
          >
            {project.website_url}
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{labelize(project.category)}</Badge>
          {project.stage && <Badge>{labelize(project.stage)}</Badge>}
          {project.decision_review?.agent_mode_used && (
            <Badge>{`Agent: ${labelize(project.decision_review.agent_mode_used)}`}</Badge>
          )}
          {project.execution_status && (
            <Badge tone={executionStatusTone(project.execution_status)}>
              {`Execution: ${labelize(project.execution_status)}`}
            </Badge>
          )}
        </div>
      </div>

      <div className="px-2 py-4">
        <StatusTimeline status={project.status} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Score"
          value={project.evaluation?.overall_score ?? project.ranking_score ?? "N/A"}
        />
        <KpiCard
          label="Confidence"
          value={labelize(project.evaluation?.confidence_level)}
        />
        <KpiCard
          label="Risk"
          value={labelize(project.evaluation?.risk_classification)}
        />
        <KpiCard
          label="Approved Funding"
          value={formatCurrency(fundingPackage?.approved_amount)}
        />
        <KpiCard label="Milestones" value={milestones.length} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DetailPanel
          title="Proposal Input"
          subtitle="Founder input."
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Team Size" value={project.team_size ?? "N/A"} />
              <KpiCard
                label="Requested Funding"
                value={formatCurrency(project.requested_funding)}
              />
            </div>

            {project.description && (
              <div>
                <p className="mb-1 text-xs text-[var(--text-muted)]">Description</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {project.description}
                </p>
              </div>
            )}

            {project.team_background && (
              <div>
                <p className="mb-1 text-xs text-[var(--text-muted)]">
                  Team Background
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {project.team_background}
                </p>
              </div>
            )}

            {project.market_summary && (
              <div>
                <p className="mb-1 text-xs text-[var(--text-muted)]">
                  Market Summary
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {project.market_summary}
                </p>
              </div>
            )}

            {project.traction_summary && (
              <div>
                <p className="mb-1 text-xs text-[var(--text-muted)]">
                  Traction Summary
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {project.traction_summary}
                </p>
              </div>
            )}

            {budgetItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)]">Budget Breakdown</p>
                {budgetItems.map((item, index) => (
                  <div
                    key={`${project.id}-budget-${index}`}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white">
                        {item.category}
                      </p>
                      <p className="text-sm font-semibold text-white">
                        {formatCurrency(item.amount)}
                      </p>
                    </div>
                    {item.notes && (
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {founderMilestones.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)]">Founder Milestones</p>
                {founderMilestones.map((milestone, index) => (
                  <div
                    key={`${project.id}-founder-ms-${index}`}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white">
                        {milestone.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {milestone.target_days !== undefined
                          ? `Target day ${milestone.target_days}`
                          : "No deadline"}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {milestone.description}
                    </p>
                    {milestone.requested_release_ratio !== undefined && (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Requested release:{" "}
                        {formatPercent(milestone.requested_release_ratio)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DetailPanel>

        <DetailPanel
          title="Project Actions"
          subtitle="Update fields or rerun stages."
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">
                  Website URL
                </label>
                <input
                  value={draftFields.website_url}
                  onChange={(event) =>
                    setDraftFields((current) => ({
                      ...current,
                      website_url: event.target.value,
                    }))
                  }
                  className="input-dark"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">
                  GitHub Repository URL
                </label>
                <input
                  value={draftFields.github_url}
                  onChange={(event) =>
                    setDraftFields((current) => ({
                      ...current,
                      github_url: event.target.value,
                    }))
                  }
                  className="input-dark"
                  placeholder="https://github.com/org/repo"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">
                  Legacy Wallet Field
                </label>
                <input
                  value={draftFields.recipient_wallet}
                  onChange={(event) =>
                    setDraftFields((current) => ({
                      ...current,
                      recipient_wallet: event.target.value,
                    }))
                  }
                  className="input-dark"
                  placeholder="BWgJc8KvCbxqrn2Wggb395c2URfS19a5NoAEVDaiyXCa"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">
                  Recipient Solana Address
                </label>
                <input
                  value={draftFields.recipient_solana_address}
                  onChange={(event) =>
                    setDraftFields((current) => ({
                      ...current,
                      recipient_solana_address: event.target.value,
                    }))
                  }
                  className="input-dark"
                  placeholder="BWgJc8KvCbxqrn2Wggb395c2URfS19a5NoAEVDaiyXCa"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">
                  Recipient EVM Address
                </label>
                <input
                  value={draftFields.recipient_evm_address}
                  onChange={(event) =>
                    setDraftFields((current) => ({
                      ...current,
                      recipient_evm_address: event.target.value,
                    }))
                  }
                  className="input-dark"
                  placeholder="0x47d0079dA447f21bEea09B209BCad84A5d2d2705"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">
                  Preferred Payout Chain
                </label>
                <select
                  value={draftFields.preferred_payout_chain}
                  onChange={(event) =>
                    setDraftFields((current) => ({
                      ...current,
                      preferred_payout_chain: event.target.value,
                    }))
                  }
                  className="input-dark"
                >
                  <option value="">Auto-detect</option>
                  <option value="base_sepolia">Base Sepolia</option>
                  <option value="solana">Solana</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => runAction("save")}
                disabled={activeAction !== null || !draftFields.website_url.trim()}
                className="btn-secondary px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activeAction === "save" ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => runAction("enrich")}
                disabled={activeAction !== null}
                className="btn-gradient px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activeAction === "enrich" ? "Running..." : "Run Enrichment"}
              </button>
              <button
                type="button"
                onClick={() => runAction("review")}
                disabled={activeAction !== null}
                className="btn-secondary px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activeAction === "review" ? "Reviewing..." : "Rerun Review"}
              </button>
              <button
                type="button"
                onClick={() => runAction("execute")}
                disabled={activeAction !== null}
                className="btn-gradient px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activeAction === "execute" ? "Executing..." : "Execute Funding"}
              </button>
              <button
                type="button"
                onClick={() => runAction("refresh")}
                disabled={activeAction !== null}
                className="btn-secondary px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activeAction === "refresh" ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone={project.enriched_data?.website_scraped ? "success" : "neutral"}>
                Website {project.enriched_data?.website_scraped ? "ready" : "pending"}
              </Badge>
              <Badge tone={project.enriched_data?.github_scraped ? "success" : "neutral"}>
                GitHub {project.enriched_data?.github_scraped ? "ready" : "pending"}
              </Badge>
              <Badge tone={project.enriched_data?.wallet_scraped ? "success" : "neutral"}>
                Wallet {project.enriched_data?.wallet_scraped ? "ready" : "pending"}
              </Badge>
              <Badge
                tone={project.enriched_data?.portfolio_context_applied ? "success" : "neutral"}
              >
                Portfolio{" "}
                {project.enriched_data?.portfolio_context_applied ? "ready" : "pending"}
              </Badge>
              <Badge
                tone={project.enriched_data?.market_intelligence_applied ? "success" : "neutral"}
              >
                Market{" "}
                {project.enriched_data?.market_intelligence_applied ? "ready" : "pending"}
              </Badge>
            </div>

            {actionMessage && (
              <p className="text-sm text-[var(--success)]">{actionMessage}</p>
            )}
            {actionError && (
              <p className="text-sm text-[var(--error)]">{actionError}</p>
            )}

            <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
              <span>Created: {formatDate(project.created_at)}</span>
              <span>Updated: {formatDate(project.updated_at)}</span>
              <span>Reviewed: {formatDate(project.reviewed_at)}</span>
            </div>
          </div>
        </DetailPanel>
      </div>

      {project.funding_decision && (
        <div className="mt-6 space-y-4 border-t border-[var(--border)] pt-6">
          <div>
            <p className="mb-1 text-xs text-[var(--text-muted)]">
              Decision Rationale
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {project.funding_decision.rationale}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Approved"
              value={formatCurrency(fundingPackage?.approved_amount)}
            />
            <KpiCard
              label="Immediate"
              value={formatCurrency(fundingPackage?.immediate_release_amount)}
            />
            <KpiCard
              label="Escrowed"
              value={formatCurrency(fundingPackage?.escrow_amount)}
            />
          </div>

          {milestones.length > 0 && (
            <div>
              <p className="mb-3 text-xs text-[var(--text-muted)]">
                Milestone Release Schedule
              </p>
              <div className="space-y-3">
                {milestones.map((milestone) => (
                  <div
                    key={`${project.id}-${milestone.sequence}`}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
                  >
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {milestone.sequence}. {milestone.name}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          {milestone.description}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-white">
                        {formatCurrency(milestone.release_amount)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                      <span>Target day {milestone.target_days}</span>
                      <span>{labelize(milestone.verification_type)}</span>
                      {milestone.success_metric && <span>{milestone.success_metric}</span>}
                      {milestone.release_percentage !== undefined && (
                        <span>{formatPercent(milestone.release_percentage)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {project.funding_decision.policy_explanation &&
            project.funding_decision.policy_explanation.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  Policy Explanation
                </p>
                <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                  {project.funding_decision.policy_explanation.map((item, index) => (
                    <li key={`${project.id}-policy-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DetailPanel
            title="Evidence"
            subtitle="Facts and provenance."
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="Facts" value={evidenceFacts.length} />
                <KpiCard label="Sources" value={evidenceSources.length} />
                <KpiCard
                  label="Confidence"
                  value={formatPercent(evidenceBundle?.confidence?.overall)}
                />
                <KpiCard label="Stale Facts" value={staleFactCount ?? 0} />
              </div>

              {Object.keys(factCategoryCounts).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--text-muted)]">Fact Categories</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(factCategoryCounts).map(([category, count]) => (
                      <Badge key={`${project.id}-fact-cat-${category}`}>
                        {labelize(category)}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)]">Provenance</p>
                {evidenceSources.length > 0 ? (
                  <div className="space-y-2">
                    {evidenceSources.slice(0, 6).map((source, index) => {
                      const href = sourceHref(source);
                      return (
                        <div
                          key={`${project.id}-source-${index}`}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--text-secondary)]"
                        >
                          <p className="font-medium text-white">
                            {sourceLabel(source, index)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {source.request_signature ||
                              source.source_id ||
                              source.invocation_id ||
                              source.id ||
                              "Generated source"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                            {source.category && <span>{labelize(source.category)}</span>}
                            {source.method && <span>{source.method}</span>}
                            {source.observed_at && (
                              <span>{formatDate(source.observed_at)}</span>
                            )}
                          </div>
                          {href && (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-block text-xs text-[var(--violet)] transition-colors hover:text-[var(--blue)]"
                            >
                              {href}
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    No external evidence bundle has been stored yet.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)]">Coverage Signals</p>
                <div className="flex flex-wrap gap-2">
                  {thinEvidenceCategories.length > 0 ? (
                    thinEvidenceCategories.map((item) => (
                      <Badge key={`${project.id}-thin-${item}`} tone="warning">
                        Thin: {labelize(item)}
                      </Badge>
                    ))
                  ) : (
                    <Badge tone="success">Coverage looks sufficient</Badge>
                  )}
                  {Object.entries(supportSummary).map(([key, value]) =>
                    typeof value === "number" ? (
                      <Badge key={`${project.id}-support-${key}`}>
                        {labelize(key)}: {value}
                      </Badge>
                    ) : null,
                  )}
                </div>
              </div>

              {evidenceFacts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--text-muted)]">Sample Facts</p>
                  {evidenceFacts.slice(0, 5).map((fact, index) => (
                    <div
                      key={`${project.id}-fact-${index}`}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{labelize(fact.category)}</Badge>
                        {fact.key && <Badge>{labelize(fact.key)}</Badge>}
                        {fact.support_status && (
                          <Badge
                            tone={
                              fact.support_status === "contradicted"
                                ? "danger"
                                : fact.support_status === "observed" ||
                                    fact.support_status === "supported"
                                  ? "success"
                                  : "neutral"
                            }
                          >
                            {labelize(fact.support_status)}
                          </Badge>
                        )}
                      </div>
                      {fact.claim && (
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">
                          {fact.claim}
                        </p>
                      )}
                      {fact.freshness_days !== undefined && (
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          Freshness: {fact.freshness_days} day(s)
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                <span>Bundle hash: {shortenHash(evidenceBundle?.raw_payload_hash)}</span>
                <span>
                  Contradictions: {evidenceBundle?.contradiction_flags?.length ?? 0}
                </span>
                {project.enriched_data?.generated_at && (
                  <span>Generated: {formatDate(project.enriched_data.generated_at)}</span>
                )}
              </div>

              {(project.enriched_data?.notes?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--text-muted)]">Collector Notes</p>
                  <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                    {project.enriched_data?.notes?.map((note, index) => (
                      <li key={`${project.id}-note-${index}`}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(project.enriched_data?.web_targets?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--text-muted)]">Web Targets</p>
                  <div className="flex flex-wrap gap-2">
                    {project.enriched_data?.web_targets?.map((target, index) => (
                      <Badge key={`${project.id}-target-${index}`}>
                        {String(target.url || target.path || `Target ${index + 1}`)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DetailPanel>

          <DetailPanel
            title="Market Intelligence"
            subtitle="Market metrics."
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard
                  label="Applied"
                  value={project.enriched_data?.market_intelligence_applied ? "Yes" : "No"}
                />
                <KpiCard
                  label="Website"
                  value={project.enriched_data?.website_scraped ? "Yes" : "No"}
                />
                <KpiCard
                  label="GitHub"
                  value={project.enriched_data?.github_scraped ? "Yes" : "No"}
                />
                <KpiCard
                  label="Wallet"
                  value={project.enriched_data?.wallet_scraped ? "Yes" : "No"}
                />
              </div>

              {marketMetrics.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {marketMetrics.map(([key, value]) => (
                    <KpiCard
                      key={`${project.id}-market-${key}`}
                      label={labelize(key)}
                      value={value}
                    />
                  ))}
                </div>
              )}

              <JsonBlock
                value={marketReport}
                emptyMessage="No structured market report has been stored yet."
              />
            </div>
          </DetailPanel>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DetailPanel
            title="Feature Vector"
            subtitle="Deterministic features."
          >
            {project.feature_vector ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard label="Numeric" value={featureNumericEntries.length} />
                  <KpiCard label="Boolean" value={featureBooleanEntries.length} />
                  <KpiCard
                    label="Categorical"
                    value={featureCategoricalEntries.length}
                  />
                  <KpiCard label="Missing" value={missingFeatureKeys.length} />
                </div>

                {thinEvidenceCategories.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--text-muted)]">Thin Evidence</p>
                    <div className="flex flex-wrap gap-2">
                      {thinEvidenceCategories.map((item) => (
                        <Badge key={`${project.id}-feature-thin-${item}`} tone="warning">
                          {labelize(item)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {missingFeatureKeys.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--text-muted)]">Missing Features</p>
                    <div className="flex flex-wrap gap-2">
                      {missingFeatureKeys.slice(0, 16).map((item) => (
                        <Badge key={`${project.id}-feature-missing-${item}`}>
                          {labelize(item)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <JsonBlock
                  value={project.feature_vector}
                  emptyMessage="Feature vector unavailable."
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No feature vector has been generated for this proposal yet.
              </p>
            )}
          </DetailPanel>

          <DetailPanel
            title="Claim Assessments"
            subtitle="Support and contradiction checks."
          >
            {claimAssessments.length > 0 ? (
              <div className="space-y-3">
                {claimAssessments.map((assessment, index) => (
                  <div
                    key={`${project.id}-assessment-${index}`}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {assessment.category && (
                        <Badge>{labelize(assessment.category)}</Badge>
                      )}
                      {(assessment.status || assessment.support_status) && (
                        <Badge
                          tone={
                            assessment.status === "contradicted" ||
                            assessment.support_status === "contradicted"
                              ? "danger"
                              : assessment.status === "supported" ||
                                  assessment.support_status === "supported"
                                ? "success"
                                : "warning"
                          }
                        >
                          {labelize(
                            assessment.status || assessment.support_status,
                          )}
                        </Badge>
                      )}
                    </div>
                    {assessment.claim && (
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {assessment.claim}
                      </p>
                    )}
                    {assessment.rationale && (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        {assessment.rationale}
                      </p>
                    )}
                    {assessment.evidence_ids && assessment.evidence_ids.length > 0 && (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Evidence refs: {assessment.evidence_ids.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No contradiction results are stored yet.
              </p>
            )}
          </DetailPanel>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DetailPanel
            title="Scorecard"
            subtitle="Subscores and risk."
          >
            {project.scorecard ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard
                    label="Overall"
                    value={formatNumber(project.scorecard.overall_score)}
                  />
                  <KpiCard
                    label="Confidence"
                    value={formatPercent(project.scorecard.confidence, 1)}
                  />
                  <KpiCard
                    label="Risk"
                    value={labelize(
                      project.scorecard.risk_classification ||
                        project.evaluation?.risk_classification,
                    )}
                  />
                  <KpiCard
                    label="Risk Score"
                    value={
                      project.scorecard.risk_band?.score !== undefined
                        ? formatNumber(project.scorecard.risk_band.score)
                        : "N/A"
                    }
                  />
                </div>

                {project.scorecard.subscores && (
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(project.scorecard.subscores).map(([key, value]) => (
                      <KpiCard
                        key={`${project.id}-score-${key}`}
                        label={labelize(key)}
                        value={formatNumber(value)}
                      />
                    ))}
                  </div>
                )}

                {project.scorecard.reason_codes &&
                  project.scorecard.reason_codes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--text-muted)]">Reason Codes</p>
                      <div className="flex flex-wrap gap-2">
                        {project.scorecard.reason_codes.map((reason) => (
                          <Badge key={`${project.id}-reason-${reason}`}>
                            {labelize(reason)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                {project.scorecard.risk_band?.reason_codes &&
                  project.scorecard.risk_band.reason_codes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--text-muted)]">
                        Risk Reasons
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {project.scorecard.risk_band.reason_codes.map((reason) => (
                          <Badge key={`${project.id}-risk-reason-${reason}`}>
                            {labelize(reason)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                <JsonBlock
                  value={project.scorecard}
                  emptyMessage="No scorecard is available."
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No scorecard is available for this proposal yet.
              </p>
            )}
          </DetailPanel>

          <DetailPanel
            title="Funding Package Draft"
            subtitle="Draft recommendation."
          >
            {project.funding_package_draft ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard
                    label="Label"
                    value={labelize(project.funding_package_draft.recommendation_label)}
                  />
                  <KpiCard
                    label="Requested"
                    value={formatCurrency(
                      project.funding_package_draft.requested_amount_usd,
                    )}
                  />
                  <KpiCard
                    label="Recommended"
                    value={formatCurrency(
                      project.funding_package_draft.recommended_amount_usd,
                    )}
                  />
                  <KpiCard
                    label="Treasury Capacity"
                    value={formatCurrency(
                      project.funding_package_draft.treasury_capacity_usd,
                    )}
                  />
                </div>

                {project.funding_package_draft.rationale_codes &&
                  project.funding_package_draft.rationale_codes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--text-muted)]">
                        Draft Rationale Codes
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {project.funding_package_draft.rationale_codes.map((reason) => (
                          <Badge key={`${project.id}-draft-${reason}`}>
                            {labelize(reason)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                {project.funding_package_draft.milestones &&
                  project.funding_package_draft.milestones.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--text-muted)]">
                        Draft Milestones
                      </p>
                      {project.funding_package_draft.milestones.map((milestone, index) => (
                        <div
                          key={`${project.id}-draft-milestone-${index}`}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-medium text-white">
                              {milestone.deliverable_type
                                ? labelize(milestone.deliverable_type)
                                : `Milestone ${index + 1}`}
                            </p>
                            <p className="text-sm font-semibold text-white">
                              {formatCurrency(milestone.amount_usd)}
                            </p>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                            {milestone.verification_method && (
                              <span>{labelize(milestone.verification_method)}</span>
                            )}
                            {milestone.deadline && (
                              <span>{formatDate(milestone.deadline)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                <JsonBlock
                  value={project.funding_package_draft}
                  emptyMessage="No funding package draft is available."
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No funding package draft is attached to this proposal yet.
              </p>
            )}
          </DetailPanel>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DetailPanel
            title="Treasury"
            subtitle="Buckets and allocation."
          >
            {project.treasury_allocation ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <KpiCard
                    label="Hot Reserve"
                    value={formatCurrency(project.treasury_allocation.hot_reserve)}
                  />
                  <KpiCard
                    label="Committed"
                    value={formatCurrency(
                      project.treasury_allocation.committed_reserve,
                    )}
                  />
                  <KpiCard
                    label="Idle"
                    value={formatCurrency(project.treasury_allocation.idle_treasury)}
                  />
                  <KpiCard
                    label="Buffer"
                    value={formatCurrency(
                      project.treasury_allocation.strategic_buffer,
                    )}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge
                    tone={
                      project.treasury_allocation.policy_compliant
                        ? "success"
                        : "danger"
                    }
                  >
                    {project.treasury_allocation.policy_compliant
                      ? "Policy compliant"
                      : "Policy violation"}
                  </Badge>
                  <span className="text-[var(--text-muted)]">
                    Available:{" "}
                    {formatCurrency(
                      project.treasury_allocation.available_for_new_commitments,
                    )}
                  </span>
                  {project.treasury_allocation.liquidity_gap !== undefined && (
                    <span className="text-[var(--text-muted)]">
                      Liquidity gap:{" "}
                      {formatCurrency(project.treasury_allocation.liquidity_gap)}
                    </span>
                  )}
                </div>

                {strategyAllocations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--text-muted)]">
                      Idle Allocation Suggestion
                    </p>
                    {strategyAllocations.map((allocation, index) => (
                      <div
                        key={`${project.id}-allocation-${index}`}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {allocation.strategy_name}
                            </p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              {labelize(allocation.liquidity_profile)}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-white">
                            {formatCurrency(allocation.amount)}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">
                          {allocation.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {treasuryNotes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--text-muted)]">Treasury Notes</p>
                    <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                      {treasuryNotes.map((note, index) => (
                        <li key={`${project.id}-treasury-note-${index}`}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No treasury snapshot is attached to this proposal yet.
              </p>
            )}
          </DetailPanel>

          <DetailPanel
            title="Verifier"
            subtitle="Policy checks."
          >
            {project.verifier_result || project.decision_review ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={project.verifier_result?.passed ? "success" : "danger"}>
                    {project.verifier_result?.passed ? "Pass" : "Fail"}
                  </Badge>
                  {project.decision_review?.agent_mode_used && (
                    <Badge>{`Agent: ${labelize(project.decision_review.agent_mode_used)}`}</Badge>
                  )}
                  {project.decision_review?.revision_attempts !== undefined && (
                    <Badge>{`Attempts: ${project.decision_review.revision_attempts}`}</Badge>
                  )}
                  {project.decision_review?.approved_for_execution !== undefined && (
                    <Badge
                      tone={
                        project.decision_review.approved_for_execution
                          ? "success"
                          : "danger"
                      }
                    >
                      {project.decision_review.approved_for_execution
                        ? "Approved for execution"
                        : "Blocked for execution"}
                    </Badge>
                  )}
                </div>

                {verifierViolations.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--text-muted)]">
                      Violated Constraints
                    </p>
                    {verifierViolations.map((violation, index) => (
                      <div
                        key={`${project.id}-violation-${index}`}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                      >
                        <p className="text-sm font-medium text-white">
                          {labelize(violation.code)}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          {violation.message}
                        </p>
                        {violation.path && (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            Path: {violation.path}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">
                    No policy violations were reported.
                  </p>
                )}

                {project.decision_review?.warnings &&
                  project.decision_review.warnings.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--text-muted)]">Warnings</p>
                      <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                        {project.decision_review.warnings.map((warning, index) => (
                          <li key={`${project.id}-warning-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {failedChecks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--text-muted)]">Failed Checks</p>
                    <div className="flex flex-wrap gap-2">
                      {failedChecks.map((check) => (
                        <Badge key={`${project.id}-failed-check-${check.code}`}>
                          {labelize(check.code)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <JsonBlock
                  value={{
                    verifier_result: project.verifier_result,
                    decision_review: project.decision_review,
                  }}
                  emptyMessage="No verifier result is available."
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No verifier result is available for this proposal yet.
              </p>
            )}
          </DetailPanel>

          <DetailPanel
            title="Execution"
            subtitle="Funding handoff."
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <KpiCard
                  label="Status"
                  value={
                    <Badge tone={executionStatusTone(project.execution_status)}>
                      {labelize(project.execution_status)}
                    </Badge>
                  }
                />
                <KpiCard
                  label="Chain"
                  value={labelize(
                    typeof executionPlan?.payout_chain === "string"
                      ? executionPlan.payout_chain
                      : project.preferred_payout_chain,
                  )}
                />
                <KpiCard
                  label="Immediate Payout"
                  value={executionHasImmediatePayout ? "Yes" : "No"}
                />
                <KpiCard label="Escrows" value={executionEscrowActions} />
                <KpiCard label="Records" value={executionRecords.length} />
                <KpiCard label="Tx Hashes" value={executionTxHashes.length} />
              </div>

              <div className="flex flex-wrap gap-2">
                {project.recipient_solana_address && (
                  <Badge>{`Solana: ${shortenWallet(project.recipient_solana_address)}`}</Badge>
                )}
                {project.recipient_evm_address && (
                  <Badge>{`EVM: ${shortenWallet(project.recipient_evm_address)}`}</Badge>
                )}
              </div>

              {executionEscrowUids.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--text-muted)]">Escrow UIDs</p>
                  <div className="flex flex-wrap gap-2">
                    {executionEscrowUids.map((uid) => (
                      <Badge key={`${project.id}-escrow-uid-${uid}`}>
                        {shortenHash(uid)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {executionTxHashes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--text-muted)]">Transaction Hashes</p>
                  <div className="flex flex-wrap gap-2">
                    {executionTxHashes.map((hash) => (
                      <Badge key={`${project.id}-tx-hash-${hash}`}>
                        {shortenHash(hash)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-xs text-[var(--text-muted)]">Payment Records</p>
                {executionRecordsLoading ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    Loading payment records...
                  </p>
                ) : executionRecordsError ? (
                  <p className="text-sm text-[var(--error)]">{executionRecordsError}</p>
                ) : executionRecords.length > 0 ? (
                  <div className="space-y-3">
                    {executionRecords.map((record) => (
                      <div
                        key={record.record_id}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-white">
                                {labelize(record.action_type)}
                              </p>
                              <Badge tone={recordStatusTone(record.status)}>
                                {labelize(record.status)}
                              </Badge>
                              <Badge>{labelize(record.payout_chain)}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                              <span>{record.provider}</span>
                              {record.milestone_name && <span>{record.milestone_name}</span>}
                              {record.verification_method && (
                                <span>{labelize(record.verification_method)}</span>
                              )}
                              {record.created_at && (
                                <span>{formatDate(record.created_at)}</span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-white">
                            {formatCurrency(record.amount)}
                          </p>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <KpiCard
                            label="Recipient"
                            value={<span title={record.recipient}>{shortenWallet(record.recipient)}</span>}
                          />
                          <KpiCard
                            label="Escrow UID"
                            value={
                              record.escrow_uid ? (
                                <span title={record.escrow_uid}>{shortenHash(record.escrow_uid)}</span>
                              ) : (
                                "N/A"
                              )
                            }
                          />
                          <KpiCard
                            label="Tx Hash"
                            value={
                              record.tx_hash ? (
                                <span title={record.tx_hash}>{shortenHash(record.tx_hash)}</span>
                              ) : (
                                "N/A"
                              )
                            }
                          />
                          <KpiCard
                            label="Action ID"
                            value={<span title={record.action_id}>{shortenHash(record.action_id)}</span>}
                          />
                        </div>

                        {record.error && (
                          <p className="mt-3 text-sm text-[var(--error)]">{record.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    No payout or escrow records exist yet. Run Execute Funding after the verifier approves execution.
                  </p>
                )}
              </div>

              <JsonBlock
                value={executionPlan}
                emptyMessage="No execution plan is stored yet. Use Execute Funding after the verifier approves execution."
              />
            </div>
          </DetailPanel>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DetailPanel
            title="Decision JSON"
            subtitle="Agent output."
          >
            {project.decision_package ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard
                    label="Decision"
                    value={labelize(project.decision_package.decision)}
                  />
                  <KpiCard
                    label="Approved"
                    value={formatCurrency(project.decision_package.approved_amount)}
                  />
                  <KpiCard
                    label="Confidence"
                    value={formatPercent(project.decision_package.confidence, 1)}
                  />
                  <KpiCard
                    label="Milestones"
                    value={project.decision_package.milestones.length}
                  />
                </div>

                <div>
                  <p className="mb-1 text-xs text-[var(--text-muted)]">Rationale</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {project.decision_package.rationale}
                  </p>
                </div>

                {project.decision_package.score_inputs_used &&
                  project.decision_package.score_inputs_used.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--text-muted)]">
                        Score Inputs Used
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {project.decision_package.score_inputs_used.map((input) => (
                          <Badge key={`${project.id}-input-${input}`}>
                            {labelize(input)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                {project.decision_package.requested_revisions &&
                  project.decision_package.requested_revisions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--text-muted)]">
                        Requested Revisions
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {project.decision_package.requested_revisions.map((revision) => (
                          <Badge key={`${project.id}-revision-${revision}`} tone="warning">
                            {revision}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                <JsonBlock
                  value={project.decision_package}
                  emptyMessage="No decision package is available."
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No decision package is attached to this proposal yet.
              </p>
            )}
          </DetailPanel>

          <DetailPanel
            title="Evaluation Summary"
            subtitle="Evaluation view."
          >
            {project.evaluation ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard
                    label="Overall"
                    value={formatNumber(project.evaluation.overall_score)}
                  />
                  <KpiCard
                    label="Confidence Score"
                    value={formatPercentValue(project.evaluation.confidence_score)}
                  />
                  <KpiCard
                    label="Risk Score"
                    value={formatPercentValue(project.evaluation.risk_score)}
                  />
                  <KpiCard
                    label="Coverage"
                    value={formatPercent(project.evaluation.evidence_coverage)}
                  />
                </div>

                {project.evaluation.strengths &&
                  project.evaluation.strengths.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs text-[var(--text-muted)]">
                        Strengths
                      </p>
                      <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                        {project.evaluation.strengths.map((item, index) => (
                          <li key={`${project.id}-strength-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {project.evaluation.concerns &&
                  project.evaluation.concerns.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs text-[var(--text-muted)]">
                        Concerns
                      </p>
                      <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                        {project.evaluation.concerns.map((item, index) => (
                          <li key={`${project.id}-concern-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                <JsonBlock
                  value={project.evaluation}
                  emptyMessage="No evaluation summary is available."
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No evaluation summary is attached to this proposal yet.
              </p>
            )}
          </DetailPanel>
        </div>
      </div>
    </div>
  );
}

function StatusPageContent() {
  const searchParams = useSearchParams();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [results, setResults] = useState<Project[]>([]);
  const [searched, setSearched] = useState(Boolean(searchParams.get("q")));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (
    event?: React.FormEvent,
    forcedQuery?: string,
  ) => {
    event?.preventDefault();
    const activeQuery = (forcedQuery ?? query).trim();
    if (!activeQuery) return;

    setLoading(true);
    setError("");
    setSearched(true);
    setResults([]);

    try {
      const response = await fetch(`${apiUrl}/api/projects`);
      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }
      const data = (await response.json()) as Project[];
      setResults(filterProjects(data, activeQuery));
    } catch {
      setError(
        "Unable to search projects. Please check that the backend is running.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialQuery = searchParams.get("q");
    if (initialQuery) {
      void handleSearch(undefined, initialQuery);
    }
  }, [searchParams]);

  const handleProjectUpdated = (updatedProject: Project) => {
    setResults((current) =>
      current.map((project) =>
        project.id === updatedProject.id ? updatedProject : project,
      ),
    );
  };

  return (
    <div className="page-shell">
      <div className="page-container page-container-wide">
        <div className="page-header animate-fade-in">
          <p className="section-label">Track</p>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Proposal review
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Search by project name, URL, wallet, or ID.
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8 animate-fade-in-delay-1">
          <form
            onSubmit={(event) => {
              void handleSearch(event);
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input-dark flex-1"
              placeholder="Enter project name, website, GitHub URL, wallet, or project ID"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="btn-gradient whitespace-nowrap px-6 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>
        </div>

        {error && (
          <div
            className="glass-card mb-6 mt-6 p-4 animate-fade-in"
            style={{
              borderColor: "rgba(239, 68, 68, 0.4)",
              background: "rgba(239, 68, 68, 0.05)",
            }}
          >
            <p className="text-sm text-[var(--error)]">{error}</p>
          </div>
        )}

        {loading && (
        <div className="motion-stagger-sm mt-6 space-y-4 animate-fade-in">
            {[1, 2].map((item) => (
              <div key={item} className="glass-card p-6">
                <div className="space-y-3 animate-pulse">
                  <div className="h-5 w-1/3 rounded bg-[var(--surface-hover)]" />
                  <div className="h-3 w-1/2 rounded bg-[var(--surface)]" />
                  <div className="mt-4 h-8 w-full rounded bg-[var(--surface)]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {searched && !loading && !error && (
          <div className="motion-stagger-lg mt-6 space-y-4 animate-fade-in">
            {results.length === 0 ? (
              <div className="glass-card p-8 text-center sm:p-12">
                <h3 className="mb-2 text-lg font-semibold text-white">
                  No matching projects
                </h3>
                <p className="mb-6 text-sm text-[var(--text-muted)]">
                  Try a different handle, URL, wallet, or ID.
                </p>
                <Link
                  href="/submit"
                  className="btn-gradient inline-block px-6 py-2.5 text-sm font-semibold"
                >
                  Submit Proposal
                </Link>
              </div>
            ) : (
              results.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  apiUrl={apiUrl}
                  onProjectUpdated={handleProjectUpdated}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense
      fallback={
        <div className="page-shell">
          <div className="page-container page-container-wide">
            <div className="glass-card p-6 sm:p-8">
              <div className="space-y-3 animate-pulse">
                <div className="h-6 w-48 rounded bg-[var(--surface-hover)]" />
                <div className="h-4 w-full rounded bg-[var(--surface)]" />
                <div className="h-12 w-full rounded bg-[var(--surface)]" />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <StatusPageContent />
    </Suspense>
  );
}
