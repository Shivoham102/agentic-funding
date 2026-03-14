"use client";

import { useEffect, useState } from "react";

interface Project {
  id: string;
  name: string;
  website_url: string;
  tagline?: string;
  category: string;
  status: string;
  ranking_score?: number;
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

  const statusBadge = (status: string) => {
    const base = "inline-block px-2 py-0.5 rounded text-xs font-medium";
    switch (status) {
      case "funded":
        return `${base} bg-green-100 text-green-800`;
      case "reviewed":
        return `${base} bg-blue-100 text-blue-800`;
      case "processing":
      case "under_review":
        return `${base} bg-yellow-100 text-yellow-800`;
      default:
        return `${base} bg-gray-100 text-gray-600`;
    }
  };

  const categoryBadge =
    "inline-block px-2 py-0.5 rounded text-xs font-medium bg-[var(--section-bg)] text-[var(--muted)]";

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--muted)] text-sm">Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-3 text-[var(--foreground)]">
          Project Dashboard
        </h1>
        <p className="text-[var(--muted)] text-sm mb-1">
          Unable to load projects from the API.
        </p>
        <p className="text-[var(--muted-light)] text-xs">
          Make sure the backend is running at{" "}
          {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-[var(--foreground)]">
        Funded Projects
      </h1>

      {projects.length === 0 ? (
        <div className="text-center py-16 bg-[var(--section-bg)] rounded-lg">
          <p className="text-[var(--muted)] text-sm mb-1">
            No projects yet.
          </p>
          <p className="text-[var(--muted-light)] text-xs">
            Projects that have been submitted will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white border border-[var(--border)] rounded-lg p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-[var(--foreground)] truncate">
                    {project.name}
                  </h3>
                  <span className={categoryBadge}>{project.category}</span>
                  <span className={statusBadge(project.status)}>
                    {project.status}
                  </span>
                </div>
                {project.tagline && (
                  <p className="text-sm text-[var(--muted)] truncate">
                    {project.tagline}
                  </p>
                )}
                <a
                  href={project.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--accent)] hover:underline truncate block mt-1"
                >
                  {project.website_url}
                </a>
              </div>
              {project.ranking_score !== undefined && (
                <div className="text-right shrink-0">
                  <p className="text-xs text-[var(--muted-light)]">Score</p>
                  <p className="text-lg font-bold text-[var(--foreground)]">
                    {project.ranking_score}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
