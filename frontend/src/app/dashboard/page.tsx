"use client";

import { useEffect, useState } from "react";

interface Project {
  id: string;
  name: string;
  website_url: string;
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

  const statusColor = (status: string) => {
    switch (status) {
      case "funded":
        return "text-green-400";
      case "ranked":
        return "text-blue-400";
      case "under_review":
        return "text-yellow-400";
      default:
        return "text-[var(--muted)]";
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--muted)]">Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
        <p className="text-[var(--muted)] mb-2">
          Unable to load projects from the API.
        </p>
        <p className="text-[var(--muted)] text-sm">
          Make sure the backend is running at{" "}
          {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {projects.length === 0 ? (
        <p className="text-[var(--muted)] text-center py-12">
          No projects submitted yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-6"
            >
              <h3 className="text-lg font-semibold mb-2">{project.name}</h3>
              <a
                href={project.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:text-[var(--accent-hover)] text-sm block mb-3 truncate"
              >
                {project.website_url}
              </a>
              <div className="flex items-center justify-between text-sm">
                <span className="bg-[var(--border)] px-2 py-1 rounded">
                  {project.category}
                </span>
                <span className={`font-medium ${statusColor(project.status)}`}>
                  {project.status}
                </span>
              </div>
              {project.ranking_score !== undefined && (
                <div className="mt-3 text-sm text-[var(--muted)]">
                  Ranking Score:{" "}
                  <span className="text-white font-medium">
                    {project.ranking_score}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
