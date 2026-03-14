"use client";

import { useState } from "react";
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
  created_at?: string;
  stage?: string;
}

const STATUS_STEPS = ["submitted", "processing", "ranked", "funded"] as const;

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  processing: "Under Review",
  ranked: "Ranked",
  funded: "Funded",
};

function getStepIndex(status: string): number {
  switch (status) {
    case "submitted":
      return 0;
    case "processing":
    case "under_review":
    case "reviewed":
      return 1;
    case "ranked":
      return 2;
    case "funded":
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

function StatusTimeline({ status }: { status: string }) {
  const currentIndex = getStepIndex(status);

  return (
    <div className="flex items-center w-full gap-0">
      {STATUS_STEPS.map((step, i) => {
        const isCompleted = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            {/* Step Circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all ${
                  isCompleted
                    ? "text-white"
                    : "border border-[rgba(255,255,255,0.15)] text-[#71717A] bg-transparent"
                }${isCurrent ? " shadow-[0_0_12px_rgba(139,92,246,0.5)]" : ""}`}
                style={
                  isCompleted
                    ? { background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }
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
                  isCompleted ? "text-[#A1A1AA]" : "text-[#71717A]"
                }`}
              >
                {STATUS_LABELS[step]}
              </span>
            </div>
            {/* Connector Line */}
            {i < STATUS_STEPS.length - 1 && (
              <div className="flex-1 mx-1.5">
                <div
                  className="h-0.5 w-full rounded-full mb-5"
                  style={
                    i < currentIndex
                      ? { background: "linear-gradient(90deg, #8B5CF6, #3B82F6)" }
                      : { background: "rgba(255,255,255,0.1)" }
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

      // Try fetching all projects and filtering client-side
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
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <p className="section-label">Track</p>
          <h1 className="text-3xl sm:text-4xl font-bold gradient-text mb-3">
            Check Your Project Status
          </h1>
          <p className="text-[#71717A]">
            Enter your project name or website URL to check the status of your
            application
          </p>
        </div>

        {/* Search Form */}
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

        {/* Error */}
        {error && (
          <div
            className="glass-card mb-6 p-4 animate-fade-in"
            style={{
              borderColor: "rgba(239, 68, 68, 0.4)",
              background: "rgba(239, 68, 68, 0.05)",
            }}
          >
            <p className="text-sm text-[#EF4444]">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-4 animate-fade-in">
            {[1, 2].map((i) => (
              <div key={i} className="glass-card p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-5 bg-[rgba(255,255,255,0.06)] rounded w-1/3" />
                  <div className="h-3 bg-[rgba(255,255,255,0.04)] rounded w-1/2" />
                  <div className="h-8 bg-[rgba(255,255,255,0.04)] rounded w-full mt-4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {searched && !loading && !error && (
          <div className="space-y-4 animate-fade-in">
            {results.length === 0 ? (
              <div className="glass-card p-8 sm:p-12 text-center">
                {/* Not Found Icon */}
                <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center border border-[rgba(255,255,255,0.1)]">
                  <svg
                    className="w-6 h-6 text-[#71717A]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  No projects found matching your search
                </h3>
                <p className="text-sm text-[#71717A] mb-6">
                  Double-check the spelling or try a different search term.
                </p>
                <Link
                  href="/submit"
                  className="btn-gradient inline-block px-6 py-2.5 text-sm font-semibold"
                >
                  Submit a New Application
                </Link>
              </div>
            ) : (
              results.map((project) => (
                <div key={project.id} className="glass-card p-6 sm:p-8">
                  {/* Project Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-white">
                        {project.name}
                      </h3>
                      {project.website_url && (
                        <a
                          href={project.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#71717A] hover:text-[#8B5CF6] transition-colors mt-1 inline-block"
                        >
                          {project.website_url}
                        </a>
                      )}
                    </div>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#A1A1AA]">
                      {project.category}
                    </span>
                  </div>

                  {/* Status Timeline */}
                  <div className="py-4 px-2">
                    <StatusTimeline status={project.status} />
                  </div>

                  {/* Metrics */}
                  <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)]">
                    {project.status === "funded" && project.funding_amount && (
                      <div>
                        <p className="text-xs text-[#71717A] mb-0.5">Funded</p>
                        <p className="text-lg font-bold gradient-text">
                          ${project.funding_amount.toLocaleString()}
                        </p>
                      </div>
                    )}

                    {project.ranking_score !== undefined && (
                      <span
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
                        style={{
                          background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))",
                          border: "1px solid rgba(139,92,246,0.3)",
                        }}
                      >
                        AI Score: {project.ranking_score}/100
                      </span>
                    )}

                    {project.created_at && (
                      <span className="text-xs text-[#71717A] ml-auto">
                        Applied {formatDate(project.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
