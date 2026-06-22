"use client";

// The borrow tab for a real connected wallet. Shows the wallet's actual margin account valued at
// the live oracle price, or an open flow when it has none. Kept separate from the mock borrow view
// (which still serves demo mode) so the real numbers never mix with placeholder ones.

import { useState } from "react";
import { CreditCard, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { useBorrowerAccount } from "@/lib/use-borrower-account";
import { useCreditActions } from "@/lib/use-credit-actions";
import { useWalletBalances } from "@/lib/use-balances";

const MAINTENANCE_LT = 0.9; // configured liquidation threshold, used only for the open-form estimate

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

export function BorrowLive() {
  const account = useBorrowerAccount();

  return (
    <section className="rounded-b-[26px] bg-[#f1f1ef] px-5 pb-7 pt-3 lg:px-9 lg:pb-9 lg:pt-4">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-m">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red" />
        </span>
        Margin Account · Live
      </div>
      <h1
        className="mt-2 font-sans font-extrabold leading-[0.95] tracking-tight text-ink"
        style={{ fontSize: "clamp(1.9rem, 4vw, 3rem)" }}
      >
        Your position<span className="text-red">.</span>
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-m">
        Collateral, credit and risk — read straight from your on-chain margin account.
      </p>

      <div className="mt-7">
        {account === undefined ? (
          <LoadingCard />
        ) : account === null ? (
          <OpenAccountCard />
        ) : (
          <PositionCard account={account} />
        )}
      </div>
    </section>
  );
}

function LoadingCard() {
  return (
    <div className="flex h-40 items-center justify-center rounded-2xl border border-hair/70 bg-white font-mono text-[12px] text-ink-f">
      Reading your account…
    </div>
  );
}

function PositionCard({
  account,
}: {
  account: NonNullable<ReturnType<typeof useBorrowerAccount>>;
}) {
  const metrics = [
    {
      k: "Collateral",
      v: `${account.collateralWeth.toFixed(4)} WETH`,
      sub: usd(account.collateralValue),
    },
    { k: "Debt", v: usd(account.debt), sub: "USDC drawn" },
    { k: "Account value", v: usd(account.equity), sub: "equity" },
    { k: "Leverage", v: `${account.leverage.toFixed(2)}x`, sub: `${usd(account.assets)} gross` },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col gap-5 rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-[16px] font-bold tracking-tight text-ink">
            Account overview
          </h2>
          <span className="font-mono text-[11px] text-ink-f">
            {account.account.slice(0, 6)}…{account.account.slice(-4)}
          </span>
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
              {account.debt > 0 ? usd(account.liquidationPrice) : "—"}
            </div>
          </div>
        </div>
        <p className="mt-auto font-mono text-[11px] text-ink-f">
          Manage (borrow, repay, withdraw, close) lands next.
        </p>
      </div>
    </div>
  );
}

function OpenAccountCard() {
  const balances = useWalletBalances();
  const actions = useCreditActions();
  const [collateralRaw, setCollateralRaw] = useState("");
  const [borrowRaw, setBorrowRaw] = useState("");

  const walletWeth = balances?.weth ?? 0;
  const collateral = parseFloat(collateralRaw) || 0;
  const borrow = parseFloat(borrowRaw) || 0;
  const validCollateral = collateral > 0 && collateral <= walletWeth;
  const valid = validCollateral && borrow >= 0;

  const phase = actions.phase;
  const busy = phase === "approving" || phase === "opening";

  const phaseLabel =
    phase === "approving"
      ? "Approving WETH…"
      : phase === "opening"
        ? "Opening account…"
        : phase === "success"
          ? "Opened"
          : "Open margin account";

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
            <p className="text-[12.5px] text-ink-m">Post WETH collateral and draw USDC credit.</p>
          </div>
        </div>

        <Field
          label="Collateral (WETH)"
          aside={`Wallet: ${walletWeth.toFixed(4)}`}
          value={collateralRaw}
          onChange={setCollateralRaw}
          onMax={() => setCollateralRaw(String(walletWeth))}
          disabled={busy}
        />
        <Field
          label="Borrow (USDC)"
          aside="Drawn from the pool"
          value={borrowRaw}
          onChange={setBorrowRaw}
          disabled={busy}
        />

        {collateral > walletWeth && (
          <p className="font-mono text-[12px] text-red">Exceeds wallet WETH balance.</p>
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
      <div className="flex flex-col justify-center gap-4 rounded-2xl border border-hair/70 bg-white p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04),0_10px_30px_-16px_rgba(10,10,10,0.12)]">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-f">
          <TrendingUp size={13} /> Estimate
        </div>
        <Estimate collateral={collateral} borrow={borrow} />
      </div>
    </div>
  );
}

function Estimate({ collateral, borrow }: { collateral: number; borrow: number }) {
  // A pre-open guide only: the borrowed USDC stays in the account, so the account is healthy as long
  // as (collateral value + borrow) x LT >= debt. The contract enforces the real check on open.
  const rows = [
    { k: "Collateral", v: `${collateral.toFixed(4)} WETH` },
    { k: "Borrow", v: usd(borrow) },
    {
      k: "Health rule",
      v: borrow > 0 && collateral > 0 ? `value × ${MAINTENANCE_LT} ≥ debt` : "no debt",
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.k} className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-f">
            {r.k}
          </span>
          <span className="font-mono text-[13px] font-semibold text-ink">{r.v}</span>
        </div>
      ))}
      <p className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px] text-ink-f">
        <Wallet size={11} /> The contract rejects an unhealthy open.
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
