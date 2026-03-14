"use client";

import { useState } from "react";
import Link from "next/link";

export default function SubmitPage() {
  const [formData, setFormData] = useState({
    name: "",
    website_url: "",
    tagline: "",
    description: "",
    category: "Other",
    github_url: "",
    team_size: "",
    stage: "MVP",
    funding_amount: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess(false);

    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const payload = {
        ...formData,
        team_size: formData.team_size ? Number(formData.team_size) : undefined,
        funding_amount: formData.funding_amount
          ? Number(formData.funding_amount)
          : undefined,
      };
      const res = await fetch(`${apiUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Submission failed");

      setSuccess(true);
      setFormData({
        name: "",
        website_url: "",
        tagline: "",
        description: "",
        category: "Other",
        github_url: "",
        team_size: "",
        stage: "MVP",
        funding_amount: "",
      });
    } catch {
      setError("Failed to submit project. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="text-4xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold mb-3 text-[var(--foreground)]">
          Application Submitted!
        </h1>
        <p className="text-[var(--muted)] mb-6">
          Our AI agents will review your project shortly. You&apos;ll be able to
          track progress on the dashboard.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold px-6 py-2.5 rounded transition-colors text-sm"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2 bg-white border border-[var(--border)] rounded text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";
  const labelClass = "block text-sm font-medium mb-1.5 text-[var(--foreground)]";
  const helperClass = "text-xs text-[var(--muted-light)] mt-1";

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2 text-[var(--foreground)]">
        Apply for Funding
      </h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        Tell us about your project. Our AI agents will review your application
        automatically.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className={labelClass}>
            Project Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            className={inputClass}
            placeholder="My Project"
          />
        </div>

        <div>
          <label htmlFor="website_url" className={labelClass}>
            Project Website <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            id="website_url"
            name="website_url"
            required
            value={formData.website_url}
            onChange={handleChange}
            className={inputClass}
            placeholder="https://myproject.com"
          />
          <p className={helperClass}>
            We&apos;ll analyze your site automatically.
          </p>
        </div>

        <div>
          <label htmlFor="tagline" className={labelClass}>
            One-line Description <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="tagline"
            name="tagline"
            required
            maxLength={140}
            value={formData.tagline}
            onChange={handleChange}
            className={inputClass}
            placeholder="A short tagline for your project"
          />
          <p className={helperClass}>
            {formData.tagline.length}/140 characters
          </p>
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>
            Detailed Description <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            value={formData.description}
            onChange={handleChange}
            className={`${inputClass} resize-vertical`}
            placeholder="What does your project do? What problem does it solve?"
          />
        </div>

        <div>
          <label htmlFor="category" className={labelClass}>
            Category
          </label>
          <select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className={inputClass}
          >
            <option value="DeFi">DeFi</option>
            <option value="Infrastructure">Infrastructure</option>
            <option value="Developer Tools">Developer Tools</option>
            <option value="Consumer">Consumer</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="github_url" className={labelClass}>
            GitHub Repository URL{" "}
            <span className="text-[var(--muted-light)] font-normal">
              (optional)
            </span>
          </label>
          <input
            type="url"
            id="github_url"
            name="github_url"
            value={formData.github_url}
            onChange={handleChange}
            className={inputClass}
            placeholder="https://github.com/user/repo"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="team_size" className={labelClass}>
              Team Size{" "}
              <span className="text-[var(--muted-light)] font-normal">
                (optional)
              </span>
            </label>
            <input
              type="number"
              id="team_size"
              name="team_size"
              min="1"
              value={formData.team_size}
              onChange={handleChange}
              className={inputClass}
              placeholder="e.g. 3"
            />
          </div>

          <div>
            <label htmlFor="stage" className={labelClass}>
              Current Stage
            </label>
            <select
              id="stage"
              name="stage"
              value={formData.stage}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="Idea">Idea</option>
              <option value="MVP">MVP</option>
              <option value="Beta">Beta</option>
              <option value="Live">Live</option>
              <option value="Scaling">Scaling</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="funding_amount" className={labelClass}>
            Requested Funding Amount (USD){" "}
            <span className="text-[var(--muted-light)] font-normal">
              (optional)
            </span>
          </label>
          <input
            type="number"
            id="funding_amount"
            name="funding_amount"
            min="0"
            value={formData.funding_amount}
            onChange={handleChange}
            className={inputClass}
            placeholder="e.g. 50000"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded transition-colors text-sm cursor-pointer"
        >
          {submitting ? "Submitting..." : "Submit Application"}
        </button>
      </form>
    </div>
  );
}
