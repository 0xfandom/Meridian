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
import { useBorrowerAccount, type BorrowerAccount } from "@/lib/use-borrower-account";
import { useCreditActions, type CreditActions, type CreditPhase } from "@/lib/use-credit-actions";
import { useWalletBalances, type WalletBalances } from "@/lib/use-balances";

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

type ManageKind = "borrow" | "repay" | "add" | "withdraw" | "close";

const MANAGE_BUTTONS: { kind: ManageKind; label: string; Icon: typeof Plus }[] = [
  { kind: "borrow", label: "Borrow", Icon: Plus },
  { kind: "repay", label: "Repay", Icon: Minus },
  { kind: "add", label: "Add collateral", Icon: ArrowDownLeft },
  { kind: "withdraw", label: "Withdraw", Icon: ArrowUpRight },
  { kind: "close", label: "Close", Icon: X },
];

function PositionCard({ account }: { account: BorrowerAccount }) {
  const balances = useWalletBalances();
  const actions = useCreditActions();
  const [manage, setManage] = useState<ManageKind | null>(null);

  const openManage = (kind: ManageKind) => {
    actions.reset();
    setManage(kind);
  };

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
    <>
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
                {account.debt > 0 ? usd(account.liquidationPrice) : "—"}
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

function managePhaseLabel(phase: CreditPhase): string {
  switch (phase) {
    case "approving":
      return "Approving WETH…";
    case "borrowing":
      return "Drawing credit…";
    case "repaying":
      return "Repaying…";
    case "adding":
      return "Adding collateral…";
    case "withdrawing":
      return "Withdrawing…";
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

  const phase = actions.phase;
  const busy =
    phase === "approving" ||
    phase === "borrowing" ||
    phase === "repaying" ||
    phase === "adding" ||
    phase === "withdrawing" ||
    phase === "closing";

  // Close on a confirmed receipt; the position refetches on its own poll.
  useEffect(() => {
    if (phase !== "success") return;
    const t = setTimeout(onClose, 900);
    return () => clearTimeout(t);
  }, [phase, onClose]);

  const config: Record<
    ManageKind,
    { title: string; unit: string; max?: number; run: () => Promise<void> }
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
    add: {
      title: "Add collateral",
      unit: "WETH",
      max: balances?.weth ?? 0,
      run: () => actions.addCollateral(account.account, amt),
    },
    withdraw: {
      title: "Withdraw collateral",
      unit: "WETH",
      max: account.collateralWeth,
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
            {account.collateralWeth.toFixed(4)} WETH collateral to your wallet. The account must
            hold enough to cover the interest.
          </p>
        ) : (
          <div className="rounded-2xl border border-hair bg-off p-4">
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-m">
              <span>Amount ({c.unit})</span>
              {c.max !== undefined && (
                <span>Max: {c.unit === "WETH" ? c.max.toFixed(4) : usd(c.max)}</span>
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

        {overMax && (
          <p className="mt-3 font-mono text-[12px] text-red">Exceeds available {c.unit}.</p>
        )}

        <button
          disabled={!valid || busy}
          onClick={() => void c.run()}
          className="mt-5 w-full rounded-full bg-ink py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red disabled:cursor-not-allowed disabled:bg-hair disabled:text-ink-f"
        >
          {busy ? managePhaseLabel(phase) : c.title}
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
