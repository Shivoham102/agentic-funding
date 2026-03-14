"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const linkClass = (href: string) => {
    const isActive = pathname === href;
    return `text-sm font-medium transition-colors ${
      isActive
        ? "text-[var(--accent)]"
        : "text-[var(--muted)] hover:text-[var(--accent)]"
    }`;
  };

  return (
    <nav className="border-b border-[var(--border)] bg-white">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-[var(--foreground)]">
          Agentic Funding
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/" className={linkClass("/")}>
            Home
          </Link>
          <Link href="/submit" className={linkClass("/submit")}>
            Apply
          </Link>
          <Link href="/dashboard" className={linkClass("/dashboard")}>
            Dashboard
          </Link>
        </div>
      </div>
    </nav>
  );
}
