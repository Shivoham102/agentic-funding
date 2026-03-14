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

  const linkClass = (href: string) => {
    const isActive = pathname === href;
    return `text-sm font-medium transition-all duration-300 ${
      isActive
        ? "text-white"
        : "text-[var(--text-muted)] hover:text-white"
    }`;
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
        <div className="glass-card px-6 py-3 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-white tracking-tight">
            <span className="gradient-text">Agentic</span> Funding
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                {link.label}
              </Link>
            ))}
            <Link href="/submit" className="btn-gradient text-sm !py-2 !px-5">
              Get Funded
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-white p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="md:hidden glass-card mt-2 p-4 flex flex-col gap-3">
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
              className="btn-gradient text-sm text-center !py-2"
              onClick={() => setMobileOpen(false)}
            >
              Get Funded
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
