"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface TreasurySnapshot {
  total_capital: number;
  available_for_new_commitments: number;
  hot_reserve: number;
  committed_reserve: number;
  idle_treasury: number;
  strategic_buffer: number;
}

interface EvaluationSummary {
  overall_score: number;
  confidence_level: string;
  risk_classification: string;
}

interface FundingPackage {
  approved_amount: number;
}

interface FundingDecision {
  decision: string;
  funding_package: FundingPackage;
  milestone_schedule: Array<{ sequence: number }>;
}

interface Project {
  id: string;
  name: string;
  website_url: string;
  github_url?: string;
  recipient_wallet?: string;
  short_description?: string;
  description?: string;
  category: string;
  status: string;
  ranking_score?: number;
  funding_amount?: number;
  requested_funding?: number;
  stage?: string;
  evaluation?: EvaluationSummary;
  funding_decision?: FundingDecision;
  enriched_data?: {
    website_scraped?: boolean;
    github_scraped?: boolean;
    wallet_scraped?: boolean;
    market_intelligence_applied?: boolean;
  };
  verifier_result?: {
    passed?: boolean;
  };
}

function formatCurrency(amount: number | undefined) {
  if (amount === undefined) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function labelize(value: string | undefined) {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusBadge({ status }: { status: string }) {
  let bg = "var(--surface-hover)";
  let text = "var(--text-secondary)";

  if (status === "funded") {
    bg = "rgba(34,197,94,0.15)";
    text = "var(--success)";
  } else if (status === "rejected") {
    bg = "rgba(239,68,68,0.15)";
    text = "var(--error)";
  } else if (status === "reviewed" || status === "ranked") {
    bg = "rgba(59,130,246,0.15)";
    text = "var(--blue)";
  } else if (status === "processing") {
    bg = "rgba(234,179,8,0.15)";
    text = "var(--warning)";
  }

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: bg, color: text }}
    >
      {labelize(status)}
    </span>
  );
}

function DecisionBadge({ decision }: { decision?: string }) {
  if (!decision) return null;

  const isReject = decision === "reject";
  const isReduced = decision === "accept_reduced";

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: isReject
          ? "rgba(239,68,68,0.15)"
          : isReduced
            ? "rgba(234,179,8,0.15)"
            : "rgba(34,197,94,0.15)",
        color: isReject
          ? "var(--error)"
          : isReduced
            ? "var(--warning)"
            : "var(--success)",
      }}
    >
      {labelize(decision)}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] whitespace-nowrap">
      {labelize(stage)}
    </span>
  );
}

function SkeletonCards() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass-card p-5 sm:p-6">
          <div className="animate-pulse">
            <div className="flex items-center justify-between mb-3">
              <div className="h-5 bg-[var(--surface-hover)] rounded w-1/3" />
              <div className="h-5 bg-[var(--surface)] rounded-full w-20" />
            </div>
            <div className="h-3 bg-[var(--surface)] rounded w-2/3 mb-2" />
            <div className="h-3 bg-[var(--surface)] rounded w-1/4 mb-4" />
            <div className="h-3 bg-[var(--surface)] rounded w-full mb-4" />
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)]">
              <div className="h-5 bg-[var(--surface)] rounded-full w-16" />
              <div className="h-5 bg-[var(--surface)] rounded-full w-14" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TreasuryCard({
  title,
  amount,
  detail,
}: {
  title: string;
  amount: number;
  detail: string;
}) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">
        {title}
      </p>
      <p className="text-2xl font-semibold text-white mb-2">
        {formatCurrency(amount)}
      </p>
      <p className="text-sm text-[var(--text-muted)]">{detail}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [treasury, setTreasury] = useState<TreasurySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

        const [projectsRes, treasuryRes] = await Promise.all([
          fetch(`${apiUrl}/api/projects`),
          fetch(`${apiUrl}/api/treasury`),
        ]);

        if (!projectsRes.ok || !treasuryRes.ok) {
          throw new Error("Failed to fetch");
        }

        const projectsData = (await projectsRes.json()) as Project[];
        const treasuryData = (await treasuryRes.json()) as TreasurySnapshot;

        setProjects(projectsData);
        setTreasury(treasuryData);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="pt-28 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-8 animate-fade-in">
          <p className="section-label">Dashboard</p>
          <h1 className="text-3xl sm:text-4xl font-bold gradient-text mb-3">
            Funding Pipeline
          </h1>
          <p className="text-[var(--text-muted)]">
            Monitor proposal scores, funding decisions, and treasury reserve
            buckets.
          </p>
        </div>

        {loading && <SkeletonCards />}

        {error && (
          <div
            className="glass-card p-8 sm:p-12 text-center animate-fade-in"
            style={{
              borderColor: "rgba(239, 68, 68, 0.3)",
              background: "rgba(239, 68, 68, 0.03)",
            }}
          >
            <h3 className="text-lg font-semibold text-white mb-2">
              Unable to Load Dashboard
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              Make sure the backend is running at{" "}
              {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
            </p>
          </div>
        )}

        {!loading && !error && treasury && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8 animate-fade-in">
            <TreasuryCard
              title="Hot Reserve"
              amount={treasury.hot_reserve}
              detail="Immediate milestone releases and near-term obligations."
            />
            <TreasuryCard
              title="Committed Reserve"
              amount={treasury.committed_reserve}
              detail="Future milestone funding held liquid for approved projects."
            />
            <TreasuryCard
              title="Idle Treasury"
              amount={treasury.idle_treasury}
              detail="Capital available for low-risk treasury strategies."
            />
            <TreasuryCard
              title="Strategic Buffer"
              amount={treasury.strategic_buffer}
              detail="Safety margin excluded from strategy allocation."
            />
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="glass-card p-8 sm:p-12 text-center animate-fade-in">
            <h3 className="text-lg font-semibold text-white mb-2">
              No projects yet
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              Submit a proposal to generate scores and treasury commitments.
            </p>
          </div>
        )}

        {!loading && !error && projects.length > 0 && (
          <div className="space-y-4 animate-fade-in">
            {projects.map((project) => {
              const approvedAmount =
                project.funding_decision?.funding_package.approved_amount ??
                project.funding_amount;
              const milestoneCount =
                project.funding_decision?.milestone_schedule.length ?? 0;

              return (
                <div key={project.id} className="glass-card p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-semibold text-lg text-white">
                        {project.name}
                      </h3>
                      {project.short_description && (
                        <p className="text-sm text-[var(--text-secondary)] mt-1">
                          {project.short_description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <StatusBadge status={project.status} />
                      <DecisionBadge decision={project.funding_decision?.decision} />
                    </div>
                  </div>

                  <a
                    href={project.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--violet)] hover:text-[var(--violet)] transition-colors inline-block mb-4"
                  >
                    {project.website_url}
                  </a>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                      <p className="text-xs text-[var(--text-muted)] mb-1">
                        Overall Score
                      </p>
                      <p className="text-xl font-semibold text-white">
                        {project.evaluation?.overall_score ?? project.ranking_score ?? "N/A"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                      <p className="text-xs text-[var(--text-muted)] mb-1">
                        Confidence
                      </p>
                      <p className="text-xl font-semibold text-white">
                        {labelize(project.evaluation?.confidence_level)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                      <p className="text-xs text-[var(--text-muted)] mb-1">
                        Risk
                      </p>
                      <p className="text-xl font-semibold text-white">
                        {labelize(project.evaluation?.risk_classification)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                      <p className="text-xs text-[var(--text-muted)] mb-1">
                        Approved Funding
                      </p>
                      <p className="text-xl font-semibold text-white">
                        {formatCurrency(approvedAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                      {labelize(project.category)}
                    </span>
                    {project.stage && <StageBadge stage={project.stage} />}
                    {project.enriched_data?.website_scraped && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                        Website evidence
                      </span>
                    )}
                    {project.enriched_data?.github_scraped && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                        GitHub evidence
                      </span>
                    )}
                    {project.enriched_data?.wallet_scraped && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                        Wallet evidence
                      </span>
                    )}
                    {project.enriched_data?.market_intelligence_applied && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                        Market intel
                      </span>
                    )}
                    {project.verifier_result?.passed !== undefined && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                        {project.verifier_result.passed ? "Verifier pass" : "Verifier fail"}
                      </span>
                    )}
                    {milestoneCount > 0 && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                        {milestoneCount} milestones
                      </span>
                    )}
                    <Link
                      href={`/status?q=${encodeURIComponent(project.id)}`}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--violet)] transition-colors hover:text-[var(--blue)]"
                    >
                      Open full review
                    </Link>
                    {project.requested_funding !== undefined && (
                      <span className="ml-auto text-xs text-[var(--text-muted)]">
                        Requested {formatCurrency(project.requested_funding)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
