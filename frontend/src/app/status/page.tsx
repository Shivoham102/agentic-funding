"use client";

import { useState } from "react";
import Link from "next/link";

interface FundingPackage {
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

interface FundingDecision {
  decision: string;
  rationale: string;
  funding_package: FundingPackage;
  milestone_schedule: Milestone[];
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
