"use client";

// The borrow tab for a real connected wallet. Shows the wallet's actual margin account valued at
// the live oracle price, or an open flow when it has none. Kept separate from the mock borrow view
// (which still serves demo mode) so the real numbers never mix with placeholder ones.

import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Minus,
  Plus,
  ShieldCheck,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { ShieldAlert } from "lucide-react";
import type { MarketView } from "@/lib/api";
import { useBorrowerAccount, type BorrowerAccount } from "@/lib/use-borrower-account";
import { useCreditActions, type CreditActions, type CreditPhase } from "@/lib/use-credit-actions";
import { collateralByToken, useWalletBalances, type WalletBalances } from "@/lib/use-balances";
import { useMarkets } from "@/lib/use-markets";
import { useLiquidationReport, type LiquidationReport } from "@/lib/use-liquidation-report";

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function healthColor(h: number): string {
  if (h >= 1.5) return "text-[#0f9d6e]";
  if (h >= 1.15) return "text-[#d99100]";
  return "text-red";
}

const DISMISSED_KEY = "meridian:dismissed-liquidations";

export function BorrowLive() {
  const account = useBorrowerAccount();
  const report = useLiquidationReport();

  // The liquidation report reflects real on-chain standing (liquidated, no open account), so it
  // shows on every load. Once the user acknowledges it ("Open a new account"), remember that per
  // liquidation tx so a reconnect does not resurface the same one; a brand-new liquidation still
  // shows its own report.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISSED_KEY);
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // ignore unreadable storage
    }
  }, []);

  const dismissReport = (txHash: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(txHash);
      try {
        window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      } catch {
        // ignore unwritable storage
      }
      return next;
    });
  };

  const liquidated = account === null && report != null && !dismissed.has(report.txHash);

  return (
    <section className="rounded-b-[26px] bg-[#f1f1ef] px-5 pb-7 pt-3 lg:px-9 lg:pb-9 lg:pt-4">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-m">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red" />
        </span>
        {liquidated ? "Margin Account · Closed" : "Margin Account · Live"}
      </div>
      <h1
        className="mt-2 font-sans font-extrabold leading-[0.95] tracking-tight text-ink"
        style={{ fontSize: "clamp(1.9rem, 4vw, 3rem)" }}
      >
        {liquidated ? (
          <>
            <span className="text-red">Liquidated</span>
            <span className="text-ink">!</span>
          </>
        ) : (
          <>
            Your position<span className="text-red">.</span>
          </>
        )}
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-m">
        {liquidated
          ? "Your account was liquidated. Here is what happened, read straight from the chain."
          : "Collateral, credit and risk — read straight from your on-chain margin account."}
      </p>

      <div className="mt-7">
        {account === undefined ? (
          <LoadingCard />
        ) : liquidated ? (
          <div className="flex flex-col gap-5">
            <LiquidationReportCard report={report} onStartNew={() => dismissReport(report.txHash)} />
            <LiquidationTheory />
            <BrandBand />
          </div>
        ) : account === null ? (
          <div className="flex flex-col gap-5">
            <OpenAccountCard />
            <BorrowHowItWorks />
            <BrandBand />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <PositionCard account={account} />
            <ManagePosition />
            <BrandBand />
          </div>
        )}
      </div>
    </section>
  );
}

// Read-only post-mortem shown after the connected wallet's account is liquidated.
function LiquidationReportCard({
  report,
  onStartNew,
}: {
  report: LiquidationReport;
  onStartNew: () => void;
}) {
  const details = [
    { k: "Market", v: `${report.symbol} collateral` },
    {
      k: "Liquidator (keeper)",
      v: `${report.liquidator.slice(0, 6)}…${report.liquidator.slice(-4)}`,
    },
    { k: "Block", v: `#${report.blockNumber}` },
    { k: "Transaction", v: `${report.txHash.slice(0, 10)}…${report.txHash.slice(-6)}` },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col gap-5 rounded-2xl border border-red/40 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_18px_44px_-20px_rgba(225,29,42,0.28)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red/10 text-red">
              <ShieldAlert size={18} strokeWidth={2.2} />
            </span>
            <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">
              Liquidation report
            </h2>
          </div>
          <span className="font-mono text-[11px] text-ink-f">
            {report.account.slice(0, 6)}…{report.account.slice(-4)}
          </span>
        </div>

        {/* hero figures */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hair/70 bg-hair/70">
          <div className="bg-white px-5 py-5">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
              Collateral seized
            </div>
            <div className="mt-1 font-sans text-[26px] font-extrabold leading-none tracking-tight text-red">
              {report.collateralSeized.toFixed(2)}
              <span className="ml-1 text-[14px] font-bold text-ink-m">{report.symbol}</span>
            </div>
          </div>
          <div className="bg-white px-5 py-5">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
              Debt repaid to pool
            </div>
            <div className="mt-1 font-sans text-[26px] font-extrabold leading-none tracking-tight text-ink">
              {usd(report.debtRepaid)}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-hair/70">
          {details.map((r, i) => (
            <div
              key={r.k}
              className={`flex items-center justify-between px-4 py-3 ${
                i > 0 ? "border-t border-hair/70" : ""
              }`}
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-f">
                {r.k}
              </span>
              <span className="font-mono text-[13px] font-semibold text-ink">{r.v}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onStartNew}
          className="mt-1 w-full rounded-full bg-ink py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red"
        >
          Open a new margin account
        </button>
      </div>

      {/* what it means */}
      <div className="flex flex-col rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div
            aria-hidden="true"
            className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-red/10 font-sans font-black leading-none text-red"
            style={{ fontSize: "72px" }}
          >
            !
          </div>
          <div className="font-sans text-[20px] font-extrabold tracking-tight text-ink">
            Position wiped out
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-m">
            Your account health fell below the liquidation floor, so the keeper repaid your debt and
            seized the collateral at a discount. The account is closed — this view is read-only.
          </p>
        </div>

        {/* outcome breakdown */}
        <div className="mt-5 overflow-hidden rounded-xl border border-hair/70">
          {[
            { k: "Debt to pool", v: "Cleared", tone: "ink" as const },
            { k: "Your collateral", v: "Seized", tone: "red" as const },
            { k: "Lender funds", v: "Protected", tone: "green" as const },
          ].map((o, i) => (
            <div
              key={o.k}
              className={`flex items-center justify-between px-4 py-2.5 ${
                i > 0 ? "border-t border-hair/70" : ""
              }`}
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-f">
                {o.k}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                  o.tone === "green"
                    ? "bg-[#0f9d6e]/10 text-[#0f9d6e]"
                    : o.tone === "red"
                      ? "bg-red/10 text-red"
                      : "bg-off text-ink"
                }`}
              >
                {o.v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Educational band shown under the liquidation report: the lifecycle the account just went through.
function LiquidationTheory() {
  const steps = [
    {
      n: "01",
      t: "Health falls",
      d: "The collateral price drops until the account's health factor — risk-adjusted collateral over debt — slips below 1.0, the liquidation floor.",
    },
    {
      n: "02",
      t: "Keeper detects",
      d: "An off-chain risk engine flags the account; the on-chain liquidation module re-checks the floor, so a stale read can never force an unfair seizure.",
    },
    {
      n: "03",
      t: "Debt repaid",
      d: "The keeper repays the account's debt to the pool — funding any shortfall from its own balance — so lenders are made whole instantly.",
    },
    {
      n: "04",
      t: "Collateral seized",
      d: "In return, the keeper takes the collateral at a discount. That discount is the incentive that keeps the whole system solvent.",
    },
  ];

  return (
    <div className="rounded-2xl border border-hair/70 bg-white p-6 lg:p-8 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-f">The theory</div>
      <h2
        className="mt-1.5 font-sans font-extrabold leading-[1.02] tracking-tight text-ink"
        style={{ fontSize: "clamp(1.5rem, 3vw, 2.3rem)" }}
      >
        How a liquidation works<span className="text-red">.</span>
      </h2>
      <p className="mt-2 max-w-[640px] text-[13.5px] leading-relaxed text-ink-m">
        Liquidation is what lets Meridian offer capital-efficient, undercollateralized leverage while
        keeping every lender fully covered. Here is the exact lifecycle your account just went
        through — settled on-chain, in seconds.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.n} className="rounded-xl border border-hair/70 bg-off/40 p-4">
            <div className="font-sans text-[22px] font-extrabold tracking-tight text-red">{s.n}</div>
            <div className="mt-1 font-sans text-[14.5px] font-bold tracking-tight text-ink">
              {s.t}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-m">{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Educational band shown under the open-account form: how a margin account works, end to end.
function BorrowHowItWorks() {
  const steps = [
    {
      n: "01",
      t: "Post collateral",
      d: "Pick a market and deposit collateral into an isolated margin account — an on-chain clone that only you control.",
    },
    {
      n: "02",
      t: "Draw credit",
      d: "Borrow USDC against your collateral, capital-efficiently, drawn straight from the lender pool.",
    },
    {
      n: "03",
      t: "Lever & trade",
      d: "Swap drawn USDC into more collateral through whitelisted adapters — inside the account, never leaving on trust.",
    },
    {
      n: "04",
      t: "Stay healthy",
      d: "One health check gates every action. Keep your health factor above 1.0, or a keeper liquidates the account.",
    },
  ];

  return (
    <div className="rounded-2xl border border-hair/70 bg-white p-6 lg:p-8 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-f">How it works</div>
      <h2
        className="mt-1.5 font-sans font-extrabold leading-[1.02] tracking-tight text-ink"
        style={{ fontSize: "clamp(1.5rem, 3vw, 2.3rem)" }}
      >
        A margin account, end to end<span className="text-red">.</span>
      </h2>
      <p className="mt-2 max-w-[640px] text-[13.5px] leading-relaxed text-ink-m">
        Meridian is a non-custodial prime brokerage: lenders supply USDC, you borrow against
        collateral and trade with leverage — all inside an isolated account that can only touch
        whitelisted protocols. Your funds never leave your control.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.n} className="rounded-xl border border-hair/70 bg-off/40 p-4">
            <div className="font-sans text-[22px] font-extrabold tracking-tight text-red">{s.n}</div>
            <div className="mt-1 font-sans text-[14.5px] font-bold tracking-tight text-ink">
              {s.t}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-m">{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Educational band shown under an open position: how to read it and manage the risk.
function ManagePosition() {
  const steps = [
    {
      n: "01",
      t: "Watch health",
      d: "Health factor is risk-adjusted collateral over debt. Keep it above 1.0 — the liquidation price is the hard floor where a keeper steps in.",
    },
    {
      n: "02",
      t: "Add exposure",
      d: "Borrow more or lever up to swap drawn USDC into more collateral. Both raise your position — and pull the liquidation price closer.",
    },
    {
      n: "03",
      t: "De-risk",
      d: "Repay debt or add collateral to push health back up and the liquidation price away. One health check gates every action.",
    },
    {
      n: "04",
      t: "Exit anytime",
      d: "Close repays the debt and returns your collateral in a single call. Funds never leave your isolated account on trust.",
    },
  ];

  return (
    <div className="rounded-2xl border border-hair/70 bg-white p-6 lg:p-8 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-f">Managing the position</div>
      <h2
        className="mt-1.5 font-sans font-extrabold leading-[1.02] tracking-tight text-ink"
        style={{ fontSize: "clamp(1.5rem, 3vw, 2.3rem)" }}
      >
        Reading your risk<span className="text-red">.</span>
      </h2>
      <p className="mt-2 max-w-[640px] text-[13.5px] leading-relaxed text-ink-m">
        Everything above is read straight from your on-chain margin account. Health factor tells you
        where you stand now; the liquidation price tells you how much room you have if the market
        moves. Use these actions to steer between them.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.n} className="rounded-xl border border-hair/70 bg-off/40 p-4">
            <div className="font-sans text-[22px] font-extrabold tracking-tight text-red">{s.n}</div>
            <div className="mt-1 font-sans text-[14.5px] font-bold tracking-tight text-ink">
              {s.t}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-m">{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Large brand statement that anchors the borrow views.
function BrandBand() {
  return (
    <div className="overflow-hidden rounded-2xl bg-ink px-6 py-12 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
        Non-custodial digital-asset prime brokerage
      </div>
      <div
        className="mt-3 font-sans font-extrabold leading-none tracking-tight text-white"
        style={{ fontSize: "clamp(2.6rem, 8vw, 5.5rem)" }}
      >
        Meridian<span className="text-red">.</span>
      </div>
      <p className="mx-auto mt-4 max-w-[500px] text-[14px] leading-relaxed text-white/55">
        Lenders supply, managers borrow against collateral, and the pool is always made whole — even
        when a position is liquidated. Solvency is enforced, not promised.
      </p>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="flex h-40 items-center justify-center rounded-2xl border border-hair/70 bg-white font-mono text-[12px] text-ink-f">
      Reading your account…
    </div>
  );
}

type ManageKind = "borrow" | "repay" | "add" | "withdraw" | "lever" | "close";

const MANAGE_BUTTONS: { kind: ManageKind; label: string; Icon: typeof Plus }[] = [
  { kind: "borrow", label: "Borrow", Icon: Plus },
  { kind: "repay", label: "Repay", Icon: Minus },
  { kind: "lever", label: "Lever up", Icon: TrendingUp },
  { kind: "add", label: "Add collateral", Icon: ArrowDownLeft },
  { kind: "withdraw", label: "Withdraw", Icon: ArrowUpRight },
  { kind: "close", label: "Close", Icon: X },
];

function PositionCard({ account }: { account: BorrowerAccount }) {
  const balances = useWalletBalances();
  const actions = useCreditActions(account.market);
  const [manage, setManage] = useState<ManageKind | null>(null);

  const openManage = (kind: ManageKind) => {
    actions.reset();
    setManage(kind);
  };

  const metrics = [
    {
      k: "Collateral",
      v: account.collaterals ? "Basket" : `${account.collateral.toFixed(4)} ${account.symbol}`,
      sub: usd(account.collateralValue),
    },
    { k: "Debt", v: usd(account.debt), sub: "USDC drawn" },
    { k: "Account value", v: usd(account.equity), sub: "equity" },
    { k: "Leverage", v: `${account.leverage.toFixed(2)}x`, sub: `${usd(account.assets)} gross` },
  ];

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5 rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">
              Account overview
            </h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-hair px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-m">
                {account.symbol} market
              </span>
              <span className="font-mono text-[11px] text-ink-f">
                {account.account.slice(0, 6)}…{account.account.slice(-4)}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hair/70 bg-hair/70">
            {metrics.map((m) => (
              <div key={m.k} className="bg-white px-4 py-4">
                <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
                  {m.k}
                </div>
                <div className="mt-1 font-sans text-[18px] font-bold tracking-tight text-ink">
                  {m.v}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-m">{m.sub}</div>
              </div>
            ))}
          </div>
          {/* basket collateral breakdown */}
          {account.collaterals && (
            <div className="overflow-hidden rounded-xl border border-hair/70">
              <div className="flex items-center justify-between bg-off/50 px-4 py-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
                <span>Collateral assets</span>
                <span>Value</span>
              </div>
              {account.collaterals.map((c) => (
                <div
                  key={c.token}
                  className="flex items-center justify-between border-t border-hair/70 px-4 py-2.5"
                >
                  <div className="font-sans text-[13.5px] font-semibold text-ink">
                    {c.amount.toFixed(4)} <span className="text-ink-m">{c.symbol}</span>
                  </div>
                  <div className="font-mono text-[12.5px] text-ink-m">{usd(c.value)}</div>
                </div>
              ))}
            </div>
          )}
          {/* manage actions */}
          <div className="flex flex-wrap gap-2">
            {MANAGE_BUTTONS.map(({ kind, label, Icon }) => (
              <button
                key={kind}
                onClick={() => openManage(kind)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  kind === "close"
                    ? "border-hair text-ink-m hover:border-red hover:text-red"
                    : "border-hair text-ink hover:border-ink hover:bg-off"
                }`}
              >
                <Icon size={13} strokeWidth={2.4} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* risk */}
        <div className="flex flex-col gap-5 rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
          <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">Risk</h2>
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
              Health factor
            </div>
            <div
              className={`mt-1 font-sans text-[34px] font-extrabold tracking-tight ${healthColor(account.health)}`}
            >
              {Number.isFinite(account.health) ? account.health.toFixed(2) : "∞"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
                Mark price
              </div>
              <div className="mt-1 font-mono text-[15px] font-semibold text-ink">
                {usd(account.price)}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
                Liquidation
              </div>
              <div className="mt-1 font-mono text-[15px] font-semibold text-ink">
                {account.collaterals || account.debt === 0 ? "—" : usd(account.liquidationPrice)}
              </div>
            </div>
          </div>
          <p className="mt-auto font-mono text-[11px] text-ink-f">
            Non-custodial · funds stay in your account.
          </p>
        </div>
      </div>

      {manage && (
        <ManageModal
          kind={manage}
          account={account}
          balances={balances}
          actions={actions}
          onClose={() => setManage(null)}
        />
      )}
    </>
  );
}

function managePhaseLabel(phase: CreditPhase, symbol: string): string {
  switch (phase) {
    case "approving":
      return `Approving ${symbol}…`;
    case "borrowing":
      return "Drawing credit…";
    case "repaying":
      return "Repaying…";
    case "adding":
      return "Adding collateral…";
    case "withdrawing":
      return "Withdrawing…";
    case "trading":
      return `Swapping USDC → ${symbol}…`;
    case "closing":
      return "Closing…";
    default:
      return "";
  }
}

function ManageModal({
  kind,
  account,
  balances,
  actions,
  onClose,
}: {
  kind: ManageKind;
  account: BorrowerAccount;
  balances: WalletBalances | null;
  actions: CreditActions;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState("");
  const amt = parseFloat(raw) || 0;
  const symbol = account.symbol;
  const walletCollateral = collateralByToken(balances, account.collateralToken)?.amount ?? 0;

  const phase = actions.phase;
  const busy =
    phase === "approving" ||
    phase === "borrowing" ||
    phase === "repaying" ||
    phase === "adding" ||
    phase === "withdrawing" ||
    phase === "trading" ||
    phase === "closing";

  // Close on a confirmed receipt; the position refetches on its own poll.
  useEffect(() => {
    if (phase !== "success") return;
    const t = setTimeout(onClose, 900);
    return () => clearTimeout(t);
  }, [phase, onClose]);

  const config: Record<
    ManageKind,
    { title: string; unit: string; max?: number; hint?: string; run: () => Promise<void> }
  > = {
    borrow: {
      title: "Borrow USDC",
      unit: "USDC",
      run: () => actions.borrow(account.account, amt),
    },
    repay: {
      title: "Repay USDC",
      unit: "USDC",
      max: Math.min(account.debt, account.usdcHeld),
      run: () => actions.repay(account.account, amt),
    },
    lever: {
      title: "Lever up",
      unit: "USDC",
      max: account.usdcHeld,
      hint: `Swaps the account's USDC into ${symbol} collateral through the whitelisted Uniswap adapter — inside the account, never leaving it.`,
      run: () => actions.lever(account.account, amt),
    },
    add: {
      title: "Add collateral",
      unit: symbol,
      max: walletCollateral,
      run: () => actions.addCollateral(account.account, amt),
    },
    withdraw: {
      title: "Withdraw collateral",
      unit: symbol,
      max: account.collateral,
      run: () => actions.withdrawCollateral(account.account, amt),
    },
    close: {
      title: "Close account",
      unit: "",
      run: () => actions.close(account.account),
    },
  };
  const c = config[kind];
  const isClose = kind === "close";
  const isToken = c.unit === symbol;
  const valid = isClose || (amt > 0 && (c.max === undefined || amt <= c.max));
  const overMax = !isClose && c.max !== undefined && amt > c.max;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-[22px] bg-white p-6 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-sans text-[18px] font-bold tracking-tight text-ink">{c.title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-m transition-colors hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {isClose ? (
          <p className="rounded-2xl border border-hair bg-off p-4 text-[13px] leading-relaxed text-ink-m">
            Repays the debt — principal plus accrued interest — from the {usd(account.usdcHeld)} the
            account holds, then returns the remaining balance and{" "}
            {account.collateral.toFixed(4)} {symbol} collateral to your wallet. The account must hold
            enough to cover the interest.
          </p>
        ) : (
          <div className="rounded-2xl border border-hair bg-off p-4">
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-m">
              <span>Amount ({c.unit})</span>
              {c.max !== undefined && (
                <span>Max: {isToken ? c.max.toFixed(4) : usd(c.max)}</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                autoFocus
                inputMode="decimal"
                value={raw}
                onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                disabled={busy}
                className="w-full bg-transparent font-sans text-[26px] font-extrabold tracking-tight text-ink outline-none placeholder:text-ink-f"
              />
              {c.max !== undefined && (
                <button
                  onClick={() => setRaw(String(c.max))}
                  className="rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-red"
                >
                  Max
                </button>
              )}
            </div>
          </div>
        )}

        {c.hint && !isClose && (
          <p className="mt-3 text-[12px] leading-relaxed text-ink-m">{c.hint}</p>
        )}

        {overMax && (
          <p className="mt-3 font-mono text-[12px] text-red">Exceeds available {c.unit}.</p>
        )}

        <button
          disabled={!valid || busy}
          onClick={() => void c.run()}
          className="mt-5 w-full rounded-full bg-ink py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red disabled:cursor-not-allowed disabled:bg-hair disabled:text-ink-f"
        >
          {busy ? managePhaseLabel(phase, symbol) : c.title}
        </button>
        {phase === "error" ? (
          <p className="mt-3 text-center font-mono text-[11px] text-red">
            {actions.error ?? "Transaction failed"}
          </p>
        ) : phase === "success" ? (
          <p className="mt-3 text-center font-mono text-[11px] text-[#0f9d6e]">
            Confirmed on-chain
          </p>
        ) : (
          <p className="mt-3 text-center font-mono text-[11px] text-ink-f">
            Live transaction · confirm in your wallet
          </p>
        )}
      </div>
    </div>
  );
}

function OpenAccountCard() {
  const balances = useWalletBalances();
  const markets = useMarkets();
  const [selectedToken, setSelectedToken] = useState<string | undefined>(undefined);
  const [collateralRaw, setCollateralRaw] = useState("");
  const [borrowRaw, setBorrowRaw] = useState("");

  // Default the selected market to the first one once markets resolve.
  useEffect(() => {
    if (!selectedToken && markets && markets.length > 0) {
      setSelectedToken(markets[0]!.collateralToken);
    }
  }, [markets, selectedToken]);

  const market: MarketView | undefined =
    markets?.find((m) => m.collateralToken === selectedToken) ?? markets?.[0];
  const actions = useCreditActions(market);

  const symbol = market?.symbol ?? "";
  const price = market ? Number(market.priceUsdc) / 1e6 : 0;
  const walletCollateral = collateralByToken(balances, market?.collateralToken)?.amount ?? 0;
  const collateral = parseFloat(collateralRaw) || 0;
  const borrow = parseFloat(borrowRaw) || 0;
  const validCollateral = collateral > 0 && collateral <= walletCollateral;
  const valid = Boolean(market) && validCollateral && borrow >= 0;

  const phase = actions.phase;
  const busy = phase === "approving" || phase === "opening";

  const phaseLabel =
    phase === "approving"
      ? `Approving ${symbol}…`
      : phase === "opening"
        ? "Opening account…"
        : phase === "success"
          ? "Opened"
          : "Open margin account";

  // Reset the typed collateral when switching markets so a stale amount can't exceed the new wallet.
  const selectMarket = (token: string) => {
    setSelectedToken(token);
    setCollateralRaw("");
    actions.reset();
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-4 rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-white">
            <CreditCard size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">
              Open a margin account
            </h2>
            <p className="text-[12.5px] text-ink-m">
              Pick a collateral market, post collateral and draw USDC credit.
            </p>
          </div>
        </div>

        {/* market selector */}
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-f">
            Collateral market
          </div>
          <div className="flex flex-wrap gap-2">
            {(markets ?? []).map((m) => {
              const active = m.collateralToken === market?.collateralToken;
              return (
                <button
                  key={m.collateralToken}
                  onClick={() => selectMarket(m.collateralToken)}
                  disabled={busy}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed ${
                    active
                      ? "border-ink bg-ink text-white"
                      : "border-hair text-ink hover:border-ink hover:bg-off"
                  }`}
                >
                  {m.symbol}
                </button>
              );
            })}
            {!markets && (
              <span className="font-mono text-[12px] text-ink-f">Loading markets…</span>
            )}
          </div>
        </div>

        <Field
          label={`Collateral (${symbol || "—"})`}
          aside={`Wallet: ${walletCollateral.toFixed(4)}`}
          value={collateralRaw}
          onChange={setCollateralRaw}
          onMax={() => setCollateralRaw(String(walletCollateral))}
          disabled={busy || !market}
        />
        <Field
          label="Borrow (USDC)"
          aside="Drawn from the pool"
          value={borrowRaw}
          onChange={setBorrowRaw}
          disabled={busy || !market}
        />

        {collateral > walletCollateral && (
          <p className="font-mono text-[12px] text-red">Exceeds wallet {symbol} balance.</p>
        )}

        <button
          disabled={!valid || busy}
          onClick={() => void actions.open(collateral, borrow)}
          className="mt-1 w-full rounded-full bg-ink py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red disabled:cursor-not-allowed disabled:bg-hair disabled:text-ink-f"
        >
          {phaseLabel}
        </button>
        {phase === "error" ? (
          <p className="text-center font-mono text-[11px] text-red">
            {actions.error ?? "Transaction failed"}
          </p>
        ) : phase === "success" ? (
          <p className="text-center font-mono text-[11px] text-[#0f9d6e]">
            Account opened on-chain
          </p>
        ) : (
          <p className="flex items-center justify-center gap-1.5 font-mono text-[11px] text-ink-f">
            <ShieldCheck size={12} className="text-red" />
            Non-custodial · approve then confirm in your wallet
          </p>
        )}
      </div>

      {/* estimate */}
      <div className="flex flex-col gap-6 rounded-2xl border border-hair/70 bg-white p-6 lg:p-7 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-f">
          <TrendingUp size={14} className="text-red" /> Estimate
        </div>
        <Estimate collateral={collateral} borrow={borrow} symbol={symbol || "collateral"} price={price} />
      </div>
    </div>
  );
}

function Estimate({
  collateral,
  borrow,
  symbol,
  price,
}: {
  collateral: number;
  borrow: number;
  symbol: string;
  price: number;
}) {
  // A pre-open guide only: the borrowed USDC stays in the account, so equity is the collateral value
  // and gross exposure is collateral value + the drawn USDC. The contract enforces the real check.
  const collateralValue = collateral * price;
  const positionValue = collateralValue + borrow;
  const leverage = collateralValue > 0 ? positionValue / collateralValue : 1;
  const equityPct = positionValue > 0 ? (collateralValue / positionValue) * 100 : 100;
  const borrowPct = positionValue > 0 ? (borrow / positionValue) * 100 : 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
            You post
          </div>
          <div className="mt-1.5 font-sans text-[30px] font-extrabold leading-none tracking-tight text-ink">
            {collateral >= 1000 ? collateral.toFixed(0) : collateral.toFixed(2)}
            <span className="ml-1 text-[15px] font-bold text-ink-m">{symbol}</span>
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-ink-f">{usd(collateralValue)}</div>
        </div>
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
            You borrow
          </div>
          <div className="mt-1.5 font-sans text-[30px] font-extrabold leading-none tracking-tight text-red">
            {usd(borrow)}
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-ink-f">USDC credit</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hair/70 bg-hair/70">
        <div className="bg-white px-4 py-4">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
            Position value
          </div>
          <div className="mt-1 font-sans text-[20px] font-bold tracking-tight text-ink">
            {usd(positionValue)}
          </div>
        </div>
        <div className="bg-white px-4 py-4">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
            Est. leverage
          </div>
          <div className="mt-1 font-sans text-[20px] font-bold tracking-tight text-ink">
            {leverage.toFixed(2)}x
          </div>
        </div>
      </div>

      {/* exposure split: your collateral vs the credit drawn against it */}
      <div>
        <div className="mb-2 flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-f">
          <span>Exposure</span>
          <span>{usd(positionValue)}</span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-hair">
          <div className="h-full bg-ink transition-all" style={{ width: `${equityPct}%` }} />
          <div className="h-full bg-red transition-all" style={{ width: `${borrowPct}%` }} />
        </div>
        <div className="mt-2.5 flex items-center gap-5 font-mono text-[10px] text-ink-m">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ink" /> Your collateral
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red" /> Borrowed credit
          </span>
        </div>
      </div>

      <p className="mt-auto flex items-center gap-1.5 border-t border-hair/60 pt-4 font-mono text-[10.5px] leading-relaxed text-ink-f">
        <Wallet size={12} className="shrink-0 text-red" /> The contract rejects an unhealthy open —
        your health factor must stay above 1.0.
      </p>
    </div>
  );
}

function Field({
  label,
  aside,
  value,
  onChange,
  onMax,
  disabled,
}: {
  label: string;
  aside: string;
  value: string;
  onChange: (v: string) => void;
  onMax?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-hair bg-off p-4">
      <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-m">
        <span>{label}</span>
        <span>{aside}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0"
          disabled={disabled}
          className="w-full bg-transparent font-sans text-[24px] font-extrabold tracking-tight text-ink outline-none placeholder:text-ink-f"
        />
        {onMax && (
          <button
            onClick={onMax}
            className="rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-red"
          >
            Max
          </button>
        )}
      </div>
    </div>
  );
}
