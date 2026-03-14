"use client";

import { useState } from "react";
import Link from "next/link";

const categoryOptions = [
  { value: "defi", label: "DeFi" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "developer_tools", label: "Developer Tools" },
  { value: "consumer", label: "Consumer" },
  { value: "other", label: "Other" },
];

const stageOptions = [
  { value: "idea", label: "Idea" },
  { value: "mvp", label: "MVP" },
  { value: "beta", label: "Beta" },
  { value: "live", label: "Live" },
  { value: "scaling", label: "Scaling" },
];

export default function SubmitPage() {
  const [formData, setFormData] = useState({
    name: "",
    website_url: "",
    short_description: "",
    description: "",
    category: "other",
    github_url: "",
    recipient_wallet: "",
    team_size: "",
    stage: "mvp",
    requested_funding: "",
    team_background: "",
    market_summary: "",
    traction_summary: "",
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
        requested_funding: formData.requested_funding
          ? Number(formData.requested_funding)
          : undefined,
        github_url: formData.github_url || undefined,
        recipient_wallet: formData.recipient_wallet || undefined,
        team_background: formData.team_background || undefined,
        market_summary: formData.market_summary || undefined,
        traction_summary: formData.traction_summary || undefined,
      };

      const res = await fetch(`${apiUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Submission failed");
      }

      setSuccess(true);
      setFormData({
        name: "",
        website_url: "",
        short_description: "",
        description: "",
        category: "other",
        github_url: "",
        recipient_wallet: "",
        team_size: "",
        stage: "mvp",
        requested_funding: "",
        team_background: "",
        market_summary: "",
        traction_summary: "",
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
            <div
              className="mx-auto mb-6 w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, var(--violet), var(--blue))" }}
            >
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
              Proposal Submitted
            </h1>
            <p className="text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
              The evaluation engine, treasury policy, and funding decision agent
              have started processing your proposal.
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="mb-8 animate-fade-in">
          <p className="section-label">Apply</p>
          <h1 className="text-3xl sm:text-4xl font-bold gradient-text mb-3">
            Submit a Startup Proposal
          </h1>
          <p className="text-[var(--text-muted)]">
            Provide the core inputs used by the evaluation engine, treasury
            policy, and funding decision agent.
          </p>
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

        <div className="glass-card p-6 sm:p-8 animate-fade-in-delay-1">
          <form onSubmit={handleSubmit} className="space-y-5">
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
                placeholder="AutoVC for climate founders"
              />
            </div>

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
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label htmlFor="short_description" className={labelClass}>
                One-line Description <span className="text-[var(--violet)]">*</span>
              </label>
              <input
                type="text"
                id="short_description"
                name="short_description"
                required
                maxLength={140}
                value={formData.short_description}
                onChange={handleChange}
                className="input-dark"
                placeholder="What does the project do in one sentence?"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1.5">
                {formData.short_description.length}/140 characters
              </p>
            </div>

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
                placeholder="Describe the product, problem, and why this team can execute."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                  {stageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="team_size" className={labelClass}>
                  Team Size
                </label>
                <input
                  type="number"
                  id="team_size"
                  name="team_size"
                  min="1"
                  value={formData.team_size}
                  onChange={handleChange}
                  className="input-dark"
                  placeholder="e.g. 4"
                />
              </div>

              <div>
                <label htmlFor="requested_funding" className={labelClass}>
                  Requested Funding (USD)
                </label>
                <input
                  type="number"
                  id="requested_funding"
                  name="requested_funding"
                  min="0"
                  value={formData.requested_funding}
                  onChange={handleChange}
                  className="input-dark"
                  placeholder="e.g. 75000"
                />
              </div>
            </div>

            <div>
              <label htmlFor="github_url" className={labelClass}>
                GitHub Repository URL
              </label>
              <input
                type="url"
                id="github_url"
                name="github_url"
                value={formData.github_url}
                onChange={handleChange}
                className="input-dark"
                placeholder="https://github.com/org/repo"
              />
            </div>

            <div>
              <label htmlFor="recipient_wallet" className={labelClass}>
                Wallet Address (EVM)
              </label>
              <input
                type="text"
                id="recipient_wallet"
                name="recipient_wallet"
                value={formData.recipient_wallet}
                onChange={handleChange}
                className="input-dark"
                placeholder="0x..."
              />
              <p className="text-xs text-[var(--text-muted)] mt-1.5">
                Optional wallet address for direct funding and escrow release.
              </p>
            </div>

            <div>
              <label htmlFor="team_background" className={labelClass}>
                Team Background
              </label>
              <textarea
                id="team_background"
                name="team_background"
                rows={3}
                value={formData.team_background}
                onChange={handleChange}
                className="input-dark resize-vertical"
                placeholder="Relevant experience, past exits, technical background, or domain expertise."
              />
            </div>

            <div>
              <label htmlFor="market_summary" className={labelClass}>
                Market Opportunity
              </label>
              <textarea
                id="market_summary"
                name="market_summary"
                rows={3}
                value={formData.market_summary}
                onChange={handleChange}
                className="input-dark resize-vertical"
                placeholder="Market size, demand signal, customer pain point, and competitive positioning."
              />
            </div>

            <div>
              <label htmlFor="traction_summary" className={labelClass}>
                Traction Signals
              </label>
              <textarea
                id="traction_summary"
                name="traction_summary"
                rows={3}
                value={formData.traction_summary}
                onChange={handleChange}
                className="input-dark resize-vertical"
                placeholder="Users, pilots, revenue, repository activity, or other adoption signals."
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-gradient w-full py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Proposal"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
