"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { href: "/", label: "Home" },
    { href: "/submit", label: "Apply" },
    { href: "/status", label: "Status" },
    { href: "/dashboard", label: "Dashboard" },
  ];

  const linkClass = (href: string) =>
    [
      "inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
      pathname === href
        ? "bg-white/8 text-white"
        : "text-[var(--text-muted)] hover:bg-white/4 hover:text-white",
    ].join(" ");

  return (
    <nav className="fixed inset-x-0 top-0 z-50">
      <div className="page-container-wide pt-4">
        <div className="glass-card animate-nav-in grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-5 py-4 sm:px-6">
          <Link href="/" className="min-w-0 text-xl font-semibold text-white">
            <span className="gradient-text">AutoVC</span>
          </Link>

          <div className="hidden items-center justify-center gap-4 md:flex">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden justify-self-end md:block">
            <Link href="/submit" className="btn-gradient-sm">
              New Proposal
            </Link>
          </div>

          <button
            className="justify-self-end rounded-full border border-[var(--border)] bg-white/4 p-2 text-white md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <div className="glass-card animate-fade-in mt-2 flex flex-col gap-2 p-4 md:hidden">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={linkClass(link.href)}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/submit"
              className="btn-gradient-sm mt-2 text-center"
              onClick={() => setMobileOpen(false)}
            >
              New Proposal
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
