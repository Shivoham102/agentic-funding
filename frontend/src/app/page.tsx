import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* ===== HERO SECTION ===== */}
      <section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden pt-28">
        {/* Floating orbs */}
        <div className="orb w-[500px] h-[500px] bg-[var(--violet)] -top-40 -left-40" />
        <div className="orb w-[400px] h-[400px] bg-[var(--blue)] -bottom-32 -right-32" />
        <div className="orb w-[300px] h-[300px] bg-[var(--indigo)] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ opacity: 0.08 }} />

        {/* Grid overlay */}
        <div className="absolute inset-0 grid-overlay" />

        {/* Hero content */}
        <div className="relative z-10 text-center px-4 sm:px-6 max-w-5xl mx-auto">
          <p className="section-label mb-6 animate-fade-in">AI-Powered Funding</p>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 animate-fade-in-delay-1">
            Fund the Future of
            <br />
            <span className="gradient-text">Developer Innovation</span>
          </h1>

          <p className="text-base md:text-lg leading-relaxed text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 animate-fade-in-delay-2">
            Submit your project, let AI agents evaluate your work, and receive
            on-chain funding — fast, fair, and fully transparent. No gatekeepers,
            no bias, just great projects getting funded.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in-delay-3">
            <Link href="/submit" className="btn-gradient text-base px-8 py-3">
              Apply for Funding
            </Link>
            <Link href="#how-it-works" className="btn-secondary text-base px-8 py-3">
              See How It Works
            </Link>
          </div>

          {/* Stat badges */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 animate-fade-in-delay-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">50+</span>
              <span className="text-sm text-[var(--text-muted)]">Projects Funded</span>
            </div>
            <div className="hidden sm:block w-px h-6 bg-[var(--border)]" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">⛓️</span>
              <span className="text-sm text-[var(--text-muted)]">On-Chain Payments</span>
            </div>
            <div className="hidden sm:block w-px h-6 bg-[var(--border)]" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">$2M+</span>
              <span className="text-sm text-[var(--text-muted)]">Distributed</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="relative w-full py-24 md:py-32 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="section-label mb-4">How It Works</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Three Steps to Funding
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {/* Step 1 */}
            <div className="glass-card p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--violet)] to-[var(--blue)] flex items-center justify-center text-white font-bold text-lg mx-auto mb-6">
                1
              </div>
              <h3 className="text-xl font-semibold mb-3 text-white">
                Submit Your Project
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Enter your project details and website URL. Our agents will
                analyze your site automatically.
              </p>
            </div>

            {/* Step 2 */}
            <div className="glass-card p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--violet)] to-[var(--blue)] flex items-center justify-center text-white font-bold text-lg mx-auto mb-6">
                2
              </div>
              <h3 className="text-xl font-semibold mb-3 text-white">
                AI Review &amp; Ranking
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Multiple AI agents evaluate your project on technical quality,
                traction, team, and market fit.
              </p>
            </div>

            {/* Step 3 */}
            <div className="glass-card p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--violet)] to-[var(--blue)] flex items-center justify-center text-white font-bold text-lg mx-auto mb-6">
                3
              </div>
              <h3 className="text-xl font-semibold mb-3 text-white">
                Receive Funding
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Get funded on-chain via Solana. 50% upfront, 50% released when
                you hit growth milestones.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== WHAT WE FUND ===== */}
      <section className="relative w-full py-24 md:py-32 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="section-label mb-4">What We Fund</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Built for Builders
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {/* DeFi Protocols */}
            <div className="glass-card p-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--violet)] to-[var(--indigo)] flex items-center justify-center text-2xl mb-5">
                🏦
              </div>
              <h3 className="text-xl font-semibold mb-3 text-white">
                DeFi Protocols
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Smart contracts, DEXs, lending protocols, yield aggregators.
                Build the financial infrastructure of tomorrow.
              </p>
            </div>

            {/* Developer Tools */}
            <div className="glass-card p-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--indigo)] to-[var(--blue)] flex items-center justify-center text-2xl mb-5">
                🛠️
              </div>
              <h3 className="text-xl font-semibold mb-3 text-white">
                Developer Tools
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                SDKs, frameworks, CLIs, APIs that make developers productive.
                Tools that empower the ecosystem.
              </p>
            </div>

            {/* Infrastructure */}
            <div className="glass-card p-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] flex items-center justify-center text-2xl mb-5">
                🌐
              </div>
              <h3 className="text-xl font-semibold mb-3 text-white">
                Infrastructure
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Nodes, indexers, oracles, bridges, and protocol infrastructure.
                The backbone of decentralized systems.
              </p>
            </div>

            {/* Consumer Apps */}
            <div className="glass-card p-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--violet)] to-[var(--blue)] flex items-center justify-center text-2xl mb-5">
                📱
              </div>
              <h3 className="text-xl font-semibold mb-3 text-white">
                Consumer Apps
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                User-facing apps, social, gaming, marketplaces. Products people
                love to use every day.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA BANNER ===== */}
      <section className="relative w-full py-24 md:py-32 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card-gradient p-12 md:p-16 text-center relative overflow-hidden">
            {/* Subtle orb inside card */}
            <div className="orb w-[300px] h-[300px] bg-[var(--violet)] -top-20 -right-20" />
            <div className="orb w-[200px] h-[200px] bg-[var(--blue)] -bottom-16 -left-16" />

            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                <span className="gradient-text">Ready to get funded?</span>
              </h2>
              <p className="text-[var(--text-secondary)] text-base md:text-lg leading-relaxed max-w-xl mx-auto mb-8">
                Join dozens of innovative projects already funded through our
                AI-powered pipeline. No pitch decks, no meetings — just ship
                great code.
              </p>
              <Link href="/submit" className="btn-gradient text-base px-10 py-4">
                Start Your Application
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="w-full border-t border-[var(--border)] py-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8 mb-12">
            {/* Brand column */}
            <div className="md:col-span-1">
              <Link href="/" className="text-lg font-bold text-white tracking-tight">
                <span className="gradient-text">Agentic</span> Funding
              </Link>
              <p className="text-sm text-[var(--text-muted)] mt-3 leading-relaxed">
                AI-powered funding for the builders of tomorrow. Fast, fair,
                transparent.
              </p>
            </div>

            {/* Product column */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
                Product
              </h4>
              <ul className="space-y-3">
                <li>
                  <Link href="/submit" className="text-sm text-[var(--text-muted)] hover:text-white transition-colors duration-300">
                    Apply
                  </Link>
                </li>
                <li>
                  <Link href="/status" className="text-sm text-[var(--text-muted)] hover:text-white transition-colors duration-300">
                    Status
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="text-sm text-[var(--text-muted)] hover:text-white transition-colors duration-300">
                    Dashboard
                  </Link>
                </li>
              </ul>
            </div>

            {/* Resources column */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
                Resources
              </h4>
              <ul className="space-y-3">
                <li>
                  <span className="text-sm text-[var(--text-muted)] hover:text-white transition-colors duration-300 cursor-pointer">
                    Docs
                  </span>
                </li>
                <li>
                  <span className="text-sm text-[var(--text-muted)] hover:text-white transition-colors duration-300 cursor-pointer">
                    FAQ
                  </span>
                </li>
              </ul>
            </div>

            {/* Connect column */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
                Connect
              </h4>
              <ul className="space-y-3">
                <li>
                  <span className="text-sm text-[var(--text-muted)] hover:text-white transition-colors duration-300 cursor-pointer">
                    Twitter
                  </span>
                </li>
                <li>
                  <span className="text-sm text-[var(--text-muted)] hover:text-white transition-colors duration-300 cursor-pointer">
                    Discord
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-[var(--border)] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[var(--text-muted)]">
              &copy; {new Date().getFullYear()} Agentic Funding. All rights reserved.
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Built with AI &middot; Powered by Solana
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
