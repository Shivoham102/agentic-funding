import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--card-bg)]">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">
          Agentic Funding
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-[var(--muted)] hover:text-white transition-colors"
          >
            Home
          </Link>
          <Link
            href="/submit"
            className="text-[var(--muted)] hover:text-white transition-colors"
          >
            Submit
          </Link>
          <Link
            href="/dashboard"
            className="text-[var(--muted)] hover:text-white transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </nav>
  );
}
