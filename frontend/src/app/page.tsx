import Link from "next/link";

const cards = [
  {
    title: "Evidence",
    text: "Collect website, GitHub, wallet, and market signals with provenance.",
  },
  {
    title: "Decision",
    text: "Generate a funding recommendation from deterministic scores and verification.",
  },
  {
    title: "Execution",
    text: "Turn approved packages into treasury-aware payouts and milestone escrows.",
  },
];

export default function Home() {
  return (
    <div className="page-shell">
      <div className="orb -top-16 left-0 h-[24rem] w-[24rem] bg-[var(--violet)]" />
      <div className="orb right-0 top-[22rem] h-[20rem] w-[20rem] bg-[var(--blue)]" />

      <div className="page-container">
        <section className="flex min-h-[calc(100vh-7.5rem)] items-center">
          <div className="max-w-[72rem] py-10 sm:py-14">
            <div className="flex max-w-5xl flex-col gap-12 sm:gap-14">
              <h1 className="text-5xl font-bold leading-[1.04] tracking-[-0.04em] text-white sm:text-6xl md:text-7xl">
                Autonomous infrastructure for startup funding
              </h1>
              <p className="max-w-4xl text-xl leading-[1.7] text-[var(--text-secondary)] sm:text-2xl">
                Submit proposals, analyze evidence, generate decisions, and execute
                funding through treasury-aware automation.
              </p>
              <div className="flex flex-col gap-4 pt-4 sm:flex-row">
                <Link href="/submit" className="btn-gradient px-7 py-3 text-sm">
                  Submit Proposal
                </Link>
                <Link href="/status" className="btn-secondary px-7 py-3 text-sm">
                  View Review
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-[90vh] items-center">
          <div className="max-w-3xl">
            <p className="section-label">Architecture</p>
            <h2 className="mt-5 text-4xl font-bold text-white sm:text-5xl">
              How AutoVC Works
            </h2>
            <p className="mt-5 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              Three linked layers turn a proposal into a verified funding action.
            </p>
          </div>
        </section>

        <section className="flex min-h-[100vh] items-center">
          <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3">
            {cards.map((card) => (
              <div
                key={card.title}
                className="glass-card rounded-[14px] p-6"
              >
                <div className="flex flex-col gap-3">
                  <p className="text-xl font-semibold text-white">{card.title}</p>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">
                    {card.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
