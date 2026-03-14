import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="text-center py-20">
        <h1 className="text-5xl font-bold mb-4">Agentic Funding</h1>
        <p className="text-xl text-[var(--muted)] mb-8 max-w-2xl">
          AI-powered funding for developers. Submit your project, let our AI
          agents review it, and get funded — all in one seamless flow.
        </p>
        <Link
          href="/submit"
          className="inline-block bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold px-8 py-3 rounded-lg transition-colors"
        >
          Submit Your Project
        </Link>
      </section>

      {/* How It Works */}
      <section className="w-full py-16">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-6 text-center">
            <div className="text-4xl mb-4">📝</div>
            <h3 className="text-xl font-semibold mb-2">1. Submit</h3>
            <p className="text-[var(--muted)]">
              Tell us about your project — what it does, why it matters, and
              where to find it.
            </p>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-6 text-center">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2">2. AI Review</h3>
            <p className="text-[var(--muted)]">
              Our AI agents analyze your project for viability, innovation, and
              impact.
            </p>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-6 text-center">
            <div className="text-4xl mb-4">💰</div>
            <h3 className="text-xl font-semibold mb-2">3. Get Funded</h3>
            <p className="text-[var(--muted)]">
              Top-ranked projects receive funding directly — no lengthy
              application process.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
