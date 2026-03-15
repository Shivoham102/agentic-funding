"use client";

import Link from "next/link";
import { useState } from "react";

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

interface BudgetLineItemDraft {
  category: string;
  amount: string;
  notes: string;
}

interface RequestedMilestoneDraft {
  name: string;
  description: string;
  target_days: string;
  requested_release_ratio: string;
}

interface SubmittedProject {
  id: string;
  name: string;
}

function emptyBudgetItem(): BudgetLineItemDraft {
  return { category: "", amount: "", notes: "" };
}

function emptyMilestone(): RequestedMilestoneDraft {
  return {
    name: "",
    description: "",
    target_days: "",
    requested_release_ratio: "",
  };
}

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
  const [budgetItems, setBudgetItems] = useState<BudgetLineItemDraft[]>([
    emptyBudgetItem(),
  ]);
  const [requestedMilestones, setRequestedMilestones] = useState<
    RequestedMilestoneDraft[]
  >([emptyMilestone()]);
  const [submittedProject, setSubmittedProject] = useState<SubmittedProject | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    setFormData((current) => ({ ...current, [e.target.name]: e.target.value }));
  };

  const handleBudgetChange = (
    index: number,
    field: keyof BudgetLineItemDraft,
    value: string,
  ) => {
    setBudgetItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleMilestoneChange = (
    index: number,
    field: keyof RequestedMilestoneDraft,
    value: string,
  ) => {
    setRequestedMilestones((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const addBudgetItem = () => {
    setBudgetItems((current) => [...current, emptyBudgetItem()]);
  };

  const removeBudgetItem = (index: number) => {
    setBudgetItems((current) =>
      current.length === 1
        ? [emptyBudgetItem()]
        : current.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const addMilestone = () => {
    setRequestedMilestones((current) => [...current, emptyMilestone()]);
  };

  const removeMilestone = (index: number) => {
    setRequestedMilestones((current) =>
      current.length === 1
        ? [emptyMilestone()]
        : current.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const resetFormState = () => {
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
    setBudgetItems([emptyBudgetItem()]);
    setRequestedMilestones([emptyMilestone()]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess(false);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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
        budget_breakdown: budgetItems
          .filter(
            (item) =>
              item.category.trim() || item.amount.trim() || item.notes.trim(),
          )
          .map((item) => ({
            category: item.category.trim(),
            amount: Number(item.amount || 0),
            notes: item.notes.trim() || undefined,
          })),
        requested_milestones: requestedMilestones
          .filter(
            (item) =>
              item.name.trim() ||
              item.description.trim() ||
              item.target_days.trim() ||
              item.requested_release_ratio.trim(),
          )
          .map((item) => ({
            name: item.name.trim(),
            description: item.description.trim(),
            target_days: item.target_days ? Number(item.target_days) : undefined,
            requested_release_ratio: item.requested_release_ratio
              ? Number(item.requested_release_ratio)
              : undefined,
          })),
      };

      const res = await fetch(`${apiUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Submission failed");
      }

      const createdProject = (await res.json()) as SubmittedProject;
      setSubmittedProject(createdProject);
      setSuccess(true);
      resetFormState();
    } catch {
      setError("Failed to submit project. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetSuccessState = () => {
    setSuccess(false);
    setError("");
    setSubmittedProject(null);
  };

  const labelClass =
    "text-sm font-medium text-[var(--text-secondary)] mb-2 block";

  if (success) {
    return (
      <div className="pt-28 pb-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="glass-card p-8 sm:p-12 text-center animate-fade-in">
            <div
              className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: "linear-gradient(135deg, var(--violet), var(--blue))",
              }}
            >
              <svg
                className="h-8 w-8 text-white"
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

            <h1 className="gradient-text mb-3 text-2xl font-bold sm:text-3xl">
              Proposal Submitted
            </h1>
            <p className="mx-auto mb-4 max-w-md text-[var(--text-secondary)]">
              The review pipeline has already started. You can now inspect the
              evidence bundle, scorecard, treasury state, and verifier output from
              the status page.
            </p>
            {submittedProject && (
              <div className="mx-auto mb-8 max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Project Handle
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {submittedProject.name}
                </p>
                <p className="mt-1 break-all text-xs text-[var(--text-secondary)]">
                  ID: {submittedProject.id}
                </p>
              </div>
            )}

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={
                  submittedProject
                    ? `/status?q=${encodeURIComponent(submittedProject.name)}`
                    : "/status"
                }
                className="btn-gradient px-8 py-3 text-sm font-semibold"
              >
                Open Status
              </Link>
              <button
                onClick={resetSuccessState}
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

  return (
    <div className="pt-28 pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="mb-8 animate-fade-in">
          <p className="section-label">Apply</p>
          <h1 className="gradient-text mb-3 text-3xl font-bold sm:text-4xl">
            Submit a Startup Proposal
          </h1>
          <p className="text-[var(--text-muted)]">
            Capture the founder narrative, budget, milestones, repository, and
            Solana payout wallet in the same schema the diligence and scoring
            pipeline reads downstream.
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
          <form onSubmit={handleSubmit} className="space-y-6">
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

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
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
                rows={5}
                value={formData.description}
                onChange={handleChange}
                className="input-dark resize-y"
                placeholder="Describe the product, problem, why now, and why this team can execute."
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
                  Requested Funding (USDC)
                </label>
                <input
                  type="number"
                  id="requested_funding"
                  name="requested_funding"
                  min="0"
                  value={formData.requested_funding}
                  onChange={handleChange}
                  className="input-dark"
                  placeholder="e.g. 100"
                />
                <p className="text-xs text-[var(--text-muted)] mt-1.5">
                  Amount in USDC (e.g. 2 = 2 USDC)
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="recipient_wallet" className={labelClass}>
                Solana Recipient Wallet
              </label>
              <input
                type="text"
                id="recipient_wallet"
                name="recipient_wallet"
                value={formData.recipient_wallet}
                onChange={handleChange}
                className="input-dark"
                placeholder="BWgJc8KvCbxqrn2Wggb395c2URfS19a5NoAEVDaiyXCa"
              />
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Optional. Used for Solana wallet enrichment and downstream funding
                release simulation.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5">
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
                  className="input-dark resize-y"
                  placeholder="Relevant experience, technical background, prior exits, or domain expertise."
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
                  className="input-dark resize-y"
                  placeholder="Market size, customer pain point, demand, and competitive positioning."
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
                  className="input-dark resize-y"
                  placeholder="Users, pilots, revenue, growth, partnerships, or repository activity."
                />
              </div>
            </div>

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Budget Breakdown</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Optional founder-submitted budget lines used in capital-efficiency
                    scoring.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addBudgetItem}
                  className="btn-secondary px-4 py-2 text-xs font-semibold"
                >
                  Add Budget Line
                </button>
              </div>

              <div className="space-y-4">
                {budgetItems.map((item, index) => (
                  <div
                    key={`budget-${index}`}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">
                        Budget Line {index + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeBudgetItem(index)}
                        className="text-xs text-[var(--text-muted)] transition-colors hover:text-white"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        value={item.category}
                        onChange={(e) =>
                          handleBudgetChange(index, "category", e.target.value)
                        }
                        className="input-dark"
                        placeholder="Category (engineering, GTM, infra)"
                      />
                      <input
                        type="number"
                        min="0"
                        value={item.amount}
                        onChange={(e) =>
                          handleBudgetChange(index, "amount", e.target.value)
                        }
                        className="input-dark"
                        placeholder="Amount"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={item.notes}
                      onChange={(e) =>
                        handleBudgetChange(index, "notes", e.target.value)
                      }
                      className="input-dark mt-3 resize-y"
                      placeholder="Optional notes for this budget line"
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Founder Milestones</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Optional milestone roadmap used to draft escrow releases and
                    package recommendations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addMilestone}
                  className="btn-secondary px-4 py-2 text-xs font-semibold"
                >
                  Add Milestone
                </button>
              </div>

              <div className="space-y-4">
                {requestedMilestones.map((item, index) => (
                  <div
                    key={`milestone-${index}`}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">
                        Milestone {index + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeMilestone(index)}
                        className="text-xs text-[var(--text-muted)] transition-colors hover:text-white"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) =>
                          handleMilestoneChange(index, "name", e.target.value)
                        }
                        className="input-dark"
                        placeholder="Milestone name"
                      />
                      <input
                        type="number"
                        min="0"
                        value={item.target_days}
                        onChange={(e) =>
                          handleMilestoneChange(index, "target_days", e.target.value)
                        }
                        className="input-dark"
                        placeholder="Target days"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={item.description}
                      onChange={(e) =>
                        handleMilestoneChange(index, "description", e.target.value)
                      }
                      className="input-dark mt-3 resize-y"
                      placeholder="What will be delivered for this milestone?"
                    />
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={item.requested_release_ratio}
                      onChange={(e) =>
                        handleMilestoneChange(
                          index,
                          "requested_release_ratio",
                          e.target.value,
                        )
                      }
                      className="input-dark mt-3"
                      placeholder="Requested release ratio (0.25 = 25%)"
                    />
                  </div>
                ))}
              </div>
            </section>

            <button
              type="submit"
              disabled={submitting}
              className="btn-gradient w-full py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Proposal"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
