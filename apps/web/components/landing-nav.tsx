"use client";

// Top nav with a constant iOS-style frosted-glass look — translucent, blurred,
// soft highlight border. Does not change on scroll.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const NAV = [
  { label: "Platform", href: "#platform" },
  { label: "Overview", href: "#overview" },
  { label: "How it works", href: "#process" },
  { label: "Apply", href: "#apply" },
];

export function LandingNav() {
  return (
    <nav className="fixed left-1/2 top-9 z-50 hidden -translate-x-1/2 items-center gap-1 overflow-hidden rounded-full border border-white/45 bg-white/10 py-1.5 pl-3 pr-1.5 shadow-[0_10px_44px_-10px_rgba(0,0,0,0.28),inset_0_1px_1px_rgba(255,255,255,0.85),inset_0_-6px_12px_-6px_rgba(0,0,0,0.06)] backdrop-blur-xl backdrop-saturate-200 md:flex">
      {/* glossy sheen — bright top half fading to clear */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/45 to-transparent" />
      {/* diagonal shine streak */}
      <span className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(115deg,transparent_32%,rgba(255,255,255,0.38)_46%,transparent_56%)]" />
      {/* crisp top highlight line */}
      <span className="pointer-events-none absolute inset-x-6 top-[1px] h-px bg-white/90" />
      {NAV.map((n) => (
        <a
          key={n.href}
          href={n.href}
          className="relative z-10 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-s transition-colors hover:text-ink"
        >
          {n.label}
        </a>
      ))}
      <Link
        href="/app"
        className="relative z-10 ml-1 flex items-center gap-1 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red"
      >
        Launch <ArrowUpRight size={13} strokeWidth={2.5} />
      </Link>
    </nav>
  );
}
