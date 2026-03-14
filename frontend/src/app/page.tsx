import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="text-center py-16 md:py-24 max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-[var(--foreground)]">
          Get Funded. Build What Matters.
        </h1>
        <p className="text-lg text-[var(--muted)] mb-8 max-w-2xl mx-auto leading-relaxed">
          Submit your project and let our AI agents review your work, assess
          traction, and allocate funding — fast, fair, and on-chain.
        </p>
        <Link
          href="/submit"
          className="inline-block bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold px-8 py-3 rounded transition-colors text-base"
        >
          Apply for Funding
        </Link>
      </section>

      {/* How It Works */}
      <section className="w-full py-12 md:py-16">
        <h2 className="text-2xl font-bold text-center mb-10 text-[var(--foreground)]">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[var(--section-bg)] rounded-lg p-6 text-center">
            <div className="w-10 h-10 bg-[var(--accent)] text-white rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-4">
              1
            </div>
            <h3 className="text-base font-semibold mb-2 text-[var(--foreground)]">
              Submit Your Project
            </h3>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Enter your project details and website. Tell us what you&apos;re
              building and why it matters.
            </p>
          </div>
          <div className="bg-[var(--section-bg)] rounded-lg p-6 text-center">
            <div className="w-10 h-10 bg-[var(--accent)] text-white rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-4">
              2
            </div>
            <h3 className="text-base font-semibold mb-2 text-[var(--foreground)]">
              AI Review
            </h3>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Our agents analyze your project, team, and traction automatically.
              No waiting for human reviewers.
            </p>
          </div>
          <div className="bg-[var(--section-bg)] rounded-lg p-6 text-center">
            <div className="w-10 h-10 bg-[var(--accent)] text-white rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-4">
              3
            </div>
            <h3 className="text-base font-semibold mb-2 text-[var(--foreground)]">
              Receive Funding
            </h3>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Get funded on-chain — 50% upfront and 50% released when you hit
              milestones.
            </p>
          </div>
        </div>
      </section>

      {/* What We Look For */}
      <section className="w-full py-12 md:py-16">
        <h2 className="text-2xl font-bold text-center mb-10 text-[var(--foreground)]">
          What We Look For
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          <div className="flex items-start gap-3 bg-[var(--section-bg)] rounded-lg p-4">
            <span className="text-[var(--accent)] font-bold text-lg mt-0.5">
              ✓
            </span>
            <div>
              <h3 className="font-semibold text-sm text-[var(--foreground)]">
                Strong Technical Foundation
              </h3>
              <p className="text-sm text-[var(--muted)]">
                Clean code, solid architecture, and meaningful commits.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-[var(--section-bg)] rounded-lg p-4">
            <span className="text-[var(--accent)] font-bold text-lg mt-0.5">
              ✓
            </span>
            <div>
              <h3 className="font-semibold text-sm text-[var(--foreground)]">
                Clear Problem-Solution Fit
              </h3>
              <p className="text-sm text-[var(--muted)]">
                A real problem with a well-defined solution and target audience.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-[var(--section-bg)] rounded-lg p-4">
            <span className="text-[var(--accent)] font-bold text-lg mt-0.5">
              ✓
            </span>
            <div>
              <h3 className="font-semibold text-sm text-[var(--foreground)]">
                Growth Potential
              </h3>
              <p className="text-sm text-[var(--muted)]">
                Evidence of traction, user interest, or market opportunity.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-[var(--section-bg)] rounded-lg p-4">
            <span className="text-[var(--accent)] font-bold text-lg mt-0.5">
              ✓
            </span>
            <div>
              <h3 className="font-semibold text-sm text-[var(--foreground)]">
                Active Development
              </h3>
              <p className="text-sm text-[var(--muted)]">
                Regular GitHub activity and a committed team building
                consistently.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-[var(--border)] mt-8 pt-8 pb-12 text-center">
        <p className="font-semibold text-sm text-[var(--foreground)]">
          Agentic Funding
        </p>
        <p className="text-xs text-[var(--muted)] mt-1">
          AI-powered funding for the builders of tomorrow.
        </p>
      </footer>
    </div>
  );
}
