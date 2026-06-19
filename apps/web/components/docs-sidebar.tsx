"use client";

import { useEffect, useRef, useState } from "react";
import { Compass, Boxes, ShieldAlert, Code, Lock, BookOpen, type LucideIcon } from "lucide-react";

type Group = { group: string; Icon: LucideIcon; items: [string, string][] };

const DOC_NAV: Group[] = [
  {
    group: "Getting Started",
    Icon: Compass,
    items: [
      ["Introduction", "introduction"],
      ["Core Concepts", "core-concepts"],
      ["Quickstart", "quickstart"],
    ],
  },
  {
    group: "Protocol",
    Icon: Boxes,
    items: [
      ["Architecture", "architecture"],
      ["Pooled Credit", "pooled-credit"],
      ["Margin Accounts", "margin-accounts"],
      ["Risk Engine", "risk-engine"],
      ["Settlement & Custody", "settlement"],
    ],
  },
  {
    group: "Risk",
    Icon: ShieldAlert,
    items: [
      ["Risk Parameters", "risk-parameters"],
      ["Liquidations", "liquidations"],
      ["Oracles", "oracles"],
    ],
  },
  {
    group: "Developers",
    Icon: Code,
    items: [
      ["Smart Contracts", "contracts"],
      ["SDK", "sdk"],
      ["API Reference", "api"],
    ],
  },
  {
    group: "Security",
    Icon: Lock,
    items: [
      ["Audits", "audits"],
      ["Bug Bounty", "bug-bounty"],
    ],
  },
  {
    group: "Resources",
    Icon: BookOpen,
    items: [
      ["Fees", "fees"],
      ["Governance", "governance"],
      ["FAQ", "faq"],
      ["Glossary", "glossary"],
    ],
  },
];

const ALL_IDS = DOC_NAV.flatMap((g) => g.items.map(([, id]) => id));

export function DocsSidebar() {
  const [active, setActive] = useState<string>(ALL_IDS[0]);
  const [progress, setProgress] = useState(0);
  const [marker, setMarker] = useState({ top: 0, h: 0, show: false });
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  // scroll-spy
  useEffect(() => {
    const els = ALL_IDS.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        setActive(top.target.id);
      },
      { rootMargin: "-12% 0px -78% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // reading progress
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // slide the marker to the active item
  useEffect(() => {
    const el = itemRefs.current[active];
    if (el) setMarker({ top: el.offsetTop, h: el.offsetHeight, show: true });
  }, [active]);

  return (
    <nav className="space-y-6">
      {/* reading progress */}
      <div>
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-ink-f">
          <span>Reading</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-hair">
          <div
            className="h-full rounded-full bg-red transition-[width] duration-150 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* tracked rail + groups */}
      <div ref={listRef} className="relative pl-4">
        {/* guide rail */}
        <span className="absolute bottom-1 left-0 top-1 w-px bg-hair" />
        {/* sliding active marker */}
        <span
          className="absolute left-0 w-[2.5px] rounded-full bg-red transition-all duration-300 ease-out"
          style={{ top: marker.top, height: marker.h, opacity: marker.show ? 1 : 0 }}
        />

        {DOC_NAV.map((g) => (
          <div key={g.group} className="mb-5 last:mb-0">
            <span className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-ink">
              <g.Icon size={13} strokeWidth={2.25} className="text-ink-m" />
              {g.group}
            </span>
            <ul className="mt-2.5 space-y-0.5">
              {g.items.map(([label, id]) => {
                const on = active === id;
                return (
                  <li key={id}>
                    <a
                      ref={(el) => {
                        itemRefs.current[id] = el;
                      }}
                      href={`#${id}`}
                      onClick={() => setActive(id)}
                      className={`block rounded-md py-1 pl-3 pr-2 text-[13.5px] transition-all duration-200 ${
                        on
                          ? "font-semibold text-ink"
                          : "text-ink-m hover:translate-x-0.5 hover:text-ink"
                      }`}
                    >
                      {label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
