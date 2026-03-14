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

  const resetForm = () => {
    setSuccess(false);
    setError("");
  };

  if (success) {
    return (
      <div className="pt-28 pb-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="glass-card p-8 sm:p-12 text-center animate-fade-in">
            {/* Checkmark Icon */}
            <div className="mx-auto mb-6 w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, var(--violet), var(--blue))" }}>
              <svg
                className="w-8 h-8 text-white"
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
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold mb-3 gradient-text">
              Application Submitted!
            </h1>
            <p className="text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
              Our AI agents will review your project shortly. You can track your
              application status at any time.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/status" className="btn-gradient px-8 py-3 text-sm font-semibold">
                Check Status
              </Link>
              <button
                onClick={resetForm}
                className="btn-secondary px-8 py-3 text-sm font-semibold"
              >
                Submit Another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const labelClass =
    "text-sm font-medium text-[var(--text-secondary)] mb-2 block";

  return (
    <div className="pt-28 pb-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <p className="section-label">Apply</p>
          <h1 className="text-3xl sm:text-4xl font-bold gradient-text mb-3">
            Apply for Funding
          </h1>
          <p className="text-[var(--text-muted)]">
            Tell us about your project. Our AI agents will review your
            application automatically.
          </p>
        </div>

        {/* Error State */}
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

        {/* Form Card */}
        <div className="glass-card p-6 sm:p-8 animate-fade-in-delay-1">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Project Name */}
            <div>
              <label htmlFor="name" className={labelClass}>
                Project Name <span className="text-[var(--violet)]">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="input-dark"
                placeholder="My Project"
              />
            </div>

            {/* Project Website */}
            <div>
              <label htmlFor="website_url" className={labelClass}>
                Project Website <span className="text-[var(--violet)]">*</span>
              </label>
              <input
                type="url"
                id="website_url"
                name="website_url"
                required
                value={formData.website_url}
                onChange={handleChange}
                className="input-dark"
                placeholder="https://myproject.com"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1.5">
                We&apos;ll analyze your site automatically using AI
              </p>
            </div>

            {/* Tagline */}
            <div>
              <label htmlFor="tagline" className={labelClass}>
                One-line Description <span className="text-[var(--violet)]">*</span>
              </label>
              <input
                type="text"
                id="tagline"
                name="tagline"
                required
                maxLength={140}
                value={formData.tagline}
                onChange={handleChange}
                className="input-dark"
                placeholder="A short tagline for your project"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1.5">
                {formData.tagline.length}/140 characters
              </p>
            </div>

            {/* Detailed Description */}
            <div>
              <label htmlFor="description" className={labelClass}>
                Detailed Description <span className="text-[var(--violet)]">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                value={formData.description}
                onChange={handleChange}
                className="input-dark resize-vertical"
                placeholder="What does your project do? What problem does it solve?"
              />
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className={labelClass}>
                Category
              </label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="input-dark"
              >
                <option value="DeFi">DeFi</option>
                <option value="Infrastructure">Infrastructure</option>
                <option value="Developer Tools">Developer Tools</option>
                <option value="Consumer">Consumer</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* GitHub URL */}
            <div>
              <label htmlFor="github_url" className={labelClass}>
                GitHub Repository URL{" "}
                <span className="text-[var(--text-muted)] font-normal">(optional)</span>
              </label>
              <input
                type="url"
                id="github_url"
                name="github_url"
                value={formData.github_url}
                onChange={handleChange}
                className="input-dark"
                placeholder="https://github.com/user/repo"
              />
            </div>

            {/* Team Size + Stage side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="team_size" className={labelClass}>
                  Team Size{" "}
                  <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  id="team_size"
                  name="team_size"
                  min="1"
                  value={formData.team_size}
                  onChange={handleChange}
                  className="input-dark"
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
                  className="input-dark"
                >
                  <option value="Idea">Idea</option>
                  <option value="MVP">MVP</option>
                  <option value="Beta">Beta</option>
                  <option value="Live">Live</option>
                  <option value="Scaling">Scaling</option>
                </select>
              </div>
            </div>

            {/* Funding Amount */}
            <div>
              <label htmlFor="funding_amount" className={labelClass}>
                Requested Funding Amount (USD){" "}
                <span className="text-[var(--text-muted)] font-normal">(optional)</span>
              </label>
              <input
                type="number"
                id="funding_amount"
                name="funding_amount"
                min="0"
                value={formData.funding_amount}
                onChange={handleChange}
                className="input-dark"
                placeholder="e.g. 50000"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="btn-gradient w-full py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Application"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
