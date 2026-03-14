"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  website_url: string;
  tagline?: string;
  description?: string;
  category: string;
  status: string;
  ranking_score?: number;
  funding_amount?: number;
  stage?: string;
}

function StatusBadge({ status }: { status: string }) {
  let bg: string;
  let text: string;

  switch (status) {
    case "funded":
      bg = "rgba(34,197,94,0.15)";
      text = "var(--success)";
      break;
    case "ranked":
      bg = "rgba(139,92,246,0.15)";
      text = "var(--violet)";
      break;
    case "reviewed":
      bg = "rgba(59,130,246,0.15)";
      text = "var(--blue)";
      break;
    case "processing":
    case "under_review":
      bg = "rgba(234,179,8,0.15)";
      text = "var(--warning)";
      break;
    case "rejected":
      bg = "rgba(239,68,68,0.15)";
      text = "var(--error)";
      break;
    default:
      bg = "var(--surface-hover)";
      text = "var(--text-secondary)";
      break;
  }

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: bg, color: text }}
    >
      {status}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] whitespace-nowrap">
      {stage}
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

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/api/projects`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setProjects(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  return (
    <div className="pt-28 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <p className="section-label">Dashboard</p>
          <h1 className="text-3xl sm:text-4xl font-bold gradient-text mb-3">
            All Projects
          </h1>
          <p className="text-[var(--text-muted)]">
            Browse all submitted projects and their funding status
          </p>
        </div>

        {/* Loading */}
        {loading && <SkeletonCards />}

        {/* Error */}
        {error && (
          <div
            className="glass-card p-8 sm:p-12 text-center animate-fade-in"
            style={{
              borderColor: "rgba(239, 68, 68, 0.3)",
              background: "rgba(239, 68, 68, 0.03)",
            }}
          >
            <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center border border-[rgba(239,68,68,0.2)]">
              <svg
                className="w-6 h-6 text-[var(--error)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Unable to Load Projects
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-1">
              Could not connect to the API.
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Make sure the backend is running at{" "}
              {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
            </p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && projects.length === 0 && (
          <div className="glass-card p-8 sm:p-12 text-center animate-fade-in">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center border border-[var(--border)]">
              <svg
                className="w-6 h-6 text-[var(--text-muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              No projects yet
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Be the first to apply for funding and get your project reviewed by
              our AI agents.
            </p>
            <Link
              href="/submit"
              className="btn-gradient inline-block px-6 py-2.5 text-sm font-semibold"
            >
              Apply for Funding
            </Link>
          </div>
        )}

        {/* Project Cards */}
        {!loading && !error && projects.length > 0 && (
          <div className="space-y-4 animate-fade-in">
            {projects.map((project) => (
              <div key={project.id} className="glass-card p-5 sm:p-6">
                {/* Top row: name + status */}
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-lg text-white">
                    {project.name}
                  </h3>
                  <StatusBadge status={project.status} />
                </div>

                {/* Tagline */}
                {project.tagline && (
                  <p className="text-sm text-[var(--text-secondary)] mb-1.5 line-clamp-1">
                    {project.tagline}
                  </p>
                )}

                {/* Website URL */}
                <a
                  href={project.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--violet)] hover:text-[var(--violet)] transition-colors inline-block mb-3"
                >
                  {project.website_url}
                </a>

                {/* Bottom row: badges + score */}
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                    {project.category}
                  </span>
                  {project.stage && <StageBadge stage={project.stage} />}

                  {project.ranking_score !== undefined && (
                    <span
                      className="ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))",
                        border: "1px solid rgba(139,92,246,0.3)",
                      }}
                    >
                      Score: {project.ranking_score}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
