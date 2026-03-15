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

interface FundingDecision {
  decision: string;
  funding_package: {
    approved_amount: number;
  };
  milestone_schedule: Array<{ sequence: number }>;
}

interface Project {
  id: string;
  name: string;
  website_url: string;
  short_description?: string;
  category: string;
  status: string;
  requested_funding?: number;
  stage?: string;
  ranking_score?: number;
  evaluation?: EvaluationSummary;
  funding_decision?: FundingDecision;
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
  const palette =
    status === "funded"
      ? { borderColor: "rgba(34,197,94,0.34)", backgroundColor: "rgba(34,197,94,0.14)", color: "#86efac" }
      : status === "rejected"
        ? { borderColor: "rgba(244,63,94,0.36)", backgroundColor: "rgba(244,63,94,0.14)", color: "#fda4af" }
        : status === "processing"
          ? { borderColor: "rgba(250,204,21,0.34)", backgroundColor: "rgba(250,204,21,0.14)", color: "#fde047" }
          : { borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", color: "var(--text-secondary)" };

  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
      style={palette}
    >
      {labelize(status)}
    </span>
  );
}

function DecisionBadge({ decision }: { decision?: string }) {
  if (!decision) return null;

  const palette =
    decision === "accept"
      ? { borderColor: "rgba(34,197,94,0.34)", backgroundColor: "rgba(34,197,94,0.14)", color: "#86efac" }
      : decision === "accept_reduced"
        ? { borderColor: "rgba(250,204,21,0.34)", backgroundColor: "rgba(250,204,21,0.14)", color: "#fde047" }
        : { borderColor: "rgba(244,63,94,0.36)", backgroundColor: "rgba(244,63,94,0.14)", color: "#fda4af" };

  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
      style={palette}
    >
      {labelize(decision)}
    </span>
  );
}

function TreasuryCard({
  title,
  amount,
}: {
  title: string;
  amount: number;
}) {
  return (
    <div className="glass-card motion-card p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {title}
      </p>
      <p className="mt-3 text-3xl font-semibold text-white">{formatCurrency(amount)}</p>
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
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const [projectsRes, treasuryRes] = await Promise.all([
          fetch(`${apiUrl}/api/projects`),
          fetch(`${apiUrl}/api/treasury`),
        ]);

        if (!projectsRes.ok || !treasuryRes.ok) {
          throw new Error("Failed to fetch");
        }

        setProjects((await projectsRes.json()) as Project[]);
        setTreasury((await treasuryRes.json()) as TreasurySnapshot);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  return (
    <div className="page-shell">
      <div className="page-container page-container-wide">
        <div className="page-header animate-fade-in">
          <p className="section-label">Dashboard</p>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Treasury and proposals
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Current treasury buckets and latest project outcomes.
          </p>
        </div>

        {loading && <div className="glass-card p-8 text-sm text-[var(--text-muted)]">Loading dashboard...</div>}

        {error && (
          <div className="glass-card p-8 text-sm text-[var(--error)]">
            Unable to load dashboard.
          </div>
        )}

        {!loading && !error && treasury && (
          <div className="motion-stagger-md mb-14 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <TreasuryCard title="Hot Reserve" amount={treasury.hot_reserve} />
            <TreasuryCard title="Committed" amount={treasury.committed_reserve} />
            <TreasuryCard title="Idle Treasury" amount={treasury.idle_treasury} />
            <TreasuryCard title="Buffer" amount={treasury.strategic_buffer} />
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="glass-card p-8 text-sm text-[var(--text-muted)]">
            No projects yet.
          </div>
        )}

        {!loading && !error && projects.length > 0 && (
          <div className="motion-stagger-lg mt-4 space-y-12">
            {projects.map((project) => {
              const approvedAmount =
                project.funding_decision?.funding_package.approved_amount;
              const milestoneCount =
                project.funding_decision?.milestone_schedule.length ?? 0;

              return (
                <div key={project.id} className="glass-card motion-card rounded-[1.6rem] p-6 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        {labelize(project.category)}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-white">
                        {project.name}
                      </h2>
                      {project.short_description && (
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">
                          {project.short_description}
                        </p>
                      )}
                      <a
                        href={project.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-xs text-[var(--violet)]"
                      >
                        {project.website_url}
                      </a>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs sm:justify-end">
                      <StatusBadge status={project.status} />
                      <DecisionBadge decision={project.funding_decision?.decision} />
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                      <p className="text-xs text-[var(--text-muted)]">Score</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {project.evaluation?.overall_score ?? project.ranking_score ?? "N/A"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                      <p className="text-xs text-[var(--text-muted)]">Confidence</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {labelize(project.evaluation?.confidence_level)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                      <p className="text-xs text-[var(--text-muted)]">Risk</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {labelize(project.evaluation?.risk_classification)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                      <p className="text-xs text-[var(--text-muted)]">Approved</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {formatCurrency(approvedAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5 text-xs text-[var(--text-muted)]">
                    {project.stage && (
                      <span className="rounded-full border border-[var(--border)] px-3 py-1">
                        {labelize(project.stage)}
                      </span>
                    )}
                    {milestoneCount > 0 && (
                      <span className="rounded-full border border-[var(--border)] px-3 py-1">
                        {milestoneCount} milestones
                      </span>
                    )}
                    {project.requested_funding !== undefined && (
                      <span className="rounded-full border border-[var(--border)] px-3 py-1">
                        Requested {formatCurrency(project.requested_funding)}
                      </span>
                    )}
                    <Link
                      href={`/status?q=${encodeURIComponent(project.id)}`}
                      className="ml-auto rounded-full border border-[var(--border)] px-3 py-1 text-[var(--violet)] transition-colors hover:text-[var(--blue)]"
                    >
                      Open review
                    </Link>
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
