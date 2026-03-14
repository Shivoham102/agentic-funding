"use client";

import { useState } from "react";

export default function SubmitPage() {
  const [formData, setFormData] = useState({
    name: "",
    website_url: "",
    description: "",
    github_url: "",
    category: "Other",
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
      const res = await fetch(`${apiUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Submission failed");

      console.log("Project submitted:", formData);
      setSuccess(true);
      setFormData({
        name: "",
        website_url: "",
        description: "",
        github_url: "",
        category: "Other",
      });
    } catch (err) {
      console.error("Submit error:", err);
      setError("Failed to submit project. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Submit Your Project</h1>

      {success && (
        <div className="bg-green-900/50 border border-green-700 text-green-300 px-4 py-3 rounded-lg mb-6">
          Project submitted successfully! Our AI agents will review it shortly.
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Project Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--accent)]"
            placeholder="My Awesome Project"
          />
        </div>

        <div>
          <label
            htmlFor="website_url"
            className="block text-sm font-medium mb-2"
          >
            Website URL *
          </label>
          <input
            type="url"
            id="website_url"
            name="website_url"
            required
            value={formData.website_url}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--accent)]"
            placeholder="https://myproject.com"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium mb-2"
          >
            Description *
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            value={formData.description}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--accent)] resize-vertical"
            placeholder="Tell us about your project..."
          />
        </div>

        <div>
          <label
            htmlFor="github_url"
            className="block text-sm font-medium mb-2"
          >
            GitHub URL{" "}
            <span className="text-[var(--muted)]">(optional)</span>
          </label>
          <input
            type="url"
            id="github_url"
            name="github_url"
            value={formData.github_url}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--accent)]"
            placeholder="https://github.com/user/repo"
          />
        </div>

        <div>
          <label
            htmlFor="category"
            className="block text-sm font-medium mb-2"
          >
            Category *
          </label>
          <select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="DeFi">DeFi</option>
            <option value="Infrastructure">Infrastructure</option>
            <option value="Developer Tools">Developer Tools</option>
            <option value="Consumer">Consumer</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Project"}
        </button>
      </form>
    </div>
  );
}
