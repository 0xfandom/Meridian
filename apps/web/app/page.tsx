import Link from "next/link";
import { ArrowRight, ArrowUpRight, Coins, TrendingUp, Landmark, Check } from "lucide-react";
import { HeroCards } from "@/components/hero-cards";
import { LandingNav } from "@/components/landing-nav";
import { CursorTrail } from "@/components/app/cursor-trail";
import { LandingGsap } from "@/components/landing-gsap";

const PILLARS = [
  {
    letter: "C",
    badge: "Liquidity",
    metric: "Senior + Junior",
    name: "Pooled Credit",
    cat: "Lenders supply, protocol prices",
    accent: false,
  },
  {
    letter: "M",
    badge: "Execution",
    metric: "Cross-margin",
    name: "Margin Account",
    cat: "Borrow against blended collateral",
    accent: true,
  },
  {
    letter: "R",
    badge: "Solvency",
    metric: "Real-time VaR",
    name: "Risk Engine",
    cat: "Every position scored live",
    accent: false,
  },
  {
    letter: "S",
    badge: "Custody",
    metric: "Non-custodial",
    name: "Settlement",
    cat: "On-chain, atomic, yours",
    accent: false,
  },
];

const BLURBS = [
  {
    t: "POOLED CREDIT",
    lines: [
      "Lenders supply senior and junior tranches.",
      "Capital is priced by pool utilization.",
      "Idle liquidity routes to the best venue.",
      "Yield compounds straight into the pool.",
    ],
  },
  {
    t: "MARGIN ACCOUNT",
    lines: [
      "One cross-margin book, DeFi and CeFi.",
      "Borrow against blended collateral.",
      "Up to 5x leverage in a single signature.",
      "Positions never leave your control.",
    ],
  },
  {
    t: "RISK ENGINE",
    lines: [
      "Portfolio risk is scored in real time.",
      "VaR and liquidation paths run per position.",
      "Stress tests price every connected venue.",
      "Margin calls fire before insolvency.",
    ],
  },
  {
    t: "SETTLEMENT",
    lines: [
      "Assets stay non-custodial end to end.",
      "Settlement is on-chain and atomic.",
      "Withdrawals clear without a desk.",
      "Proof of reserves is always live.",
    ],
  },
];

type Stat = {
  n: string;
  k: string;
  s: string;
  accent?: boolean;
  to?: number;
  prefix?: string;
  suffix?: string;
};
const STATS: Stat[] = [
  {
    n: "$910M",
    k: "Pooled liquidity",
    s: "Senior & junior tranches",
    to: 910,
    prefix: "$",
    suffix: "M",
  },
  { n: "5×", k: "Max leverage", s: "From a single signature", accent: true, to: 5, suffix: "×" },
  { n: "24/7", k: "Cross-venue", s: "DeFi and CeFi, one book" },
  { n: "100%", k: "Self-custody", s: "Assets never leave you", to: 100, suffix: "%" },
];

const REASONS = [
  {
    t: "DEEP LIQUIDITY",
    lines: [
      "Pooled senior and junior credit.",
      "Priced by utilization, not desks.",
      "Capital is there when you size up.",
    ],
  },
  {
    t: "ONE MARGIN BOOK",
    lines: [
      "Blend DeFi and CeFi collateral.",
      "Borrow against the whole book.",
      "Up to 5× in a single signature.",
    ],
  },
  {
    t: "REAL-TIME RISK",
    lines: [
      "Every position scored live.",
      "VaR and liquidation paths per venue.",
      "Margin calls before insolvency.",
    ],
  },
  {
    t: "NON-CUSTODIAL",
    lines: [
      "Settlement is on-chain and atomic.",
      "Withdraw without asking a desk.",
      "Proof of reserves always live.",
    ],
  },
];

const STEPS = [
  {
    no: "01",
    t: "Connect",
    d: "Link wallets, exchanges and protocols. One read-only view of every position.",
  },
  {
    no: "02",
    t: "Collateralize",
    d: "Deposit blended collateral. The senior pool prices your credit line live.",
  },
  {
    no: "03",
    t: "Draw & trade",
    d: "Borrow up to 5×. Execute across DeFi and CeFi from a single margin book.",
  },
  {
    no: "04",
    t: "Settle",
    d: "Close out on-chain and atomic. Withdraw anytime — never custodial.",
  },
];

const FLOW = [
  { n: "01", t: "Deposit", x: 58, pop: "pop1", glow: "glow1" },
  { n: "02", t: "Borrow", x: 72, pop: "pop2", glow: "glow2" },
  { n: "03", t: "Trade", x: 86, pop: "pop3", glow: "glow3" },
];

const APPLY = [
  {
    t: "WHAT YOU GET",
    lines: [
      "Pooled credit from day one.",
      "One cross-margin book, DeFi and CeFi.",
      "Up to 5× from a single signature.",
      "Assets stay in your custody.",
    ],
  },
  {
    t: "BRING TO THE CALL",
    lines: [
      "Desk size and strategy.",
      "Venues and collateral mix.",
      "Target leverage and limits.",
      "Anything custody-sensitive.",
    ],
  },
  {
    t: "ONBOARDING",
    lines: [
      "Connect venues and wallets.",
      "We risk-review your book.",
      "Live credit limits within 48 hours.",
      "Trading enabled in days, not weeks.",
    ],
  },
  {
    t: "AFTER ACCESS",
    lines: [
      "Your credit line goes live.",
      "Cross-venue execution opens.",
      "Dedicated risk support.",
      "Settlement stays non-custodial.",
    ],
  },
];

const USERS = [
  {
    no: "01",
    t: "Lenders",
    tag: "Earn on idle capital",
    Icon: Coins,
    accent: false,
    lines: [
      "Supply idle stablecoins and majors.",
      "Earn utilization-priced yield.",
      "Senior for safety, junior for upside.",
    ],
  },
  {
    no: "02",
    t: "Trading desks",
    tag: "Borrow & lever up",
    Icon: TrendingUp,
    accent: true,
    lines: [
      "Borrow against blended collateral.",
      "Run leverage across every venue.",
      "One margin book, never custodial.",
    ],
  },
  {
    no: "03",
    t: "Funds & treasuries",
    tag: "Credit on demand",
    Icon: Landmark,
    accent: false,
    lines: [
      "Park reserves, draw credit on demand.",
      "Programmatic, audited risk limits.",
      "On-chain, settlement-ready always.",
    ],
  },
];

export default function Page() {
  return (
    <main className="min-h-screen space-y-3 bg-ink p-3 sm:space-y-4 sm:p-4">
      <CursorTrail />
      <LandingGsap />
      {/* framed off-white panel */}
      <div className="relative flex min-h-[900px] flex-col overflow-hidden rounded-[26px] bg-[#f1f1ef] lg:h-[calc(100vh-2rem)] lg:min-h-[760px]">
        {/* ---- floating premium cards around the hero ---- */}
        <HeroCards />

        {/* ---- faint Swiss dot-grid ---- */}
        <div
          className="pointer-events-none absolute inset-0 z-0 hidden lg:block"
          style={{
            backgroundImage: "radial-gradient(circle, #d8d8d3 1.2px, transparent 1.5px)",
            backgroundSize: "30px 30px",
            opacity: 0.55,
          }}
        />

        {/* ---- top-left wordmark ---- */}
        <span className="absolute left-7 top-7 z-20 font-sans text-[20px] font-bold tracking-tight text-ink lg:left-10 lg:top-9">
          Meridian<sup className="text-[11px] text-red">®</sup>
        </span>

        {/* ---- top-right: GitHub + docs ---- */}
        <div className="absolute right-7 top-7 z-30 hidden items-center gap-2.5 lg:right-10 lg:top-7 lg:flex">
          <a
            href="https://github.com/0xfandom"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink shadow-[0_6px_28px_-8px_rgba(0,0,0,0.22)] transition-colors hover:bg-ink hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.12-.31-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.18.77.84 1.24 1.91 1.24 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.29 0 .32.21.7.82.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
            </svg>
          </a>
          <Link
            href="/docs"
            className="rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-ink shadow-[0_6px_28px_-8px_rgba(0,0,0,0.22)] transition-colors hover:bg-ink hover:text-white"
          >
            Read the docs
          </Link>
        </div>

        {/* ---- morphing top nav ---- */}
        <LandingNav />

        {/* ---- CENTERED HERO ---- */}
        <div className="pointer-events-none relative z-20 flex flex-1 flex-col items-center justify-center px-6 pt-[12vh] text-center">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-hair bg-white/70 px-4 py-1.5 font-mono text-[12px] font-medium text-ink-m backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-red" />
            Non-custodial prime brokerage
          </span>
          <h1
            data-split
            className="font-sans font-extrabold tracking-tight text-ink"
            style={{ fontSize: "clamp(2.6rem, 7vw, 6.4rem)", lineHeight: 0.92 }}
          >
            Prime brokerage
            <br />
            for digital assets<span className="text-red">.</span>
          </h1>
          <p className="mt-6 max-w-[560px] text-[16px] leading-relaxed text-ink-s lg:text-[17px]">
            Pooled credit and a real-time portfolio risk engine for professional desks, from deposit
            to 5x leverage in a single signature.
          </p>
          <div className="mt-9 flex items-center justify-center">
            <Link
              href="/app"
              data-magnetic
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red"
            >
              Launch the app <ArrowUpRight size={16} strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </div>

      {/* ============ PILLARS PANEL ============ */}
      <section
        id="platform"
        data-reveal
        className="relative scroll-mt-4 overflow-hidden rounded-[26px] bg-[#f1f1ef] px-7 py-10 lg:px-10 lg:py-14"
      >
        {/* header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <span className="block font-mono text-[12px] uppercase tracking-[0.25em] text-ink-m">
              Architecture
            </span>
            <h2
              className="mt-3 font-sans font-extrabold uppercase leading-[0.9] tracking-tight text-ink"
              style={{ fontSize: "clamp(2.2rem, 5vw, 4.4rem)" }}
            >
              Built on four
              <br />
              pillars<span className="text-red">.</span>
            </h2>
          </div>
          <a
            href="#"
            className="hidden items-center gap-1.5 text-[14px] font-semibold text-ink transition-transform hover:translate-x-1 md:flex"
          >
            View docs <ArrowUpRight size={15} strokeWidth={2.5} />
          </a>
        </div>

        {/* cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <div
              key={p.letter}
              className={`relative h-[300px] overflow-hidden rounded-[14px] p-5 ${
                p.accent ? "bg-red text-ink" : "bg-ink text-white"
              }`}
            >
              <span
                className={`absolute left-3 top-4 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  p.accent ? "bg-ink text-white" : "bg-white/10 text-white"
                }`}
              >
                {p.badge}
              </span>
              <span
                className={`absolute right-4 top-5 text-[13px] font-medium ${p.accent ? "text-ink/80" : "text-white/70"}`}
              >
                {p.metric}
              </span>
              <span
                className={`pointer-events-none absolute -bottom-6 -right-4 select-none font-sans font-black leading-none ${
                  p.accent ? "text-ink/90" : "text-white/95"
                }`}
                style={{ fontSize: "15rem" }}
              >
                {p.letter}
              </span>
              <div className="absolute bottom-4 left-5 z-10">
                <span className="block font-sans text-[19px] font-bold">{p.name}</span>
                <span className={`block text-[12px] ${p.accent ? "text-ink/70" : "text-white/60"}`}>
                  {p.cat}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* blurbs */}
        <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 border-t border-hair pt-6 lg:grid-cols-4">
          {BLURBS.map((b) => (
            <div key={b.t}>
              <span className="block font-mono text-[12px] font-semibold uppercase tracking-wider text-ink">
                {b.t}
              </span>
              <div className="mt-3 space-y-1">
                {b.lines.map((l, i) => (
                  <p key={i} className="text-[13px] leading-snug text-ink-m">
                    {l}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ OVERVIEW PANEL (what / who / why) ============ */}
      <section
        id="overview"
        data-reveal
        className="relative scroll-mt-4 overflow-hidden rounded-[26px] bg-[#f1f1ef] px-7 py-10 lg:px-10 lg:py-14"
      >
        {/* eyebrow row */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[12px] uppercase tracking-[0.25em] text-ink-m">
            Overview
          </span>
          <span className="font-mono text-[12px] uppercase tracking-[0.25em] text-ink-m">
            Non-custodial · Institutional
          </span>
        </div>

        {/* headline */}
        <h2
          className="mt-6 font-sans font-extrabold leading-[0.95] tracking-tight text-ink"
          style={{ fontSize: "clamp(2.4rem, 6vw, 5.4rem)" }}
        >
          What Meridian is,
          <br />
          and who it&rsquo;s for<span className="text-red">.</span>
        </h2>

        {/* number columns */}
        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {STATS.map((st) => (
            <div key={st.k} className="border-t-2 border-ink pt-5">
              <div
                className={`font-sans font-extrabold tracking-tight ${st.accent ? "text-red" : "text-ink"}`}
                style={{ fontSize: "clamp(2.6rem, 5vw, 4.4rem)" }}
                {...(st.to != null
                  ? {
                      "data-count": String(st.to),
                      "data-prefix": st.prefix ?? "",
                      "data-suffix": st.suffix ?? "",
                    }
                  : {})}
              >
                {st.n}
              </div>
              <div className="mt-3 font-sans text-[15px] font-bold text-ink">{st.k}</div>
              <div className="mt-1 text-[13px] text-ink-m">{st.s}</div>
            </div>
          ))}
        </div>

        {/* why-use paragraph blocks */}
        <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-hair pt-7 lg:grid-cols-4">
          {REASONS.map((r) => (
            <div key={r.t}>
              <span className="block font-mono text-[12px] font-semibold uppercase tracking-wider text-ink">
                {r.t}
              </span>
              <div className="mt-3 space-y-1">
                {r.lines.map((l, i) => (
                  <p key={i} className="text-[13px] leading-snug text-ink-m">
                    {l}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* who — numbered user types in cards */}
        <div className="mt-14 border-t border-hair pt-7">
          <span className="font-mono text-[12px] uppercase tracking-[0.25em] text-ink-m">
            Who it&rsquo;s for
          </span>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {USERS.map((u) => {
              const Icon = u.Icon;
              return (
                <div
                  key={u.no}
                  className="group relative overflow-hidden rounded-[20px] border border-hair bg-white p-7 text-ink transition-all duration-300 hover:-translate-y-1 hover:border-ink hover:bg-ink hover:text-white hover:shadow-[0_30px_62px_-30px_rgba(0,0,0,0.6)]"
                >
                  {/* ghost number */}
                  <span className="pointer-events-none absolute -right-2 -top-8 select-none font-sans text-[150px] font-black leading-none text-ink/[0.08] transition-colors duration-300 group-hover:text-white/[0.12]">
                    {u.no}
                  </span>

                  {/* icon chip */}
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-[13px] bg-red/10 text-red transition-all duration-300 group-hover:scale-105 group-hover:bg-red group-hover:text-white">
                    <Icon size={22} strokeWidth={2} />
                  </div>

                  {/* title + tag */}
                  <span className="relative mt-5 block font-sans text-[21px] font-bold tracking-tight">
                    {u.t}
                  </span>
                  <span className="relative mt-1.5 block font-mono text-[11px] uppercase tracking-[0.18em] text-ink-f transition-colors duration-300 group-hover:text-white/55">
                    {u.tag}
                  </span>

                  {/* divider */}
                  <div className="relative my-5 h-px w-full bg-hair transition-colors duration-300 group-hover:bg-white/15" />

                  {/* lines */}
                  <ul className="relative space-y-2.5">
                    {u.lines.map((l, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check
                          size={15}
                          strokeWidth={2.75}
                          className="mt-[2px] shrink-0 text-red"
                        />
                        <span className="text-[13px] leading-snug text-ink-m transition-colors duration-300 group-hover:text-white/80">
                          {l}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS PANEL ============ */}
      <section
        id="process"
        data-reveal
        className="relative scroll-mt-4 overflow-hidden rounded-[26px] bg-[#f1f1ef] px-7 py-10 lg:px-10 lg:py-14"
      >
        {/* eyebrow row */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.25em] text-ink-m">
            <span className="h-1.5 w-1.5 rounded-full bg-red" /> Process
          </span>
          <span className="font-mono text-[12px] uppercase tracking-[0.25em] text-ink-m">
            Deposit → 5× → Settle
          </span>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-12">
          {/* left — giant headline */}
          <div className="lg:col-span-5">
            <h2
              className="font-sans font-extrabold leading-[0.9] tracking-tight text-ink"
              style={{ fontSize: "clamp(2.6rem, 5.5vw, 6rem)" }}
            >
              How
              <br />
              Meridian
              <br />
              works<span className="text-red">.</span>
            </h2>
          </div>

          {/* right — numbered process list */}
          <div className="border-b border-hair lg:col-span-7">
            {STEPS.map((s) => (
              <a
                key={s.no}
                href="#"
                className="group flex items-center gap-5 border-t border-hair py-6 pl-2 pr-1 transition-all duration-200 hover:bg-white hover:pl-4"
              >
                <span className="w-7 shrink-0 font-mono text-[13px] font-medium text-ink-f transition-colors group-hover:text-red">
                  {s.no}
                </span>
                <span className="w-[150px] shrink-0 font-sans text-[21px] font-bold tracking-tight text-ink">
                  {s.t}
                </span>
                <p className="hidden flex-1 text-[13px] leading-snug text-ink-m sm:block">{s.d}</p>
                <ArrowUpRight
                  size={20}
                  strokeWidth={2}
                  className="shrink-0 text-ink-f transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-red"
                />
              </a>
            ))}
          </div>
        </div>

        {/* red 0 → 5× block */}
        <div className="relative mt-12 overflow-hidden rounded-[20px] bg-red px-8 py-10 text-ink lg:px-10 lg:py-12">
          {/* faint oversized arrow watermark */}
          <span className="pointer-events-none absolute right-8 -top-3 select-none font-sans text-[170px] font-black leading-none text-ink/[0.13]">
            →
          </span>

          {/* texture — dot-grid + soft glow + faint wordmark to fill the field */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(10,10,10,0.09) 1.3px, transparent 1.5px)",
              backgroundSize: "24px 24px",
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-28 h-96 w-[40rem] rounded-full"
            style={{
              background: "radial-gradient(closest-side, rgba(255,255,255,0.12), transparent)",
            }}
          />
          <span className="pointer-events-none absolute bottom-3 left-8 select-none font-sans text-[120px] font-black leading-none tracking-tighter text-ink/[0.05]">
            meridian
          </span>

          <div className="relative">
            <div className="flex items-end gap-4">
              <span
                className="font-sans font-black leading-none tracking-tight"
                style={{ fontSize: "clamp(3rem, 8vw, 6rem)" }}
              >
                0 <span className="font-light">→</span> 5×
              </span>
              <span className="mb-2 font-mono text-[12px] uppercase tracking-[0.2em] text-ink/70">
                single signature
              </span>
            </div>

            {/* flow node track — dot travels L→R, each node hops as it arrives */}
            <div className="relative mt-12 hidden h-24 lg:block">
              <span className="absolute left-1 right-1 top-10 h-px bg-ink/25" />
              <span
                className="absolute top-10 -ml-[6px] h-3 w-3 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_18px_6px_rgba(10,10,10,0.4)]"
                style={{ animation: "trackDot 6s linear infinite" }}
              />
              {FLOW.map((f) => (
                <div
                  key={f.n}
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: `${f.x}%` }}
                >
                  <div
                    className="flex flex-col items-center"
                    style={{ animation: `${f.pop} 6s linear infinite` }}
                  >
                    <span className="font-sans text-[21px] font-extrabold uppercase leading-none tracking-tight text-ink">
                      {f.t}
                    </span>
                    <span
                      className="mt-3 h-4 w-4 rounded-full bg-ink"
                      style={{ animation: `${f.glow} 6s linear infinite` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ APPLY / CLOSING PANEL (dark) ============ */}
      <section
        id="apply"
        data-reveal
        className="relative scroll-mt-4 overflow-hidden rounded-[26px] bg-ink px-7 py-10 text-white lg:px-10 lg:py-14"
      >
        {/* giant faded wordmark */}
        <span className="pointer-events-none absolute right-0 top-1/2 z-0 hidden -translate-y-1/2 select-none font-sans text-[20rem] font-black leading-none tracking-tighter text-white/[0.035] lg:block">
          meridian
        </span>

        {/* eyebrow row */}
        <div className="relative z-10 flex items-center justify-between">
          <span className="font-mono text-[12px] uppercase tracking-[0.25em] text-white/50">
            Apply
          </span>
          <span className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.25em] text-white/50">
            <span className="h-2 w-2 rounded-full bg-red" /> Open for early access — Q3 2026
          </span>
        </div>

        <div className="relative z-10 mt-10 grid gap-12 lg:grid-cols-2">
          {/* left — headline, sub, tags, CTA */}
          <div>
            <h2
              className="font-sans font-extrabold leading-[0.9] tracking-tight"
              style={{ fontSize: "clamp(3rem, 8vw, 7rem)" }}
            >
              Ready
              <br />
              to trade<span className="text-red">?</span>
            </h2>
            <p className="mt-7 max-w-[380px] text-[14px] leading-relaxed text-white/60">
              If you run size and want one margin book across DeFi and CeFi, let&rsquo;s talk. We
              onboard desks in days, not weeks — and your assets never leave your custody.
            </p>

            <a
              href="mailto:kashyapshivank01@gmail.com"
              className="group mt-9 inline-flex items-center gap-3 rounded-full bg-red px-7 py-4 font-sans text-[15px] font-semibold text-white transition-all duration-200 hover:gap-4 hover:bg-white hover:text-ink"
            >
              Let&rsquo;s connect
              <ArrowRight
                size={18}
                strokeWidth={2.5}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </a>
          </div>

          {/* right — info blocks */}
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:pt-3">
            {APPLY.map((b) => (
              <div key={b.t}>
                <span className="block font-mono text-[12px] font-semibold uppercase tracking-wider text-white">
                  {b.t}
                </span>
                <div className="mt-3 space-y-1">
                  {b.lines.map((l, i) => (
                    <p key={i} className="text-[13px] leading-snug text-white/55">
                      {l}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* footer */}
        <div className="relative z-10 mt-16 flex flex-col gap-5 border-t border-white/12 pt-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 font-mono text-[13px] text-white/50">
            <span className="font-sans text-[16px] font-bold tracking-tight text-white">
              meridian<sup className="text-[9px] text-red">®</sup>
            </span>
            <span className="text-white/25">//</span> Prime Brokerage &amp; Credit
          </div>
          <div className="flex flex-wrap items-center gap-5 text-[13px] text-white/60">
            <a
              href="https://github.com/0xfandom"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 transition-colors hover:text-white"
            >
              GitHub <ArrowUpRight size={13} strokeWidth={2.5} />
            </a>
            <Link
              href="/docs"
              className="flex items-center gap-0.5 transition-colors hover:text-white"
            >
              Docs <ArrowUpRight size={13} strokeWidth={2.5} />
            </Link>
          </div>
        </div>

        <div className="relative z-10 mt-6 flex flex-col gap-1 text-[12px] text-white/35 sm:flex-row sm:justify-between">
          <span>© 2026 Meridian. All rights reserved.</span>
          <span>On-chain · Global · Non-custodial</span>
        </div>
      </section>
    </main>
  );
}
