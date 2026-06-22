"use client";

// Prime-brokerage app shell. Wallet connection is real (wagmi + injected wallet on the local anvil
// chain); a demo mode lets a wallet-less viewer explore the seeded book. Disconnected → Connect
// gate + wallet picker. Connected → top bar + Margin Account dashboard. The collateral table and
// summary cards are still mock state today (Deposit / Withdraw mutate React state); the live
// on-chain write path is wired in over the following changes.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  ShieldCheck,
  X,
  Plus,
  Minus,
  Layers,
  Globe,
  Lock,
  Activity,
  Users,
  Percent,
  Wallet,
  ChevronRight,
  CreditCard,
  PiggyBank,
  Copy,
  Check,
  Coins,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatedNumber } from "../animated-number";
import {
  OrderBookPanel,
  CandlePanel,
  HealthChip,
  PriceTicker,
  PositionsPanel,
  UtilityStrip,
  BgIcons,
} from "./gate-viz";
import { AssetLogo } from "./asset-logos";
import { useProtocolStats } from "@/lib/use-protocol-stats";
import { useAccounts } from "@/lib/use-accounts";
import type { AccountView } from "@/lib/api";
import { useWallet, shortenAddress } from "@/lib/use-wallet";
import { useWalletBalances } from "@/lib/use-balances";
import { useLenderPosition } from "@/lib/use-lender-position";
import { useFaucet } from "@/lib/use-faucet";
import { usePoolActions, type PoolActions, type TxPhase } from "@/lib/use-pool-actions";
import { BorrowLive } from "./borrow-live";

const DEMO_ADDRESS = "0x1f3b…c92a"; // shown in demo mode, where there is no connected wallet
const LOCAL_NETWORK = "Local"; // anvil chain id 31337
const LIQ_THRESHOLD = 0.85; // blended maintenance factor

type Asset = {
  sym: string;
  name: string;
  venue: string;
  defi: boolean;
  price: number;
  amount: number; // deposited as collateral
  bal: number; // in connected wallet, available to deposit
  tone: string;
};

const INITIAL_ASSETS: Asset[] = [
  {
    sym: "ETH",
    name: "Ether",
    venue: "Aave v3",
    defi: true,
    price: 3400,
    amount: 380,
    bal: 64,
    tone: "#e11d2a",
  },
  {
    sym: "WBTC",
    name: "Wrapped BTC",
    venue: "Binance",
    defi: false,
    price: 64000,
    amount: 11,
    bal: 1.4,
    tone: "#0a0a0a",
  },
  {
    sym: "USDC",
    name: "USD Coin",
    venue: "Coinbase",
    defi: false,
    price: 1,
    amount: 600000,
    bal: 250000,
    tone: "#e11d2a",
  },
  {
    sym: "stETH",
    name: "Lido Staked ETH",
    venue: "Lido",
    defi: true,
    price: 3380,
    amount: 145,
    bal: 30,
    tone: "#262626",
  },
];

const INITIAL_BORROWED = 1_720_000;
const CREDIT_MAX_LTV = 0.7; // credit line = collateral × this

type Position = {
  market: string;
  side: "Long" | "Short";
  size: number; // notional USD
  entry: number;
  mark: number;
  liq: number;
  pnl: number; // USD
};
const POSITIONS: Position[] = [
  {
    market: "ETH-PERP",
    side: "Long",
    size: 1_400_000,
    entry: 3180,
    mark: 3400,
    liq: 2410,
    pnl: 96_800,
  },
  {
    market: "BTC-PERP",
    side: "Long",
    size: 820_000,
    entry: 61_200,
    mark: 64_000,
    liq: 52_100,
    pnl: 37_500,
  },
  {
    market: "SOL-PERP",
    side: "Short",
    size: 310_000,
    entry: 182,
    mark: 171,
    liq: 214,
    pnl: 18_700,
  },
];

type Pool = {
  tier: "Senior" | "Junior";
  apy: number;
  supplied: number; // your deposit, USD
  tvl: number; // total pool size, USD
  util: number; // borrowed / tvl
  desc: string;
};
const INITIAL_POOLS: Pool[] = [
  {
    tier: "Senior",
    apy: 0.082,
    supplied: 250_000,
    tvl: 540_000_000,
    util: 0.78,
    desc: "First claim on repayments. Lower risk, steady yield.",
  },
  {
    tier: "Junior",
    apy: 0.196,
    supplied: 120_000,
    tvl: 210_000_000,
    util: 0.86,
    desc: "First-loss capital. Higher yield, absorbs defaults first.",
  },
];
const INITIAL_USDC = 600_000; // wallet stablecoin available to supply

/* ---------- formatting ---------- */
function fmtUSD(n: number) {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
function fmtTok(n: number) {
  const d = n >= 1000 ? 0 : n >= 1 ? 2 : 4;
  return n.toLocaleString("en-US", { maximumFractionDigits: d });
}

export function AppShell() {
  const {
    isConnected,
    address,
    chainId,
    wrongNetwork,
    hasInjected,
    isConnecting,
    connectInjected,
    disconnectWallet,
  } = useWallet();
  const [demo, setDemo] = useState(false);
  const [modal, setModal] = useState(false);

  // A real wallet restores itself through wagmi; we only persist the demo-mode view so a refresh
  // keeps a wallet-less viewer on the dashboard.
  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem("mrd_demo") === "1") {
      setDemo(true);
    }
  }, []);

  const connected = isConnected || demo;

  const connectWallet = () => {
    connectInjected();
    setModal(false);
  };
  const enterDemo = () => {
    setDemo(true);
    setModal(false);
    window.localStorage.setItem("mrd_demo", "1");
  };
  const disconnect = () => {
    if (isConnected) disconnectWallet();
    setDemo(false);
    window.localStorage.removeItem("mrd_demo");
  };

  return (
    <main className="relative min-h-screen bg-ink p-3 sm:p-4">
      {/* persistent light backdrop so cross-fades never flash the black page bg */}
      <div className="pointer-events-none absolute inset-3 rounded-[26px] bg-[#f1f1ef] sm:inset-4" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={connected ? "app" : "gate"}
          className="relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          {!connected ? (
            <ConnectGate onOpen={() => setModal(true)} />
          ) : (
            <Dashboard
              onDisconnect={disconnect}
              address={address}
              chainId={chainId}
              wrongNetwork={wrongNetwork}
              demo={!isConnected && demo}
            />
          )}
        </motion.div>
      </AnimatePresence>
      {modal && (
        <WalletModal
          onClose={() => setModal(false)}
          onConnect={connectWallet}
          onDemo={enterDemo}
          hasInjected={hasInjected}
          connecting={isConnecting}
        />
      )}
    </main>
  );
}

/* ---------- disconnected: connect gate ---------- */
// rotating headline verb — shows product breadth without extra copy
const GATE_VERBS = [
  "Trade on margin.",
  "Borrow against crypto.",
  "Earn senior yield.",
  "Short any market.",
];

// live-ish stat strip — base figures, jittered on an interval to feel alive
type GateStat = {
  k: string;
  label: string;
  base: number;
  prefix: string;
  suffix: string;
  dp: number;
  compact: boolean;
  icon: LucideIcon;
  tone: string;
  spark: number[];
};
const GATE_STATS: GateStat[] = [
  {
    k: "tvl",
    label: "Total value locked",
    base: 1.42e9,
    prefix: "$",
    suffix: "",
    dp: 2,
    compact: true,
    icon: Lock,
    tone: "#16a34a",
    spark: [1.3, 1.32, 1.31, 1.34, 1.36, 1.35, 1.38, 1.39, 1.4, 1.41, 1.41, 1.42],
  },
  {
    k: "oi",
    label: "Open interest",
    base: 318e6,
    prefix: "$",
    suffix: "",
    dp: 1,
    compact: true,
    icon: Activity,
    tone: "#16a34a",
    spark: [300, 305, 302, 308, 312, 310, 315, 316, 314, 318, 317, 319],
  },
  {
    k: "acct",
    label: "Margin accounts",
    base: 12_480,
    prefix: "",
    suffix: "",
    dp: 0,
    compact: false,
    icon: Users,
    tone: "#16a34a",
    spark: [12100, 12180, 12230, 12260, 12300, 12340, 12360, 12400, 12420, 12450, 12470, 12480],
  },
  {
    k: "apr",
    label: "Avg credit APR",
    base: 6.2,
    prefix: "",
    suffix: "%",
    dp: 1,
    compact: false,
    icon: Percent,
    tone: "#e11d2a",
    spark: [6.6, 6.5, 6.5, 6.4, 6.4, 6.3, 6.35, 6.3, 6.25, 6.2, 6.22, 6.2],
  },
];

// Edge panel wrapper: outer holds the slow float (translate), inner reacts to
// the cursor with a parallax translate + 3D tilt (separate elements so the two
// transforms never clash). depth/tilt vary per panel to give a parallax feel.
function FloatPanel({
  par,
  pos,
  anim,
  depth,
  tilt,
  children,
}: {
  par: { x: number; y: number };
  pos: string;
  anim: string;
  depth: number;
  tilt: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`pointer-events-none absolute z-[16] hidden lg:block ${pos}`}
      style={{ perspective: "900px", animation: anim }}
    >
      <div
        style={{
          transform: `translate3d(${par.x * depth}px, ${par.y * depth}px, 0) rotateY(${par.x * tilt}deg) rotateX(${-par.y * tilt}deg)`,
          transformStyle: "preserve-3d",
          transition: "transform 0.18s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// iOS-style frosted-glass pill — same recipe as the landing nav (translucent,
// blurred, soft highlight border + sheen). className styles the inner content.
function GlassPill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative inline-flex overflow-hidden rounded-full border border-white/45 bg-white/10 shadow-[0_10px_44px_-10px_rgba(0,0,0,0.28),inset_0_1px_1px_rgba(255,255,255,0.85),inset_0_-6px_12px_-6px_rgba(0,0,0,0.06)] backdrop-blur-xl backdrop-saturate-200">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent" />
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_32%,rgba(255,255,255,0.38)_46%,transparent_56%)]" />
      <span className="pointer-events-none absolute inset-x-4 top-[1px] h-px bg-white/80" />
      <span className={`relative z-10 inline-flex items-center ${className}`}>{children}</span>
    </div>
  );
}

// iOS Control-Center-style glass button. primary = dark frosted, ghost = light
// frosted (on white), light = translucent white (on red/dark surfaces).
function GlassButton({
  children,
  onClick,
  variant = "ghost",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "light" | "outline";
  className?: string;
}) {
  const tone =
    variant === "primary"
      ? "border-white/15 bg-ink/90 text-white hover:bg-red/90"
      : variant === "light"
        ? "border-white/45 bg-white/15 text-white hover:bg-white/25"
        : variant === "outline"
          ? "border-hair bg-white/70 text-ink hover:border-ink hover:bg-ink hover:text-white"
          : "border-hair bg-white/55 text-ink hover:bg-white/85";
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center justify-center gap-1.5 overflow-hidden rounded-full border font-semibold shadow-[0_6px_16px_-8px_rgba(10,10,10,0.35),inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-md transition-all duration-200 active:scale-[0.97] ${tone} ${className}`}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </button>
  );
}

function ConnectGate({ onOpen }: { onOpen: () => void }) {
  const spotRef = useRef<HTMLDivElement>(null);
  const [verb, setVerb] = useState(0);
  const [par, setPar] = useState({ x: 0, y: 0 }); // pointer offset, -0.5..0.5
  const [stats, setStats] = useState(() => GATE_STATS.map((s) => ({ ...s, value: s.base })));

  // Live protocol stats from the backend API. When reachable, the TVL, open-interest, and
  // margin-account cards show real numbers; offline they keep their placeholder values.
  const live = useProtocolStats();
  useEffect(() => {
    if (!live) return;
    const liveBase = (s: GateStat): number =>
      s.k === "tvl"
        ? live.tvl
        : s.k === "oi"
          ? live.openInterest
          : s.k === "acct"
            ? live.accounts
            : s.base;
    setStats(GATE_STATS.map((s) => ({ ...s, base: liveBase(s), value: liveBase(s) })));
  }, [live]);

  // cycle the headline verb
  useEffect(() => {
    const id = setInterval(() => setVerb((i) => (i + 1) % GATE_VERBS.length), 2600);
    return () => clearInterval(id);
  }, []);

  // gently jitter the stats so the strip reads as a live feed
  useEffect(() => {
    const id = setInterval(() => {
      setStats((prev) =>
        prev.map((s) => ({ ...s, value: s.base * (1 + (Math.random() - 0.5) * 0.012) })),
      );
    }, 2400);
    return () => clearInterval(id);
  }, []);

  // pointer-tracked spotlight (no re-render — write straight to style)
  const onMove = (e: React.MouseEvent) => {
    const el = spotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    el.style.background = `radial-gradient(420px circle at ${fx * 100}% ${fy * 100}%, rgba(225,29,42,0.10), transparent 68%)`;
    setPar({ x: fx - 0.5, y: fy - 0.5 });
  };

  return (
    <div
      onMouseMove={onMove}
      className="relative flex min-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-[26px] bg-[#f1f1ef] sm:min-h-[calc(100vh-2rem)]"
    >
      {/* dot grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right,#e2e2df 1px,transparent 1px),linear-gradient(to bottom,#e2e2df 1px,transparent 1px)",
          backgroundSize: "22px 22px",
          WebkitMaskImage: "radial-gradient(120% 95% at 50% 28%, #000 30%, transparent 82%)",
          maskImage: "radial-gradient(120% 95% at 50% 28%, #000 30%, transparent 82%)",
        }}
      />
      {/* pointer spotlight */}
      <div ref={spotRef} className="pointer-events-none absolute inset-0" />
      {/* scattered faint finance icons */}
      <BgIcons />
      {/* floating trading-terminal panels (flank the centred copy) */}
      <FloatPanel
        par={par}
        pos="left-[3%] top-[12%]"
        anim="gfloat1 9s ease-in-out infinite"
        depth={26}
        tilt={9}
      >
        <OrderBookPanel />
      </FloatPanel>
      <FloatPanel
        par={par}
        pos="right-[6%] top-[17%]"
        anim="gfloat2 8s ease-in-out -2s infinite"
        depth={34}
        tilt={11}
      >
        <CandlePanel />
      </FloatPanel>
      <FloatPanel
        par={par}
        pos="bottom-[20%] left-[4.5%]"
        anim="gfloat3 7.5s ease-in-out -4s infinite"
        depth={20}
        tilt={8}
      >
        <HealthChip />
      </FloatPanel>
      <FloatPanel
        par={par}
        pos="bottom-[20%] right-[5%]"
        anim="gfloat1 8.5s ease-in-out -3s infinite"
        depth={30}
        tilt={10}
      >
        <PositionsPanel />
      </FloatPanel>
      {/* light scrim — keeps centred copy legible over the panels */}
      <div
        className="pointer-events-none absolute inset-0 z-[15]"
        style={{
          background:
            "radial-gradient(620px 380px at 50% 43%, rgba(241,241,239,0.92) 0%, rgba(241,241,239,0.6) 46%, rgba(241,241,239,0) 72%)",
        }}
      />

      {/* top bar */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-6 lg:px-10 lg:pt-8">
        <Link href="/" className="font-sans text-[20px] font-bold tracking-tight text-ink">
          Meridian<sup className="text-[11px] text-red">®</sup>
        </Link>
        <GlassPill className="gap-3 px-4 py-2 font-mono text-[11px] font-medium text-ink-m">
          <UtilityStrip />
          <span className="hidden h-3 w-px bg-ink/15 md:block" />
          <span className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red" />
            </span>
            Operational
          </span>
        </GlassPill>
      </div>

      {/* hero */}
      <div className="pointer-events-none relative z-20 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6">
          <GlassPill className="gap-2 px-4 py-1.5 font-mono text-[12px] font-medium text-ink-m">
            <ShieldCheck size={13} className="text-red" />
            Non-custodial · you keep your keys
          </GlassPill>
        </div>

        <h1
          className="font-sans font-extrabold tracking-tight text-ink"
          style={{ fontSize: "clamp(2.3rem, 5.2vw, 4.2rem)", lineHeight: 1.1 }}
        >
          <span className="-mb-[0.16em] block overflow-hidden pb-[0.16em]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={verb}
                className="block text-red"
                initial={{ y: "0.45em", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-0.45em", opacity: 0 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                {GATE_VERBS[verb]}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="block">Keep your keys.</span>
        </h1>

        <p className="mt-5 max-w-[460px] text-[15px] leading-relaxed text-ink-s">
          One non-custodial Margin Account across DeFi and centralized venues. Deposit collateral,
          draw a credit line, and trade — your keys never leave your wallet.
        </p>

        <div className="pointer-events-auto mt-8 flex flex-col items-center gap-4 sm:flex-row">
          <button
            onClick={onOpen}
            className="group flex animate-[ctaBounce_3s_ease-in-out_infinite] items-center gap-2 rounded-full border border-ink/20 px-7 py-3.5 text-[15px] font-semibold text-ink transition-all duration-200 hover:border-ink hover:bg-ink hover:text-white hover:[animation-play-state:paused]"
          >
            Connect Wallet
            <ArrowUpRight
              size={16}
              strokeWidth={2.5}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </button>
          <Link
            href="/"
            className="group flex items-center gap-1.5 rounded-full border border-ink/20 px-6 py-3.5 text-[15px] font-semibold text-ink-s transition-all duration-200 hover:border-ink hover:bg-ink hover:text-white"
          >
            How it works
            <ArrowUpRight
              size={15}
              strokeWidth={2.5}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
        </div>

        <div className="pointer-events-auto mt-7 flex flex-wrap items-center justify-center gap-2.5">
          {[
            { icon: Layers, label: "Cross-margin" },
            { icon: ShieldCheck, label: "Self-custody" },
            { icon: Globe, label: "DeFi + CeFi venues" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="cursor-default transition-transform duration-200 ease-out hover:-translate-y-1 hover:scale-[1.04]"
            >
              <GlassPill className="gap-2 px-3.5 py-1.5 text-[12.5px] font-medium text-ink-s">
                <Icon size={13} className="text-red" strokeWidth={2.2} />
                {label}
              </GlassPill>
            </div>
          ))}
        </div>

        <p className="mt-6 font-mono text-[11px] text-ink-f">
          No sign-up · self-custody · mock data — no real wallet or chain
        </p>
      </div>

      {/* live stat cards */}
      <div className="relative z-20 mx-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:mx-10">
        {stats.map((s) => {
          const Icon = s.icon;
          const delta = (s.value / s.base - 1) * 100;
          const up = delta >= 0;
          return (
            <div
              key={s.k}
              className="group relative overflow-hidden rounded-2xl border border-hair bg-white/55 px-4 py-3.5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/30 hover:bg-white/80 hover:shadow-[0_18px_36px_-20px_rgba(10,10,10,0.4)]"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-f">
                  <Icon size={12} className="text-red" strokeWidth={2.2} />
                  {s.label}
                </span>
                <span
                  className="font-mono text-[10px] font-semibold tabular-nums"
                  style={{ color: up ? "#0a0a0a" : "#e11d2a" }}
                >
                  {up ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}%
                </span>
              </div>
              <AnimatedNumber
                value={s.value}
                prefix={s.prefix}
                suffix={s.suffix}
                dp={s.dp}
                compact={s.compact}
                duration={1.8}
                className="mt-2 block font-sans text-[30px] font-bold tracking-tight text-ink"
              />
            </div>
          );
        })}
      </div>

      {/* live price ticker tape */}
      <div className="relative z-20 mt-3 border-t border-hair-lt">
        <PriceTicker />
      </div>
    </div>
  );
}

/* ---------- wallet picker modal ---------- */
function WalletModal({
  onClose,
  onConnect,
  onDemo,
  hasInjected,
  connecting,
}: {
  onClose: () => void;
  onConnect: () => void;
  onDemo: () => void;
  hasInjected: boolean;
  connecting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[412px] overflow-hidden rounded-[26px] border border-hair bg-white p-6 shadow-[0_50px_100px_-25px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* red brand glow behind the icon */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-red/25 blur-3xl" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-ink-m transition-colors hover:bg-off hover:text-ink"
        >
          <X size={17} />
        </button>

        {/* header with big wallet icon */}
        <div className="relative mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-white shadow-[0_14px_30px_-8px_rgba(225,29,42,0.55)]">
            <Wallet size={30} strokeWidth={2} />
          </span>
          <h2 className="font-sans text-[20px] font-bold tracking-tight text-ink">
            Connect a wallet
          </h2>
          <p className="mt-1 max-w-[300px] text-[13px] leading-relaxed text-ink-m">
            Your wallet is your identity — connect it to open your Margin Account.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {/* real injected wallet (MetaMask / Rabby / Coinbase …) */}
          <button
            onClick={onConnect}
            disabled={!hasInjected || connecting}
            className="group flex items-center gap-3 rounded-2xl border border-hair px-4 py-3 text-left transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:hover:border-ink enabled:hover:bg-off enabled:hover:shadow-[0_14px_26px_-16px_rgba(10,10,10,0.45)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-sans text-[16px] font-bold text-white"
              style={{ background: "#e2761b" }}
            >
              <Wallet size={18} strokeWidth={2.3} />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-[14px] font-semibold text-ink">
                {connecting ? "Connecting…" : "Browser Wallet"}
              </span>
              <span className="text-[12px] text-ink-m">
                {hasInjected ? "MetaMask, Rabby, Coinbase Wallet" : "No browser wallet detected"}
              </span>
            </span>
            <ChevronRight
              size={17}
              className="text-ink-f transition-all group-enabled:group-hover:translate-x-0.5 group-enabled:group-hover:text-red"
            />
          </button>

          {/* wallet-less viewing of the seeded book */}
          <button
            onClick={onDemo}
            className="group flex items-center gap-3 rounded-2xl border border-hair px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ink hover:bg-off hover:shadow-[0_14px_26px_-16px_rgba(10,10,10,0.45)]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink font-sans text-[16px] font-bold text-white">
              <Activity size={18} strokeWidth={2.3} />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-[14px] font-semibold text-ink">Demo Mode</span>
              <span className="text-[12px] text-ink-m">Explore the seeded book — no wallet</span>
            </span>
            <ChevronRight
              size={17}
              className="text-ink-f transition-all group-hover:translate-x-0.5 group-hover:text-red"
            />
          </button>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 font-mono text-[11px] text-ink-f">
          <ShieldCheck size={12} className="text-red" />
          Local chain (anvil · 31337) · non-custodial
        </p>
      </div>
    </div>
  );
}

/* ---------- connected: dashboard ---------- */
type Action = { idx: number; mode: "deposit" | "withdraw" } | null;

// Local-only test faucet pill. Mints mock USDC + WETH to the connected wallet so the demo works in
// a browser with no external funding; hidden when the deployment has no mintable mock tokens.
function FaucetButton() {
  const faucet = useFaucet();
  if (!faucet.available) return null;
  const busy = faucet.phase === "minting";
  const label = busy ? "Minting…" : faucet.phase === "success" ? "Funded" : "Faucet";
  return (
    <button
      onClick={() => void faucet.mint()}
      disabled={busy}
      title="Mint mock USDC and WETH to your wallet (local demo)"
      className="hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-off disabled:opacity-60 sm:flex"
    >
      <Coins size={13} className="text-red" />
      {label}
    </button>
  );
}

function Dashboard({
  onDisconnect,
  address,
  chainId,
  wrongNetwork,
  demo,
}: {
  onDisconnect: () => void;
  address?: `0x${string}`;
  chainId?: number;
  wrongNetwork?: boolean;
  demo?: boolean;
}) {
  const addressLabel = demo ? DEMO_ADDRESS : (shortenAddress(address) ?? DEMO_ADDRESS);
  const networkLabel = demo ? "Demo" : wrongNetwork ? `Chain ${chainId}` : LOCAL_NETWORK;
  const [tab, setTab] = useState<"borrow" | "earn">("borrow");
  const [assets, setAssets] = useState<Asset[]>(INITIAL_ASSETS);
  const [borrowed, setBorrowed] = useState(INITIAL_BORROWED);
  const [action, setAction] = useState<Action>(null);
  const [credit, setCredit] = useState<"draw" | "repay" | null>(null);
  const [dir, setDir] = useState(1); // tab-switch slide direction
  const switchTab = (t: "borrow" | "earn") => {
    setDir(t === "earn" ? 1 : -1); // earn is to the right, borrow to the left
    setTab(t);
  };

  // time-accurate greeting + date (client-side → reflects local time, no SSR mismatch)
  const [greeting, setGreeting] = useState("Good morning");
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    const upd = () => {
      const dt = new Date();
      const h = dt.getHours();
      setGreeting(
        h < 5
          ? "Good night"
          : h < 12
            ? "Good morning"
            : h < 17
              ? "Good afternoon"
              : h < 21
                ? "Good evening"
                : "Good night",
      );
      setDateStr(
        dt.toLocaleDateString("en-US", {
          weekday: "long",
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      );
    };
    upd();
    const id = setInterval(upd, 60_000);
    return () => clearInterval(id);
  }, []);

  // everything below is DERIVED from assets + borrowed
  const d = useMemo(() => {
    const collateral = assets.reduce((s, a) => s + a.amount * a.price, 0);
    const equity = collateral - borrowed;
    const gross = collateral + borrowed;
    const leverage = equity > 0 ? gross / equity : 0;
    const health = borrowed > 0 ? (collateral * LIQ_THRESHOLD) / borrowed : Infinity;
    const creditLine = collateral * CREDIT_MAX_LTV;
    const available = Math.max(0, creditLine - borrowed);
    const utilization = creditLine > 0 ? borrowed / creditLine : 0;
    // how far collateral can fall before health hits 1.00 (liquidation)
    const drawdown = health === Infinity ? 1 : Math.max(0, 1 - 1 / health);
    const var1d = gross * 0.082; // mock 1-day 99% VaR
    return {
      collateral,
      equity,
      gross,
      leverage,
      health,
      creditLine,
      available,
      utilization,
      drawdown,
      var1d,
    };
  }, [assets, borrowed]);

  function apply(idx: number, mode: "deposit" | "withdraw", amt: number) {
    setAssets((prev) =>
      prev.map((a, i) => {
        if (i !== idx) return a;
        if (mode === "deposit") return { ...a, amount: a.amount + amt, bal: a.bal - amt };
        return { ...a, amount: a.amount - amt, bal: a.bal + amt };
      }),
    );
    setAction(null);
  }

  function applyCredit(mode: "draw" | "repay", amt: number) {
    setBorrowed((b) => (mode === "draw" ? b + amt : Math.max(0, b - amt)));
    setCredit(null);
  }

  const healthColor =
    d.health >= 1.5 ? "text-[#0f9d6e]" : d.health >= 1.15 ? "text-[#d99100]" : "text-red";

  return (
    <div className="space-y-0">
      {/* top bar */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center rounded-t-[26px] bg-[#f1f1ef] px-5 py-4 lg:px-9">
        <Link
          href="/"
          className="justify-self-start font-sans text-[18px] font-bold tracking-tight text-ink"
        >
          Meridian<sup className="text-[10px] text-red">®</sup>
        </Link>
        {/* borrow / earn — sliding segmented control (centered) */}
        <div className="relative grid w-[256px] grid-cols-2 justify-self-center rounded-full border border-hair bg-off p-1 shadow-[inset_0_1px_2px_rgba(10,10,10,0.07)]">
          <span
            className="absolute inset-y-1 left-1 w-[calc(50%-4px)] overflow-hidden rounded-full shadow-[0_8px_20px_-6px_rgba(225,29,42,0.6)] transition-transform duration-300 ease-out"
            style={{
              transform: tab === "earn" ? "translateX(100%)" : "translateX(0)",
              background: "linear-gradient(135deg,#ff5a60,#e11d2a)",
            }}
          >
            <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
          </span>
          {(
            [
              ["borrow", CreditCard],
              ["earn", PiggyBank],
            ] as const
          ).map(([t, Icon]) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`relative z-10 flex items-center justify-center gap-2 rounded-full py-2.5 text-[14px] font-semibold capitalize transition-colors ${
                tab === t ? "text-white" : "text-ink-m hover:text-ink"
              }`}
            >
              <Icon size={15} strokeWidth={2.3} /> {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          {!demo && <FaucetButton />}
          <span className="hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-ink sm:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${wrongNetwork ? "bg-[#d99100]" : "bg-red"}`}
            />
            {networkLabel}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-mono text-[13px] font-medium text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-[#19c37d]" />
            {addressLabel}
          </span>
          <GlassButton variant="primary" onClick={onDisconnect} className="px-4 py-1.5 text-[13px]">
            Disconnect
          </GlassButton>
        </div>
      </header>

      {/* dashboard body — animated directional tab switch */}
      <div className="overflow-hidden rounded-b-[26px] bg-[#f1f1ef]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ x: dir > 0 ? 24 : -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir > 0 ? -24 : 24, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === "borrow" ? (
              demo ? (
                <section className="rounded-b-[26px] bg-[#f1f1ef] px-5 pb-7 pt-3 lg:px-9 lg:pb-9 lg:pt-4">
                  <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-m">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red" />
                    </span>
                    Margin Account · {dateStr || "Live"}
                  </div>
                  <h1
                    className="mt-2 font-sans font-extrabold leading-[0.95] tracking-tight text-ink"
                    style={{ fontSize: "clamp(1.9rem, 4vw, 3rem)" }}
                  >
                    {greeting}
                    <span className="text-red">.</span>
                  </h1>
                  <p className="mt-1.5 text-[13.5px] text-ink-m">
                    Your margin account at a glance — collateral, credit and risk in one book.
                  </p>

                  {/* allocation bars + draw-credit CTA (CloudCash-style) */}
                  <div className="mt-7 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
                    <AllocationCard assets={assets} collateral={d.collateral} />
                    <div
                      className="relative flex flex-col justify-between overflow-hidden rounded-2xl p-6 text-white shadow-[0_22px_46px_-20px_rgba(225,29,42,0.5)]"
                      style={{ background: "linear-gradient(140deg,#e11d2a,#b01018)" }}
                    >
                      <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
                      <div className="pointer-events-none absolute -bottom-12 -left-6 h-36 w-36 rounded-full bg-white/10" />
                      <div className="relative">
                        <h3 className="font-sans text-[20px] font-extrabold tracking-tight">
                          Need liquidity?
                        </h3>
                        <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-white/80">
                          Draw against your blended collateral — instant, non-custodial, up to{" "}
                          {fmtPct(CREDIT_MAX_LTV)} LTV.
                        </p>
                      </div>
                      <GlassButton
                        variant="light"
                        onClick={() => setCredit("draw")}
                        className="mt-5 w-fit px-5 py-2.5 text-[14px] hover:-translate-y-0.5"
                      >
                        Draw credit <ArrowUpRight size={15} strokeWidth={2.5} />
                      </GlassButton>
                    </div>
                  </div>

                  {/* collateral (left) + credit & risk (right) */}
                  <div className="mt-8 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
                    {/* collateral table */}
                    <div className="flex flex-col overflow-hidden rounded-2xl border border-hair/70 bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
                      <div className="flex items-center justify-between px-5 py-4">
                        <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">
                          Collateral
                        </h2>
                        <span className="rounded-full bg-off px-2.5 py-1 font-mono text-[11.5px] text-ink-m">
                          {assets.length} assets · {fmtUSD(d.collateral)}
                        </span>
                      </div>

                      {/* column header — shared template w/ rows so columns align */}
                      <div className="hidden grid-cols-[minmax(0,1.9fr)_1.2fr_1.1fr_1.1fr_208px] items-center gap-3 border-y border-hair bg-off px-5 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-f md:grid">
                        <span>Asset</span>
                        <span>Venue</span>
                        <span className="text-right">Amount</span>
                        <span className="text-right">Value</span>
                        <span className="text-right">Actions</span>
                      </div>

                      {assets.map((a, i) => {
                        const value = a.amount * a.price;
                        const pct = d.collateral > 0 ? (value / d.collateral) * 100 : 0;
                        return (
                          <div
                            key={a.sym}
                            className="grid grid-cols-2 items-center gap-3 border-t border-hair-lt px-5 py-3.5 transition-colors hover:bg-off md:grid-cols-[minmax(0,1.9fr)_1.2fr_1.1fr_1.1fr_208px]"
                          >
                            {/* asset */}
                            <div className="flex items-center gap-3">
                              <AssetLogo sym={a.sym} size={36} />
                              <div className="flex flex-col">
                                <span className="text-[14px] font-semibold text-ink">{a.sym}</span>
                                <span className="text-[12px] text-ink-m">{a.name}</span>
                              </div>
                            </div>
                            {/* venue */}
                            <div className="hidden md:block">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium ${a.defi ? "bg-red-bg text-red-d" : "bg-off text-ink-m"}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${a.defi ? "bg-red" : "bg-ink-f"}`}
                                />
                                {a.defi ? "DeFi" : "CeFi"} · {a.venue}
                              </span>
                            </div>
                            {/* amount + unit price */}
                            <div className="text-right">
                              <div className="font-mono text-[14px] text-ink">
                                {fmtTok(a.amount)}
                              </div>
                              <div className="font-mono text-[11px] text-ink-f">
                                @ {fmtUSD(a.price)}
                              </div>
                            </div>
                            {/* value + allocation */}
                            <div className="text-right">
                              <div className="font-mono text-[14px] font-semibold text-ink">
                                {fmtUSD(value)}
                              </div>
                              <div className="font-mono text-[11px] text-ink-f">
                                {pct.toFixed(0)}% of book
                              </div>
                            </div>
                            {/* actions */}
                            <div className="col-span-2 mt-2 flex justify-end gap-2 md:col-span-1 md:mt-0">
                              <GlassButton
                                variant="primary"
                                onClick={() => setAction({ idx: i, mode: "deposit" })}
                                className="px-3 py-1.5 text-[12px]"
                              >
                                <Plus size={13} strokeWidth={2.5} /> Deposit
                              </GlassButton>
                              <GlassButton
                                variant="ghost"
                                onClick={() => setAction({ idx: i, mode: "withdraw" })}
                                className="px-3 py-1.5 text-[12px]"
                              >
                                <Minus size={13} strokeWidth={2.5} /> Withdraw
                              </GlassButton>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* credit + risk (right column) */}
                    <div className="flex flex-col gap-3">
                      <CreditPanel
                        d={d}
                        onDraw={() => setCredit("draw")}
                        onRepay={() => setCredit("repay")}
                      />
                      <RiskWidget d={d} />
                    </div>
                  </div>

                  {/* positions */}
                  <Positions />

                  {/* account hero — card + headline balances (CloudCash-style) */}
                  <div className="mt-3 grid gap-3 lg:grid-cols-[1.05fr_1fr]">
                    {/* account overview */}
                    <AccountPanel
                      d={d}
                      borrowed={borrowed}
                      address={address}
                      addressLabel={addressLabel}
                      networkLabel={networkLabel}
                    />
                    {/* colored balances */}
                    <div className="flex flex-col justify-center gap-5 rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
                      <div className="flex items-end justify-between">
                        <BigStat
                          label="Account value"
                          value={d.equity}
                          cls="text-[32px] text-ink"
                        />
                        <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#e7f6ee] px-2 py-0.5 text-[11px] font-semibold text-[#0f9d6e]">
                          ▲ 4.2%
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <BigStat
                          label="Available credit"
                          value={d.available}
                          cls="text-[22px] text-[#0f9d6e]"
                        />
                        <BigStat label="Borrowed" value={borrowed} cls="text-[22px] text-red" />
                      </div>
                      <div className="grid grid-cols-2 gap-4 border-t border-hair-lt pt-4">
                        <BigStat
                          label="Leverage"
                          value={d.leverage}
                          cls="text-[18px] text-ink"
                          prefix=""
                          suffix="×"
                          compact={false}
                        />
                        <BigStat
                          label="Health"
                          value={d.health === Infinity ? 99.99 : d.health}
                          cls={`text-[18px] ${healthColor}`}
                          prefix=""
                          compact={false}
                        />
                      </div>
                    </div>
                  </div>

                  {/* balances chart */}
                  <BalancesCard value={d.equity} />
                </section>
              ) : (
                <BorrowLive />
              )
            ) : (
              <EarnView />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {action && (
        <ActionModal
          asset={assets[action.idx]}
          mode={action.mode}
          onClose={() => setAction(null)}
          onConfirm={(amt) => apply(action.idx, action.mode, amt)}
        />
      )}
      {credit && (
        <CreditModal
          mode={credit}
          available={d.available}
          borrowed={borrowed}
          onClose={() => setCredit(null)}
          onConfirm={(amt) => applyCredit(credit, amt)}
        />
      )}
    </div>
  );
}

type Derived = {
  collateral: number;
  equity: number;
  gross: number;
  leverage: number;
  health: number;
  creditLine: number;
  available: number;
  utilization: number;
  drawdown: number;
  var1d: number;
};

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

/* ---------- balances bar chart (Invowise-style centerpiece) ---------- */
const BAL_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const BAL_HEIGHTS = [42, 55, 48, 60, 72, 50, 66, 78, 62, 85, 70, 96];

function BalancesCard({ value }: { value: number }) {
  const [range, setRange] = useState<"1M" | "3M" | "1Y">("1Y");
  const max = Math.max(...BAL_HEIGHTS);
  const peak = BAL_HEIGHTS.length - 1;

  return (
    <div className="mt-8 rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-m">
          <span className="h-1.5 w-1.5 rounded-full bg-red" /> Account balance
        </div>
        <ArrowUpRight size={18} className="text-ink-f transition-colors hover:text-ink" />
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <AnimatedNumber
            value={value}
            prefix="$"
            dp={2}
            compact
            duration={1}
            className="font-sans text-[34px] font-extrabold leading-none tracking-tight text-ink"
          />
          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#e7f6ee] px-2 py-0.5 text-[11px] font-semibold text-[#0f9d6e]">
            ▲ 3.4% <span className="text-[#0f9d6e]/70">vs last mo</span>
          </span>
        </div>
        {/* range toggle */}
        <div className="flex w-fit items-center gap-1 rounded-full bg-off p-1">
          {(["1M", "3M", "1Y"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${range === r ? "bg-ink text-white" : "text-ink-m hover:text-ink"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* bars */}
      <div className="mt-6 flex h-[180px] items-end gap-2">
        {BAL_HEIGHTS.map((h, i) => {
          const active = i === peak;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <div className="relative flex w-full flex-1 items-end">
                {active && (
                  <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(10,10,10,0.5)]">
                    {fmtUSD(value)}
                    <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-ink" />
                  </div>
                )}
                <div
                  className="w-full rounded-t-md transition-all duration-300"
                  style={{
                    height: `${(h / max) * 100}%`,
                    background: active
                      ? "#e11d2a"
                      : "repeating-linear-gradient(45deg,#ececea,#ececea 5px,#f7f7f5 5px,#f7f7f5 10px)",
                  }}
                />
              </div>
              <span className="font-mono text-[10px] text-ink-f">{BAL_MONTHS[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- CloudCash-style account hero pieces ---------- */
function BigStat({
  label,
  value,
  cls,
  prefix = "$",
  suffix = "",
  compact = true,
  dp = 2,
}: {
  label: string;
  value: number;
  cls: string;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
  dp?: number;
}) {
  return (
    <div>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-m">{label}</div>
      <AnimatedNumber
        value={value}
        prefix={prefix}
        suffix={suffix}
        compact={compact}
        dp={dp}
        duration={1}
        className={`mt-1 block font-sans font-extrabold tracking-tight ${cls}`}
      />
    </div>
  );
}

function AccountPanel({
  d,
  borrowed,
  address,
  addressLabel,
  networkLabel,
}: {
  d: Derived;
  borrowed: number;
  address?: `0x${string}`;
  addressLabel: string;
  networkLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(address ?? DEMO_ADDRESS).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  // Real on-chain balances of the connected wallet; null in demo mode or while loading.
  const balances = useWalletBalances();
  const metrics = [
    { k: "Net APR", v: "6.2%" },
    { k: "Credit line", v: fmtUSD(d.creditLine) },
    { k: "Max LTV", v: fmtPct(CREDIT_MAX_LTV) },
  ];

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">Account</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-off px-2.5 py-1 font-mono text-[11px] text-ink-m">
          <span className="h-1.5 w-1.5 rounded-full bg-[#627eea]" />
          {networkLabel}
        </span>
      </div>

      {/* identity */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-[0_10px_22px_-8px_rgba(225,29,42,0.5)]"
          style={{ background: "linear-gradient(135deg,#ff5a60,#e11d2a 55%,#0a0a0a)" }}
        >
          <Wallet size={20} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[15px] font-semibold text-ink">{addressLabel}</span>
            <button
              onClick={copy}
              aria-label="Copy address"
              className="text-ink-f transition-colors hover:text-ink"
            >
              {copied ? (
                <Check size={14} strokeWidth={2.5} className="text-[#0f9d6e]" />
              ) : (
                <Copy size={14} strokeWidth={2.2} />
              )}
            </button>
          </div>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-f">
            Margin Account · Non-custodial
          </span>
        </div>
      </div>

      {/* real wallet balances — only when a live wallet is connected */}
      {balances && (
        <div className="flex items-center justify-between rounded-xl border border-hair/70 bg-off/50 px-4 py-2.5">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
            Wallet balance
          </span>
          <span className="font-mono text-[12.5px] font-semibold text-ink">
            {balances.usdc.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC ·{" "}
            {balances.weth.toLocaleString("en-US", { maximumFractionDigits: 4 })} WETH
          </span>
        </div>
      )}

      {/* key metrics */}
      <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-hair/70 bg-off/50">
        {metrics.map((m, i) => (
          <div key={m.k} className={`px-4 py-3 ${i > 0 ? "border-l border-hair/70" : ""}`}>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
              {m.k}
            </div>
            <div className="mt-1 font-sans text-[16px] font-bold tracking-tight text-ink">
              {m.v}
            </div>
          </div>
        ))}
      </div>

      {/* credit used */}
      <div className="mt-auto">
        <div className="mb-1.5 flex justify-between font-mono text-[11px] text-ink-m">
          <span>Credit used</span>
          <span className="tabular-nums">
            {fmtUSD(borrowed)} / {fmtUSD(d.creditLine)}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-off">
          <div
            className="h-full rounded-full bg-ink transition-all duration-500"
            style={{ width: `${Math.min(100, d.utilization * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function AllocationCard({ assets, collateral }: { assets: Asset[]; collateral: number }) {
  return (
    <div className="rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">
          Collateral allocation
        </h2>
        <span className="font-mono text-[12px] text-ink-m">{fmtUSD(collateral)}</span>
      </div>
      <div className="mt-5 flex flex-col gap-4">
        {assets.map((a) => {
          const v = a.amount * a.price;
          const pct = collateral > 0 ? (v / collateral) * 100 : 0;
          return (
            <div key={a.sym}>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AssetLogo sym={a.sym} size={22} />
                  <span className="text-[13px] font-semibold text-ink">{a.sym}</span>
                  <span className="hidden text-[12px] text-ink-m sm:inline">{a.name}</span>
                </div>
                <span className="font-mono text-[13px] font-semibold text-ink">
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-off">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: a.tone }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- credit panel ---------- */
function CreditPanel({
  d,
  onDraw,
  onRepay,
}: {
  d: Derived;
  onDraw: () => void;
  onRepay: () => void;
}) {
  const util = Math.min(1, d.utilization);
  const utilColor = util >= 0.85 ? "bg-red" : util >= 0.65 ? "bg-[#d99100]" : "bg-ink";
  return (
    <div className="rounded-2xl border border-hair/70 bg-white p-5 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
      <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">Credit line</h2>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-m">
            Available to draw
          </div>
          <div className="mt-1 font-sans text-[26px] font-extrabold tracking-tight text-ink">
            {fmtUSD(d.available)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-m">Line</div>
          <div className="mt-1 font-mono text-[14px] font-semibold text-ink">
            {fmtUSD(d.creditLine)}
          </div>
        </div>
      </div>
      {/* utilization bar */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-off">
        <div
          className={`h-full rounded-full ${utilColor} transition-all duration-300`}
          style={{ width: `${util * 100}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-m">
        <span>Utilization {fmtPct(d.utilization)}</span>
        <span>Max LTV {fmtPct(CREDIT_MAX_LTV)}</span>
      </div>
      <div className="mt-4 flex gap-2">
        <GlassButton variant="outline" onClick={onDraw} className="flex-1 py-2.5 text-[13px]">
          Draw
        </GlassButton>
        <GlassButton variant="outline" onClick={onRepay} className="flex-1 py-2.5 text-[13px]">
          Repay
        </GlassButton>
      </div>
    </div>
  );
}

/* ---------- risk widget ---------- */
function RiskWidget({ d }: { d: Derived }) {
  const h = d.health;
  const healthColor = h >= 1.5 ? "text-[#0f9d6e]" : h >= 1.15 ? "text-[#d99100]" : "text-red";
  const barColor = h >= 1.5 ? "bg-[#0f9d6e]" : h >= 1.15 ? "bg-[#d99100]" : "bg-red";
  // map health 1.0..2.5 → 0..100% on the gauge; liq line sits at 1.0
  const pos = Math.max(0, Math.min(1, (h - 1) / 1.5));
  return (
    <div className="rounded-2xl border border-hair/70 bg-white p-5 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">Risk</h2>
        <span className={`font-sans text-[22px] font-extrabold tracking-tight ${healthColor}`}>
          {h === Infinity ? "∞" : h.toFixed(2)}
        </span>
      </div>
      {/* health gauge */}
      <div className="relative mt-4 h-2.5 w-full rounded-full bg-gradient-to-r from-red via-[#d99100] to-[#0f9d6e]">
        <div
          className="absolute -top-1 h-[18px] w-1 -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-m">
        <span>Liq 1.00</span>
        <span>Safe 2.50+</span>
      </div>
      <div className="mt-5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[12px] text-ink-m">Liquidation if collateral falls</span>
          <span
            className={`font-mono text-[13px] font-semibold ${barColor.replace("bg-", "text-")}`}
          >
            −{fmtPct(d.drawdown)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[12px] text-ink-m">1-day VaR (99%)</span>
          <span className="font-mono text-[13px] font-semibold text-ink">{fmtUSD(d.var1d)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[12px] text-ink-m">Gross exposure</span>
          <span className="font-mono text-[13px] font-semibold text-ink">{fmtUSD(d.gross)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- positions table ---------- */
function Positions() {
  // When the backend is reachable, show the real credit-account book (with live health); offline,
  // fall back to the placeholder perp positions so the design still renders.
  const live = useAccounts();
  if (live) return <AccountsTable accounts={live} />;

  const total = POSITIONS.reduce((s, p) => s + p.pnl, 0);
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-hair/70 bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
      <div className="flex items-center justify-between border-b border-hair px-5 py-4">
        <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">Positions</h2>
        <span className="font-mono text-[12px] text-ink-m">
          {POSITIONS.length} open · uPnL{" "}
          <span className="font-semibold text-[#0f9d6e]">+{fmtUSD(total)}</span>
        </span>
      </div>
      <div className="hidden grid-cols-[1.3fr_0.8fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-f md:grid">
        <span>Market</span>
        <span>Side</span>
        <span className="text-right">Size</span>
        <span className="text-right">Entry / Mark</span>
        <span className="text-right">Liq. price</span>
        <span className="text-right">uPnL</span>
      </div>
      {POSITIONS.map((p) => (
        <div
          key={p.market}
          className="grid grid-cols-2 items-center gap-3 border-t border-hair-lt px-5 py-4 md:grid-cols-[1.3fr_0.8fr_1fr_1fr_1fr_1fr]"
        >
          <div className="font-sans text-[14px] font-semibold text-ink">{p.market}</div>
          <div>
            <span
              className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${p.side === "Long" ? "bg-[#e7f6ef] text-[#0f9d6e]" : "bg-red-bg text-red-d"}`}
            >
              {p.side}
            </span>
          </div>
          <div className="text-right font-mono text-[14px] text-ink">{fmtUSD(p.size)}</div>
          <div className="text-right font-mono text-[13px] text-ink-s">
            {p.entry.toLocaleString()} <span className="text-ink-f">/</span>{" "}
            {p.mark.toLocaleString()}
          </div>
          <div className="text-right font-mono text-[13px] text-ink">{p.liq.toLocaleString()}</div>
          <div className="text-right font-mono text-[14px] font-semibold text-[#0f9d6e]">
            +{fmtUSD(p.pnl)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- live credit-account book ---------- */
function AccountsTable({ accounts }: { accounts: AccountView[] }) {
  const open = accounts.filter((a) => a.open && !a.liquidated).length;
  const fmtHealth = (wad?: string) => (wad ? (Number(wad) / 1e18).toFixed(2) : "—");
  const healthTone = (wad?: string) => {
    if (!wad) return "text-ink-f";
    const hf = Number(wad) / 1e18;
    if (hf < 1) return "text-red-d";
    if (hf < 1.2) return "text-[#b45309]";
    return "text-[#0f9d6e]";
  };
  const statusLabel = (a: AccountView) =>
    a.liquidated ? "Liquidated" : a.open ? "Open" : "Closed";
  const statusClass = (a: AccountView) =>
    a.liquidated
      ? "bg-red-bg text-red-d"
      : a.open
        ? "bg-[#e7f6ef] text-[#0f9d6e]"
        : "bg-hair text-ink-m";

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-hair/70 bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
      <div className="flex items-center justify-between border-b border-hair px-5 py-4">
        <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">Credit accounts</h2>
        <span className="font-mono text-[12px] text-ink-m">
          {accounts.length} total · {open} open
        </span>
      </div>
      <div className="hidden grid-cols-[1.4fr_1fr_1fr_0.8fr_0.9fr] gap-3 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-f md:grid">
        <span>Account</span>
        <span className="text-right">Collateral</span>
        <span className="text-right">Debt</span>
        <span className="text-right">Health</span>
        <span className="text-right">Status</span>
      </div>
      {accounts.length === 0 && (
        <div className="px-5 py-6 text-center font-mono text-[12px] text-ink-m">
          No credit accounts yet.
        </div>
      )}
      {accounts.map((a) => (
        <div
          key={a.account}
          className="grid grid-cols-2 items-center gap-3 border-t border-hair-lt px-5 py-4 md:grid-cols-[1.4fr_1fr_1fr_0.8fr_0.9fr]"
        >
          <div className="font-mono text-[13px] font-semibold text-ink">
            {a.account.slice(0, 6)}…{a.account.slice(-4)}
          </div>
          <div className="text-right font-mono text-[13px] text-ink">
            {(Number(a.collateralDeposited) / 1e18).toFixed(2)} WETH
          </div>
          <div className="text-right font-mono text-[13px] text-ink">
            {fmtUSD(Number(a.facePrincipal) / 1e6)}
          </div>
          <div
            className={`text-right font-mono text-[14px] font-semibold ${healthTone(a.healthFactorWad)}`}
          >
            {fmtHealth(a.healthFactorWad)}
          </div>
          <div className="text-right">
            <span
              className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${statusClass(a)}`}
            >
              {statusLabel(a)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- credit draw / repay modal ---------- */
function CreditModal({
  mode,
  available,
  borrowed,
  onClose,
  onConfirm,
}: {
  mode: "draw" | "repay";
  available: number;
  borrowed: number;
  onClose: () => void;
  onConfirm: (amt: number) => void;
}) {
  const max = mode === "draw" ? available : borrowed;
  const [raw, setRaw] = useState("");
  const amt = parseFloat(raw) || 0;
  const valid = amt > 0 && amt <= max;
  const title = mode === "draw" ? "Draw credit" : "Repay credit";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-[22px] bg-white p-6 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-sans text-[18px] font-bold tracking-tight text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-m transition-colors hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <div className="rounded-2xl border border-hair bg-off p-4">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-ink-m">
            <span>Amount (USD)</span>
            <span>
              {mode === "draw" ? "Available" : "Outstanding"}: {fmtUSD(max)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-sans text-[28px] font-extrabold text-ink-f">$</span>
            <input
              autoFocus
              inputMode="decimal"
              value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              className="w-full bg-transparent font-sans text-[28px] font-extrabold tracking-tight text-ink outline-none placeholder:text-ink-f"
            />
            <button
              onClick={() => setRaw(String(Math.floor(max)))}
              className="rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-red"
            >
              Max
            </button>
          </div>
        </div>
        {amt > max && (
          <p className="mt-3 font-mono text-[12px] text-red">
            Exceeds {mode === "draw" ? "available credit" : "outstanding debt"}.
          </p>
        )}
        <button
          disabled={!valid}
          onClick={() => onConfirm(amt)}
          className="mt-5 w-full rounded-full bg-ink py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red disabled:cursor-not-allowed disabled:bg-hair disabled:text-ink-f"
        >
          {title} {valid ? fmtUSD(amt) : ""}
        </button>
        <p className="mt-3 text-center font-mono text-[11px] text-ink-f">
          Mock action · updates local state only
        </p>
      </div>
    </div>
  );
}

/* ---------- earn / lender view ---------- */
type EarnAction = { idx: number; mode: "supply" | "withdraw" } | null;

function EarnView() {
  const [pools, setPools] = useState<Pool[]>(INITIAL_POOLS);
  const [usdc, setUsdc] = useState(INITIAL_USDC);
  const [act, setAct] = useState<EarnAction>(null);

  // The live USDC pool maps to the Senior tranche (first claim on repayments). When the backend is
  // reachable, show its real size and utilization; APY and the Junior tranche stay placeholders.
  const live = useProtocolStats();
  useEffect(() => {
    if (!live) return;
    setPools((prev) =>
      prev.map((p) => (p.tier === "Senior" ? { ...p, tvl: live.tvl, util: live.utilization } : p)),
    );
  }, [live]);

  // With a real wallet connected, the Senior tranche is the live pool: the wallet's USDC is the
  // supply cap and its pool shares are the supplied amount. The Junior tranche has no on-chain
  // counterpart, so it stays mock (and the action modal discloses that).
  const { isConnected } = useWallet();
  const balances = useWalletBalances();
  const position = useLenderPosition();
  const actions = usePoolActions();
  useEffect(() => {
    if (!isConnected || !position) return;
    setPools((prev) =>
      prev.map((p) => (p.tier === "Senior" ? { ...p, supplied: position.supplied } : p)),
    );
  }, [isConnected, position]);

  const openAct = (a: EarnAction) => {
    actions.reset();
    setAct(a);
  };

  const e = useMemo(() => {
    const supplied = pools.reduce((s, p) => s + p.supplied, 0);
    const blendedApy =
      supplied > 0 ? pools.reduce((s, p) => s + p.supplied * p.apy, 0) / supplied : 0;
    const annualYield = supplied * blendedApy;
    return { supplied, blendedApy, annualYield };
  }, [pools]);

  function applyEarn(idx: number, mode: "supply" | "withdraw", amt: number) {
    setPools((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p;
        if (mode === "supply") return { ...p, supplied: p.supplied + amt, tvl: p.tvl + amt };
        return { ...p, supplied: p.supplied - amt, tvl: p.tvl - amt };
      }),
    );
    setUsdc((b) => (mode === "supply" ? b - amt : b + amt));
    setAct(null);
  }

  const topApy = Math.max(...pools.map((p) => p.apy));
  const bestIdx = pools.reduce((bi, p, i, arr) => (p.apy > arr[bi].apy ? i : bi), 0);

  return (
    <section className="rounded-b-[26px] bg-[#f1f1ef] px-5 pb-7 pt-3 lg:px-9 lg:pb-9 lg:pt-4">
      {/* header */}
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-m">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red" />
        </span>
        Earn · Credit pools
      </div>
      <h1
        className="mt-2 font-sans font-extrabold leading-[0.95] tracking-tight text-ink"
        style={{ fontSize: "clamp(1.9rem, 4vw, 3rem)" }}
      >
        Grow your capital<span className="text-red">.</span>
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-m">
        Supply USDC to the senior or junior tranche — yield priced by utilization, custody stays in
        your wallet.
      </p>

      {/* row 1: supply allocation + CTA */}
      <div className="mt-7 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">
              Supply allocation
            </h2>
            <span className="font-mono text-[12px] text-ink-m">{fmtUSD(e.supplied)}</span>
          </div>
          <div className="mt-5 flex flex-col gap-4">
            {pools.map((p) => {
              const tone = p.tier === "Senior" ? "#0a0a0a" : "#e11d2a";
              const pct = e.supplied > 0 ? (p.supplied / e.supplied) * 100 : 0;
              return (
                <div key={p.tier}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
                      <span className="text-[13px] font-semibold text-ink">{p.tier} tranche</span>
                      <span className="font-mono text-[11px] text-[#0f9d6e]">
                        {fmtPct(p.apy)} APY
                      </span>
                    </div>
                    <span className="font-mono text-[13px] font-semibold text-ink">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-off">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: tone }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* CTA */}
        <div
          className="relative flex flex-col justify-between overflow-hidden rounded-2xl p-6 text-white shadow-[0_22px_46px_-20px_rgba(225,29,42,0.5)]"
          style={{ background: "linear-gradient(140deg,#e11d2a,#b01018)" }}
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-12 -left-6 h-36 w-36 rounded-full bg-white/10" />
          <div className="relative">
            <h3 className="font-sans text-[20px] font-extrabold tracking-tight">
              Put capital to work
            </h3>
            <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-white/80">
              Earn up to {fmtPct(topApy)} APY supplying USDC. Withdraw anytime — fully
              non-custodial.
            </p>
          </div>
          <GlassButton
            variant="light"
            onClick={() => openAct({ idx: bestIdx, mode: "supply" })}
            className="mt-5 w-fit px-5 py-2.5 text-[14px] hover:-translate-y-0.5"
          >
            Supply USDC <ArrowUpRight size={15} strokeWidth={2.5} />
          </GlassButton>
        </div>
      </div>

      {/* row 2: pools + earnings */}
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-3">
          {pools.map((p, i) => {
            const tone = p.tier === "Senior" ? "#0a0a0a" : "#e11d2a";
            return (
              <div
                key={p.tier}
                className="rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold"
                      style={{ background: tone + "1f", color: tone }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
                      {p.tier} tranche
                    </span>
                    <p className="mt-3 max-w-[320px] text-[13px] leading-snug text-ink-s">
                      {p.desc}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-sans text-[32px] font-extrabold leading-none tracking-tight text-[#0f9d6e]">
                      {fmtPct(p.apy)}
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-m">
                      APY
                    </div>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-hair-lt pt-4">
                  <Metric k="Your supply" v={fmtUSD(p.supplied)} />
                  <Metric k="Pool size" v={fmtUSD(p.tvl)} />
                  <Metric k="Utilization" v={fmtPct(p.util)} />
                </div>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-off">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${p.util * 100}%`, background: tone }}
                  />
                </div>
                <div className="mt-5 flex gap-2">
                  <GlassButton
                    variant="outline"
                    onClick={() => openAct({ idx: i, mode: "supply" })}
                    className="flex-1 py-2.5 text-[13px]"
                  >
                    Supply
                  </GlassButton>
                  <GlassButton
                    variant="outline"
                    onClick={() => openAct({ idx: i, mode: "withdraw" })}
                    className="flex-1 py-2.5 text-[13px]"
                  >
                    Withdraw
                  </GlassButton>
                </div>
              </div>
            );
          })}
        </div>
        {/* earnings panel */}
        <div className="flex flex-col gap-5 self-start rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">Earnings</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f6ee] px-2.5 py-1 text-[11px] font-semibold text-[#0f9d6e]">
              {fmtPct(e.blendedApy)} APY
            </span>
          </div>

          <BigStat label="Total supplied" value={e.supplied} cls="text-[32px] text-ink" />

          <div className="grid grid-cols-2 gap-4">
            <BigStat
              label="Est. annual yield"
              value={e.annualYield}
              cls="text-[22px] text-[#0f9d6e]"
            />
            <BigStat label="Wallet USDC" value={usdc} cls="text-[22px] text-ink" />
          </div>

          {/* per-tranche breakdown */}
          <div className="flex flex-col gap-2.5 border-t border-hair-lt pt-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-f">
              Your tranches
            </div>
            {pools.map((p) => {
              const tone = p.tier === "Senior" ? "#0a0a0a" : "#e11d2a";
              return (
                <div key={p.tier} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
                    {p.tier}
                    <span className="font-mono text-[11px] text-[#0f9d6e]">{fmtPct(p.apy)}</span>
                  </span>
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-ink">
                    {fmtUSD(p.supplied)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* projected */}
          <div className="flex items-center justify-between rounded-xl bg-off px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-m">
              Projected 12-mo yield
            </span>
            <span className="font-sans text-[16px] font-bold tracking-tight text-[#0f9d6e]">
              +{fmtUSD(e.annualYield)}
            </span>
          </div>
        </div>
      </div>

      {/* how supplying works */}
      <div className="mt-3 rounded-2xl bg-white p-6 lg:p-7">
        <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">
          How supplying works
        </h2>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "Supply",
              d: "Deposit USDC into the senior or junior tranche. Pick safety or upside.",
            },
            {
              n: "02",
              t: "Earn",
              d: "Yield is priced by pool utilization and accrues continuously, on-chain.",
            },
            {
              n: "03",
              t: "Withdraw",
              d: "Pull liquidity whenever you want. Custody never leaves your wallet.",
            },
          ].map((s) => (
            <div key={s.n} className="border-t-2 border-ink pt-3">
              <div className="font-mono text-[12px] font-medium text-red">{s.n}</div>
              <div className="mt-1 font-sans text-[16px] font-bold tracking-tight text-ink">
                {s.t}
              </div>
              <p className="mt-1.5 text-[13px] leading-snug text-ink-s">{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* branded protocol banner */}
      <div className="relative mt-3 overflow-hidden rounded-2xl bg-ink px-6 py-8 text-white lg:px-9 lg:py-9">
        <span className="pointer-events-none absolute -bottom-10 right-0 select-none font-sans text-[12rem] font-black leading-none tracking-tighter text-white/[0.04] lg:text-[15rem]">
          Meridian
        </span>
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[420px]">
            <span className="font-sans text-[22px] font-bold tracking-tight">
              Meridian<sup className="text-[11px] text-red">®</sup>
            </span>
            <p className="mt-3 text-[14px] leading-relaxed text-white/70">
              Non-custodial credit pools for professional desks. Reserves are on-chain and provable
              — your capital is never rehypothecated.
            </p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 font-mono text-[12px] font-medium text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-[#19c37d]" />
              Proof of reserves · live
            </span>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {[
              { k: "Protocol TVL", v: "$750M" },
              { k: "Insurance fund", v: "$24M" },
              { k: "Avg uptime", v: "99.99%" },
            ].map((s) => (
              <div key={s.k}>
                <div className="font-sans text-[24px] font-extrabold tracking-tight lg:text-[28px]">
                  {s.v}
                </div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
                  {s.k}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {act &&
        (() => {
          const p = pools[act.idx];
          const liveTranche = p.tier === "Senior" && isConnected;
          const maxOverride = liveTranche
            ? act.mode === "supply"
              ? (balances?.usdc ?? 0)
              : (position?.maxWithdraw ?? 0)
            : undefined;
          return (
            <EarnModal
              pool={p}
              mode={act.mode}
              usdc={usdc}
              onClose={() => setAct(null)}
              onConfirm={(amt) => applyEarn(act.idx, act.mode, amt)}
              live={liveTranche}
              actions={liveTranche ? actions : undefined}
              maxOverride={maxOverride}
            />
          );
        })()}
    </section>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-m">{k}</div>
      <div className="mt-1 font-mono text-[14px] font-semibold text-ink">{v}</div>
    </div>
  );
}

function earnPhaseLabel(phase: TxPhase): string {
  switch (phase) {
    case "approving":
      return "Approving USDC…";
    case "depositing":
      return "Confirming supply…";
    case "withdrawing":
      return "Confirming withdrawal…";
    default:
      return "";
  }
}

function EarnModal({
  pool,
  mode,
  usdc,
  onClose,
  onConfirm,
  live = false,
  actions,
  maxOverride,
}: {
  pool: Pool;
  mode: "supply" | "withdraw";
  usdc: number;
  onClose: () => void;
  onConfirm: (amt: number) => void;
  live?: boolean;
  actions?: PoolActions;
  maxOverride?: number;
}) {
  const max = maxOverride ?? (mode === "supply" ? usdc : pool.supplied);
  const [raw, setRaw] = useState("");
  const amt = parseFloat(raw) || 0;
  const valid = amt > 0 && amt <= max;
  const title = mode === "supply" ? "Supply" : "Withdraw";

  const phase = actions?.phase ?? "idle";
  const busy = phase === "approving" || phase === "depositing" || phase === "withdrawing";

  // Once the on-chain action confirms, let the success state show briefly, then close. The pool
  // position and stats refetch on their own poll.
  useEffect(() => {
    if (!live || phase !== "success") return;
    const t = setTimeout(onClose, 900);
    return () => clearTimeout(t);
  }, [live, phase, onClose]);

  const run = () => {
    if (live && actions) {
      if (mode === "supply") void actions.deposit(amt);
      else void actions.withdraw(amt);
    } else {
      onConfirm(amt);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-[22px] bg-white p-6 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)]"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-sans text-[18px] font-bold tracking-tight text-ink">
            {title} · {pool.tier}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-m transition-colors hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <div className="rounded-2xl border border-hair bg-off p-4">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-ink-m">
            <span>Amount (USDC)</span>
            <span>
              {mode === "supply" ? "Wallet" : "Supplied"}: {fmtUSD(max)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-sans text-[28px] font-extrabold text-ink-f">$</span>
            <input
              autoFocus
              inputMode="decimal"
              value={raw}
              onChange={(ev) => setRaw(ev.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              disabled={busy}
              className="w-full bg-transparent font-sans text-[28px] font-extrabold tracking-tight text-ink outline-none placeholder:text-ink-f"
            />
            <button
              onClick={() => setRaw(String(Math.floor(max)))}
              className="rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-red"
            >
              Max
            </button>
          </div>
          <div className="mt-1 font-mono text-[12px] text-ink-m">Earns {fmtPct(pool.apy)} APY</div>
        </div>
        {amt > max && (
          <p className="mt-3 font-mono text-[12px] text-red">
            Exceeds {mode === "supply" ? "wallet balance" : "supplied amount"}.
          </p>
        )}
        <button
          disabled={!valid || busy}
          onClick={run}
          className="mt-5 w-full rounded-full bg-ink py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red disabled:cursor-not-allowed disabled:bg-hair disabled:text-ink-f"
        >
          {busy ? earnPhaseLabel(phase) : `${title} ${valid ? fmtUSD(amt) : ""}`}
        </button>
        {live ? (
          phase === "error" ? (
            <p className="mt-3 text-center font-mono text-[11px] text-red">
              {actions?.error ?? "Transaction failed"}
            </p>
          ) : phase === "success" ? (
            <p className="mt-3 text-center font-mono text-[11px] text-[#0f9d6e]">
              Confirmed on-chain
            </p>
          ) : (
            <p className="mt-3 text-center font-mono text-[11px] text-ink-f">
              Live transaction · confirm in your wallet
            </p>
          )
        ) : (
          <p className="mt-3 text-center font-mono text-[11px] text-ink-f">
            Mock action · updates local state only
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- deposit / withdraw modal ---------- */
function ActionModal({
  asset,
  mode,
  onClose,
  onConfirm,
}: {
  asset: Asset;
  mode: "deposit" | "withdraw";
  onClose: () => void;
  onConfirm: (amt: number) => void;
}) {
  const max = mode === "deposit" ? asset.bal : asset.amount;
  const [raw, setRaw] = useState("");
  const amt = parseFloat(raw) || 0;
  const valid = amt > 0 && amt <= max;
  const title = mode === "deposit" ? "Deposit" : "Withdraw";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-[22px] bg-white p-6 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-sans text-[18px] font-bold tracking-tight text-ink">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full font-sans text-[11px] font-bold text-white"
              style={{ background: asset.tone }}
            >
              {asset.sym.slice(0, 2)}
            </span>
            {title} {asset.sym}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-m transition-colors hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="rounded-2xl border border-hair bg-off p-4">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-ink-m">
            <span>Amount</span>
            <span>
              {mode === "deposit" ? "Wallet" : "Deposited"}: {fmtTok(max)} {asset.sym}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              autoFocus
              inputMode="decimal"
              value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              className="w-full bg-transparent font-sans text-[28px] font-extrabold tracking-tight text-ink outline-none placeholder:text-ink-f"
            />
            <button
              onClick={() => setRaw(String(max))}
              className="rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-red"
            >
              Max
            </button>
          </div>
          <div className="mt-1 font-mono text-[12px] text-ink-m">≈ {fmtUSD(amt * asset.price)}</div>
        </div>

        {amt > max && (
          <p className="mt-3 font-mono text-[12px] text-red">
            Exceeds {mode === "deposit" ? "wallet balance" : "deposited amount"}.
          </p>
        )}

        <button
          disabled={!valid}
          onClick={() => onConfirm(amt)}
          className="mt-5 w-full rounded-full bg-ink py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red disabled:cursor-not-allowed disabled:bg-hair disabled:text-ink-f"
        >
          {title} {valid ? `${fmtTok(amt)} ${asset.sym}` : asset.sym}
        </button>
        <p className="mt-3 text-center font-mono text-[11px] text-ink-f">
          Mock action · updates local state only
        </p>
      </div>
    </div>
  );
}
