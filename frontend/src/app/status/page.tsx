"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

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
  release_amount: number;
}

interface EvaluationSummary {
  overall_score: number;
  confidence_level: string;
  risk_classification: string;
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
  overall_score: number;
  confidence?: number;
  risk_classification?: string;
  reason_codes?: string[];
  subscores?: ScoreBreakdown;
  risk_band?: {
    score?: number;
    reason_codes?: string[];
  };
  missingness_summary?: {
    thin_evidence_categories?: string[];
  };
}

interface FundingDecision {
  decision: string;
  rationale: string;
  funding_package: FundingPackage;
  milestone_schedule: Milestone[];
  policy_explanation?: string[];
}

interface DecisionPackageMilestone {
  amount: number;
  deliverable_type: string;
  verification_method: string;
  deadline: string;
}

interface DecisionPackage {
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
  passed: boolean;
  approved_for_execution?: boolean;
  violation_codes?: string[];
  violations?: VerifierViolation[];
  check_results?: VerifierCheck[];
  [key: string]: unknown;
}

interface DecisionReview {
  approved_for_execution?: boolean;
  agent_mode_used?: string;
  revision_attempts?: number;
  warnings?: string[];
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
  source_type?: string;
  source_id?: string;
  invocation_id?: string;
  url?: string;
  provider?: string;
}

interface EvidenceBundle {
  facts?: Array<Record<string, unknown>>;
  sources?: EvidenceSource[];
  confidence?: {
    overall?: number;
  };
  contradiction_flags?: string[];
  raw_payload_hash?: string;
  support_summary?: Record<string, number>;
  freshness_summary?: {
    stale_fact_count?: number;
  };
}

interface EnrichedData {
  evidence_bundle?: EvidenceBundle;
  notes?: string[];
}

interface Project {
  id: string;
  name: string;
  website_url: string;
  short_description?: string;
  category: string;
  status: string;
  ranking_score?: number;
  funding_amount?: number;
  created_at?: string;
  stage?: string;
  recipient_wallet?: string;
  evaluation?: EvaluationSummary;
  enriched_data?: EnrichedData;
  scorecard?: Scorecard;
  decision_package?: DecisionPackage;
  verifier_result?: VerifierResult;
  decision_review?: DecisionReview;
  treasury_allocation?: TreasuryAllocation;
  funding_decision?: FundingDecision;
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

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number | undefined, fractionDigits = 0): string {
  if (value === undefined || Number.isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(fractionDigits)}%`;
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

function sourceLabel(source: EvidenceSource, index: number): string {
  return labelize(source.source_type || source.provider || source.source_id || source.invocation_id || `source_${index + 1}`);
}

function sourceHref(source: EvidenceSource): string | null {
  return typeof source.url === "string" && source.url.trim() ? source.url : null;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
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
    <div className={`rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 ${className}`.trim()}>
      <div className="mb-4">
        <p className="text-sm font-semibold text-white">{title}</p>
        {subtitle && <p className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function StatusTimeline({ status }: { status: string }) {
  const currentIndex = getStepIndex(status);

  return (
    <div className="flex items-center w-full gap-0">
      {STATUS_STEPS.map((step, i) => {
        const isCompleted = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all ${
                  isCompleted
                    ? "text-white"
                    : "border border-[var(--border-hover)] text-[var(--text-muted)] bg-transparent"
                }${isCurrent ? " shadow-[0_0_12px_rgba(139,92,246,0.5)]" : ""}`}
                style={
                  isCompleted
                    ? { background: "linear-gradient(135deg, var(--violet), var(--blue))" }
                    : undefined
                }
              >
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-[10px] mt-1.5 whitespace-nowrap ${
                  isCompleted ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"
                }`}
              >
                {STATUS_LABELS[step]}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className="flex-1 mx-1.5">
                <div
                  className="h-0.5 w-full rounded-full mb-5"
                  style={
                    i < currentIndex
                      ? { background: "linear-gradient(90deg, var(--violet), var(--blue))" }
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

export default function StatusPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Project[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setSearched(true);
    setResults([]);

    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const res = await fetch(`${apiUrl}/api/projects`);
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data: Project[] = await res.json();

      const searchTerm = query.trim().toLowerCase();
      const filtered = data.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm) ||
          p.website_url.toLowerCase().includes(searchTerm)
      );
      setResults(filtered);
    } catch {
      setError("Unable to search projects. Please check that the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-28 pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="mb-8 animate-fade-in">
          <p className="section-label">Track</p>
          <h1 className="text-3xl sm:text-4xl font-bold gradient-text mb-3">
            Proposal Review Status
          </h1>
          <p className="text-[var(--text-muted)]">
            Search by project name or website to see the score, decision, and
            milestone funding schedule.
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8 mb-8 animate-fade-in-delay-1">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input-dark flex-1"
              placeholder="Enter project name or website URL"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="btn-gradient px-6 py-2.5 text-sm font-semibold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>
        </div>

        {error && (
          <div
            className="glass-card mb-6 p-4 animate-fade-in"
            style={{
              borderColor: "rgba(239, 68, 68, 0.4)",
              background: "rgba(239, 68, 68, 0.05)",
            }}
          >
            <p className="text-sm text-[var(--error)]">{error}</p>
          </div>
        )}

        {loading && (
          <div className="space-y-4 animate-fade-in">
            {[1, 2].map((i) => (
              <div key={i} className="glass-card p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-5 bg-[var(--surface-hover)] rounded w-1/3" />
                  <div className="h-3 bg-[var(--surface)] rounded w-1/2" />
                  <div className="h-8 bg-[var(--surface)] rounded w-full mt-4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {searched && !loading && !error && (
          <div className="space-y-4 animate-fade-in">
            {results.length === 0 ? (
              <div className="glass-card p-8 sm:p-12 text-center">
                <h3 className="text-lg font-semibold text-white mb-2">
                  No projects found matching your search
                </h3>
                <p className="text-sm text-[var(--text-muted)] mb-6">
                  Double-check the spelling or submit a new proposal.
                </p>
                <Link
                  href="/submit"
                  className="btn-gradient inline-block px-6 py-2.5 text-sm font-semibold"
                >
                  Submit a Proposal
                </Link>
              </div>
            ) : (
              results.map((project) => {
                const decision = project.funding_decision?.decision;
                const fundingPackage = project.funding_decision?.funding_package;
                const milestones = project.funding_decision?.milestone_schedule ?? [];
                const evidenceBundle = project.enriched_data?.evidence_bundle;
                const evidenceFacts = evidenceBundle?.facts ?? [];
                const evidenceSources = evidenceBundle?.sources ?? [];
                const supportSummary = evidenceBundle?.support_summary ?? {};
                const staleFactCount = evidenceBundle?.freshness_summary?.stale_fact_count;
                const thinEvidenceCategories =
                  project.scorecard?.missingness_summary?.thin_evidence_categories ?? [];
                const verifierViolations = project.verifier_result?.violations ?? [];
                const failedChecks =
                  project.verifier_result?.check_results?.filter((check) => !check.passed) ?? [];
                const strategyAllocations =
                  project.treasury_allocation?.strategy_allocations ?? [];
                const treasuryNotes = project.treasury_allocation?.notes ?? [];

                return (
                  <div key={project.id} className="glass-card p-6 sm:p-8">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-xl font-semibold text-white">
                          {project.name}
                        </h3>
                        {project.short_description && (
                          <p className="text-sm text-[var(--text-secondary)] mt-1">
                            {project.short_description}
                          </p>
                        )}
                        <a
                          href={project.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--violet)] transition-colors mt-2 inline-block"
                        >
                          {project.website_url}
                        </a>
                      </div>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                        {labelize(project.category)}
                      </span>
                    </div>

                    <div className="py-4 px-2">
                      <StatusTimeline status={project.status} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                        <p className="text-xs text-[var(--text-muted)] mb-1">Score</p>
                        <p className="text-lg font-semibold text-white">
                          {project.evaluation?.overall_score ?? project.ranking_score ?? "N/A"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                        <p className="text-xs text-[var(--text-muted)] mb-1">Confidence</p>
                        <p className="text-lg font-semibold text-white">
                          {labelize(project.evaluation?.confidence_level)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                        <p className="text-xs text-[var(--text-muted)] mb-1">Risk</p>
                        <p className="text-lg font-semibold text-white">
                          {labelize(project.evaluation?.risk_classification)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                        <p className="text-xs text-[var(--text-muted)] mb-1">Decision</p>
                        <p className="text-lg font-semibold text-white">
                          {labelize(decision)}
                        </p>
                      </div>
                    </div>

                    {project.funding_decision && (
                      <div className="mt-5 pt-5 border-t border-[var(--border)] space-y-4">
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-1">
                            Decision Rationale
                          </p>
                          <p className="text-sm text-[var(--text-secondary)]">
                            {project.funding_decision.rationale}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                            <p className="text-xs text-[var(--text-muted)] mb-1">Approved</p>
                            <p className="text-lg font-semibold text-white">
                              {formatCurrency(fundingPackage?.approved_amount)}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                            <p className="text-xs text-[var(--text-muted)] mb-1">Immediate</p>
                            <p className="text-lg font-semibold text-white">
                              {formatCurrency(fundingPackage?.immediate_release_amount)}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                            <p className="text-xs text-[var(--text-muted)] mb-1">Escrowed</p>
                            <p className="text-lg font-semibold text-white">
                              {formatCurrency(fundingPackage?.escrow_amount)}
                            </p>
                          </div>
                        </div>

                        {project.recipient_wallet && (
                          <div>
                            <p className="text-xs text-[var(--text-muted)] mb-1">Wallet</p>
                            <p
                              className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]"
                              title={project.recipient_wallet}
                            >
                              {shortenWallet(project.recipient_wallet)}
                            </p>
                          </div>
                        )}

                        {milestones.length > 0 && (
                          <div>
                            <p className="text-xs text-[var(--text-muted)] mb-3">
                              Milestone Release Schedule
                            </p>
                            <div className="space-y-3">
                              {milestones.map((milestone) => (
                                <div
                                  key={`${project.id}-${milestone.sequence}`}
                                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                                    <div>
                                      <p className="text-sm font-semibold text-white">
                                        {milestone.sequence}. {milestone.name}
                                      </p>
                                      <p className="text-sm text-[var(--text-secondary)] mt-1">
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
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {(evidenceBundle ||
                      project.scorecard ||
                      project.treasury_allocation ||
                      project.decision_package ||
                      project.verifier_result) && (
                      <div className="mt-6 space-y-4">
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                          <DetailPanel
                            title="Evidence"
                            subtitle="Structured facts and provenance gathered during diligence."
                          >
                            {evidenceBundle ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Facts</p>
                                    <p className="text-base font-semibold text-white">{evidenceFacts.length}</p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Sources</p>
                                    <p className="text-base font-semibold text-white">{evidenceSources.length}</p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Confidence</p>
                                    <p className="text-base font-semibold text-white">
                                      {formatPercent(evidenceBundle.confidence?.overall)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Stale Facts</p>
                                    <p className="text-base font-semibold text-white">{staleFactCount ?? 0}</p>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-xs text-[var(--text-muted)]">Provenance</p>
                                  {evidenceSources.length > 0 ? (
                                    <div className="space-y-2">
                                      {evidenceSources.slice(0, 4).map((source, index) => {
                                        const href = sourceHref(source);
                                        return (
                                          <div
                                            key={`${project.id}-source-${index}`}
                                            className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--text-secondary)]"
                                          >
                                            <p className="font-medium text-white">{sourceLabel(source, index)}</p>
                                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                              {source.source_id || source.invocation_id || "Generated source"}
                                            </p>
                                            {href && (
                                              <a
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-[var(--violet)] hover:text-[var(--blue)] transition-colors mt-2 inline-block"
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
                                        <span
                                          key={`${project.id}-thin-${item}`}
                                          className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                                        >
                                          Thin: {labelize(item)}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                                        Coverage looks sufficient
                                      </span>
                                    )}
                                    {Object.entries(supportSummary).map(([key, value]) => (
                                      <span
                                        key={`${project.id}-support-${key}`}
                                        className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                                      >
                                        {labelize(key)}: {value}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                                  <span>Raw payload hash: {shortenHash(evidenceBundle.raw_payload_hash)}</span>
                                  <span>
                                    Contradictions: {evidenceBundle.contradiction_flags?.length ?? 0}
                                  </span>
                                </div>

                                {(project.enriched_data?.notes?.length ?? 0) > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-xs text-[var(--text-muted)]">Collector Notes</p>
                                    <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                                      {project.enriched_data?.notes?.slice(0, 4).map((note, index) => (
                                        <li key={`${project.id}-note-${index}`}>{note}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--text-muted)]">
                                No enrichment bundle is attached to this proposal yet.
                              </p>
                            )}
                          </DetailPanel>

                          <DetailPanel
                            title="Scorecard"
                            subtitle="Deterministic subscores, confidence, and risk used for ranking."
                          >
                            {project.scorecard ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Overall</p>
                                    <p className="text-base font-semibold text-white">{project.scorecard.overall_score}</p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Confidence</p>
                                    <p className="text-base font-semibold text-white">
                                      {formatPercent(project.scorecard.confidence, 1)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Risk</p>
                                    <p className="text-base font-semibold text-white">
                                      {labelize(project.scorecard.risk_classification)}
                                    </p>
                                  </div>
                                </div>

                                {project.scorecard.subscores && (
                                  <div className="grid grid-cols-2 gap-3">
                                    {Object.entries(project.scorecard.subscores).map(([key, value]) => (
                                      <div
                                        key={`${project.id}-subscore-${key}`}
                                        className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                                      >
                                        <p className="text-[11px] text-[var(--text-muted)] mb-1">
                                          {labelize(key)}
                                        </p>
                                        <p className="text-base font-semibold text-white">{value}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {project.scorecard.reason_codes && project.scorecard.reason_codes.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-xs text-[var(--text-muted)]">Reason Codes</p>
                                    <div className="flex flex-wrap gap-2">
                                      {project.scorecard.reason_codes.slice(0, 10).map((reason) => (
                                        <span
                                          key={`${project.id}-reason-${reason}`}
                                          className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                                        >
                                          {labelize(reason)}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--text-muted)]">
                                No scorecard is available for this proposal yet.
                              </p>
                            )}
                          </DetailPanel>

                          <DetailPanel
                            title="Treasury"
                            subtitle="Reserve buckets and idle-capital allocation policy for this decision."
                          >
                            {project.treasury_allocation ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Hot Reserve</p>
                                    <p className="text-base font-semibold text-white">
                                      {formatCurrency(project.treasury_allocation.hot_reserve)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Committed</p>
                                    <p className="text-base font-semibold text-white">
                                      {formatCurrency(project.treasury_allocation.committed_reserve)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Idle</p>
                                    <p className="text-base font-semibold text-white">
                                      {formatCurrency(project.treasury_allocation.idle_treasury)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                    <p className="text-[11px] text-[var(--text-muted)] mb-1">Buffer</p>
                                    <p className="text-base font-semibold text-white">
                                      {formatCurrency(project.treasury_allocation.strategic_buffer)}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span
                                    className="inline-flex items-center rounded-full px-3 py-1 font-medium"
                                    style={{
                                      background: project.treasury_allocation.policy_compliant
                                        ? "rgba(34,197,94,0.15)"
                                        : "rgba(239,68,68,0.15)",
                                      color: project.treasury_allocation.policy_compliant
                                        ? "var(--success)"
                                        : "var(--error)",
                                    }}
                                  >
                                    {project.treasury_allocation.policy_compliant
                                      ? "Policy compliant"
                                      : "Policy violation"}
                                  </span>
                                  <span className="text-[var(--text-muted)]">
                                    Available: {formatCurrency(project.treasury_allocation.available_for_new_commitments)}
                                  </span>
                                  {project.treasury_allocation.liquidity_gap !== undefined && (
                                    <span className="text-[var(--text-muted)]">
                                      Liquidity gap: {formatCurrency(project.treasury_allocation.liquidity_gap)}
                                    </span>
                                  )}
                                </div>

                                {strategyAllocations.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-xs text-[var(--text-muted)]">Idle Allocation Suggestion</p>
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
                                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                              {labelize(allocation.liquidity_profile)}
                                            </p>
                                          </div>
                                          <p className="text-sm font-semibold text-white">
                                            {formatCurrency(allocation.amount)}
                                          </p>
                                        </div>
                                        <p className="text-sm text-[var(--text-secondary)] mt-2">
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
                                      {treasuryNotes.slice(0, 4).map((note, index) => (
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
                            subtitle="Formal policy checks run on the agent recommendation before execution."
                          >
                            {project.verifier_result || project.decision_review ? (
                              <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                                    style={{
                                      background:
                                        project.verifier_result?.passed
                                          ? "rgba(34,197,94,0.15)"
                                          : "rgba(239,68,68,0.15)",
                                      color:
                                        project.verifier_result?.passed
                                          ? "var(--success)"
                                          : "var(--error)",
                                    }}
                                  >
                                    {project.verifier_result?.passed ? "Pass" : "Fail"}
                                  </span>
                                  {project.decision_review?.agent_mode_used && (
                                    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                                      Agent: {labelize(project.decision_review.agent_mode_used)}
                                    </span>
                                  )}
                                  {project.decision_review?.revision_attempts !== undefined && (
                                    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                                      Attempts: {project.decision_review.revision_attempts}
                                    </span>
                                  )}
                                  {project.decision_review?.approved_for_execution !== undefined && (
                                    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                                      {project.decision_review.approved_for_execution
                                        ? "Approved for execution"
                                        : "Blocked for execution"}
                                    </span>
                                  )}
                                </div>

                                {verifierViolations.length > 0 ? (
                                  <div className="space-y-2">
                                    <p className="text-xs text-[var(--text-muted)]">Violated Constraints</p>
                                    {verifierViolations.map((violation, index) => (
                                      <div
                                        key={`${project.id}-violation-${index}`}
                                        className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                                      >
                                        <p className="text-sm font-medium text-white">
                                          {labelize(violation.code)}
                                        </p>
                                        <p className="text-sm text-[var(--text-secondary)] mt-1">
                                          {violation.message}
                                        </p>
                                        {violation.path && (
                                          <p className="text-xs text-[var(--text-muted)] mt-1">
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

                                {project.decision_review?.warnings && project.decision_review.warnings.length > 0 && (
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
                                      {failedChecks.slice(0, 8).map((check) => (
                                        <span
                                          key={`${project.id}-failed-check-${check.code}`}
                                          className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                                        >
                                          {labelize(check.code)}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--text-muted)]">
                                No verifier result is available for this proposal yet.
                              </p>
                            )}
                          </DetailPanel>
                        </div>

                        {project.decision_package && (
                          <DetailPanel
                            title="Decision JSON"
                            subtitle="Strict agent recommendation contract before the verifier applies policy checks."
                          >
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                <p className="text-[11px] text-[var(--text-muted)] mb-1">Decision</p>
                                <p className="text-base font-semibold text-white">
                                  {labelize(project.decision_package.decision)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                <p className="text-[11px] text-[var(--text-muted)] mb-1">Approved</p>
                                <p className="text-base font-semibold text-white">
                                  {formatCurrency(project.decision_package.approved_amount)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                <p className="text-[11px] text-[var(--text-muted)] mb-1">Confidence</p>
                                <p className="text-base font-semibold text-white">
                                  {formatPercent(project.decision_package.confidence, 1)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                                <p className="text-[11px] text-[var(--text-muted)] mb-1">Milestones</p>
                                <p className="text-base font-semibold text-white">
                                  {project.decision_package.milestones.length}
                                </p>
                              </div>
                            </div>

                            {project.decision_package.requested_revisions &&
                              project.decision_package.requested_revisions.length > 0 && (
                                <div className="mb-4">
                                  <p className="text-xs text-[var(--text-muted)] mb-2">Requested Revisions</p>
                                  <div className="flex flex-wrap gap-2">
                                    {project.decision_package.requested_revisions.map((revision) => (
                                      <span
                                        key={`${project.id}-revision-${revision}`}
                                        className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                                      >
                                        {revision}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                            <pre className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-xs leading-6 text-[var(--text-secondary)]">
                              {formatJson(project.decision_package)}
                            </pre>
                          </DetailPanel>
                        )}
                      </div>
                    )}

                    {project.created_at && (
                      <p className="text-xs text-[var(--text-muted)] mt-5">
                        Applied {formatDate(project.created_at)}
                        {project.stage ? ` - Stage ${labelize(project.stage)}` : ""}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
