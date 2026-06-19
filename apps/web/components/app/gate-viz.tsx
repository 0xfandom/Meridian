"use client";

// Finance "trading-terminal" backdrop for the connect gate — distinct from the
// landing's metallic cards. All mock, all client-animated: a streaming order
// book, a forming candlestick chart, a health-factor gauge, and a price ticker.
// Initial state is deterministic (no SSR hydration mismatch); randomness only
// kicks in inside useEffect on the client.

import { useEffect, useRef, useState } from "react";
import { Bitcoin, Banknote, Coins, CircleDollarSign, TrendingUp } from "lucide-react";

const UP = "#0a0a0a"; // ink — on-theme "positive" (red/black/white only)
const DOWN = "#e11d2a"; // red

function jitter(base: number, pct: number) {
  return base * (1 + (Math.random() - 0.5) * pct);
}

// iOS-glossy frosted card frame — translucent, blurred, soft highlight + sheen.
// Content sits in a z-10 body so the gloss layers stay behind it.
function GlassCard({
  className = "",
  inner = "p-3",
  children,
}: {
  className?: string;
  inner?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/30 bg-transparent shadow-[0_24px_48px_-26px_rgba(10,10,10,0.38)] backdrop-blur-sm ${className}`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_42%,rgba(255,255,255,0.16)_49%,transparent_57%)]" />
      <span className="pointer-events-none absolute inset-x-5 top-[1px] h-px bg-white/35" />
      <div className={`relative z-10 ${inner}`}>{children}</div>
    </div>
  );
}

// tiny inline sparkline — area + line, stretched to fill its box
export function Sparkline({
  data,
  tone,
  className = "",
}: {
  data: number[];
  tone: string;
  className?: string;
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const n = data.length;
  const pts = data
    .map((v, i) => `${(i / (n - 1)) * 100},${21 - ((v - min) / span) * 19}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 22" preserveAspectRatio="none" className={`h-6 w-full ${className}`}>
      <polygon points={`0,22 ${pts} 100,22`} fill={tone} opacity="0.09" />
      <polyline
        points={pts}
        fill="none"
        stroke={tone}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        opacity="0.85"
      />
    </svg>
  );
}

/* ============================ order book ============================ */
type Row = { price: number; size: number };
const BOOK_MID = 3402;
// deterministic seed sizes (server + first client render match)
const ASK_SEED = [120, 210, 340, 180];
const BID_SEED = [300, 240, 360, 190];

function seedSide(seed: number[], dir: 1 | -1): Row[] {
  return seed.map((size, i) => ({ price: BOOK_MID + dir * (i + 1) * 0.55, size }));
}

function cumulative(side: Row[]): number[] {
  const out: number[] = [];
  side.reduce((acc, r, i) => (out[i] = acc + r.size), 0);
  return out;
}

export function OrderBookPanel() {
  const [asks, setAsks] = useState<Row[]>(() => seedSide(ASK_SEED, 1));
  const [bids, setBids] = useState<Row[]>(() => seedSide(BID_SEED, -1));
  const [mid, setMid] = useState(BOOK_MID);
  const [dir, setDir] = useState<1 | -1>(1);
  const prevMid = useRef(BOOK_MID);

  useEffect(() => {
    const id = setInterval(() => {
      const m = jitter(BOOK_MID, 0.0016);
      setDir(m >= prevMid.current ? 1 : -1);
      prevMid.current = m;
      setMid(m);
      setAsks((p) =>
        p.map((r, i) => ({ price: m + (i + 1) * 0.55, size: Math.max(20, jitter(r.size, 0.5)) })),
      );
      setBids((p) =>
        p.map((r, i) => ({ price: m - (i + 1) * 0.55, size: Math.max(20, jitter(r.size, 0.5)) })),
      );
    }, 1400);
    return () => clearInterval(id);
  }, []);

  // depth bars are sized by CUMULATIVE total out from mid (realistic staircase)
  const askTot = cumulative(asks);
  const bidTot = cumulative(bids);
  const maxTot = Math.max(...askTot, ...bidTot);
  const spread = asks[0].price - bids[0].price;
  const bps = (spread / mid) * 10000;

  const Levels = ({
    side,
    tot,
    tone,
    reverse,
  }: {
    side: Row[];
    tot: number[];
    tone: string;
    reverse?: boolean;
  }) => {
    const order = side.map((_, i) => i);
    if (reverse) order.reverse();
    return (
      <>
        {order.map((i) => (
          <div
            key={i}
            className="relative grid grid-cols-[1fr_auto_auto] items-center gap-2 px-2.5 py-[3px] font-mono text-[11.5px]"
          >
            <div
              className="absolute inset-y-[1px] right-0 rounded-[3px]"
              style={{ width: `${(tot[i] / maxTot) * 100}%`, background: tone, opacity: 0.13 }}
            />
            <span className="relative z-10 tabular-nums" style={{ color: tone }}>
              {side[i].price.toFixed(1)}
            </span>
            <span className="relative z-10 text-right tabular-nums text-ink-s">
              {side[i].size.toFixed(0)}
            </span>
            <span className="relative z-10 w-[40px] text-right tabular-nums text-ink-f">
              {tot[i].toFixed(0)}
            </span>
          </div>
        ))}
      </>
    );
  };

  return (
    <GlassCard className="w-[230px]" inner="p-2.5">
      <div className="mb-1.5 flex items-center justify-between px-1.5">
        <span className="font-mono text-[12px] font-semibold tracking-tight text-ink">
          ETH-PERP
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-f">
          Order book
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2.5 pb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-f">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="w-[40px] text-right">Total</span>
      </div>
      <Levels side={asks} tot={askTot} tone={DOWN} reverse />
      <div className="my-1 flex items-center justify-between rounded-lg bg-off px-2.5 py-1.5">
        <span
          className="flex items-center gap-1.5 font-mono text-[14px] font-bold tabular-nums"
          style={{ color: dir > 0 ? UP : DOWN }}
        >
          <span className="text-[10px]">{dir > 0 ? "▲" : "▼"}</span>
          {mid.toFixed(1)}
        </span>
        <span className="font-mono text-[10px] text-ink-f">
          {spread.toFixed(1)} · {bps.toFixed(1)} bps
        </span>
      </div>
      <Levels side={bids} tot={bidTot} tone={UP} />
    </GlassCard>
  );
}

/* ============================ candlestick chart ============================ */
type Candle = { o: number; h: number; l: number; c: number };
const CANDLE_SEED: Candle[] = [
  { o: 3360, h: 3378, l: 3352, c: 3372 },
  { o: 3372, h: 3390, l: 3366, c: 3384 },
  { o: 3384, h: 3388, l: 3360, c: 3366 },
  { o: 3366, h: 3380, l: 3358, c: 3376 },
  { o: 3376, h: 3402, l: 3374, c: 3398 },
  { o: 3398, h: 3404, l: 3382, c: 3388 },
  { o: 3388, h: 3396, l: 3370, c: 3374 },
  { o: 3374, h: 3392, l: 3372, c: 3390 },
  { o: 3390, h: 3410, l: 3388, c: 3406 },
  { o: 3406, h: 3414, l: 3396, c: 3400 },
  { o: 3400, h: 3408, l: 3384, c: 3392 },
  { o: 3392, h: 3404, l: 3390, c: 3402 },
  { o: 3402, h: 3420, l: 3400, c: 3416 },
  { o: 3416, h: 3422, l: 3404, c: 3408 },
  { o: 3408, h: 3416, l: 3394, c: 3400 },
  { o: 3400, h: 3412, l: 3398, c: 3410 },
];

export function CandlePanel() {
  const [candles, setCandles] = useState<Candle[]>(CANDLE_SEED);

  useEffect(() => {
    const id = setInterval(() => {
      setCandles((prev) => {
        const last = prev[prev.length - 1];
        const o = last.c;
        const drift = (Math.random() - 0.48) * 26;
        const c = o + drift;
        const h = Math.max(o, c) + Math.random() * 10;
        const l = Math.min(o, c) - Math.random() * 10;
        return [...prev.slice(1), { o, h, l, c }];
      });
    }, 1600);
    return () => clearInterval(id);
  }, []);

  const H = 122;
  const hi = Math.max(...candles.map((d) => d.h));
  const lo = Math.min(...candles.map((d) => d.l));
  const span = hi - lo || 1;
  const y = (v: number) => ((hi - v) / span) * H;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const delta = ((last.c - prev.c) / prev.c) * 100;
  const tone = last.c >= last.o ? UP : DOWN;

  return (
    <GlassCard className="w-[304px]" inner="p-4">
      <div className="mb-2.5 flex items-end justify-between">
        <div className="flex flex-col">
          <span className="font-mono text-[12px] font-semibold text-ink">ETH-PERP · 1m</span>
          <span className="font-sans text-[20px] font-bold tracking-tight text-ink">
            {last.c.toFixed(1)}
          </span>
        </div>
        <span
          className="font-mono text-[13px] font-semibold"
          style={{ color: delta >= 0 ? UP : DOWN }}
        >
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-end gap-[4px]" style={{ height: H }}>
        {candles.map((d, i) => {
          const up = d.c >= d.o;
          const col = up ? UP : DOWN;
          const bodyTop = y(Math.max(d.o, d.c));
          const bodyH = Math.max(1, Math.abs(y(d.o) - y(d.c)));
          const wickTop = y(d.h);
          const wickH = Math.max(1, y(d.l) - y(d.h));
          return (
            <div key={i} className="relative flex-1" style={{ height: H }}>
              <div
                className="absolute left-1/2 w-[1.5px] -translate-x-1/2"
                style={{ top: wickTop, height: wickH, background: col, opacity: 0.7 }}
              />
              <div
                className="absolute left-1/2 w-[60%] -translate-x-1/2 rounded-[1px]"
                style={{ top: bodyTop, height: bodyH, background: col }}
              />
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

/* ============================ health gauge ============================ */
export function HealthChip() {
  const [h, setH] = useState(1.84);
  useEffect(() => {
    const id = setInterval(() => setH(() => 1.62 + Math.random() * 0.5), 2200);
    return () => clearInterval(id);
  }, []);

  // map health 1.0..2.5 -> 0..1 on a 180° arc
  const f = Math.max(0, Math.min(1, (h - 1) / 1.5));
  const r = 56;
  const len = Math.PI * r; // semicircle length
  const tone = h >= 1.4 ? UP : DOWN;

  return (
    <GlassCard className="w-[196px]" inner="p-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-f">
        Health factor
      </span>
      <div className="relative mt-1.5 flex items-end justify-center">
        <svg width="152" height="80" viewBox="0 0 152 80">
          <path
            d="M20 72 A56 56 0 0 1 132 72"
            fill="none"
            stroke="#e6e6e6"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M20 72 A56 56 0 0 1 132 72"
            fill="none"
            stroke={tone}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - f)}
            style={{
              transition: "stroke-dashoffset 0.7s cubic-bezier(.22,1,.36,1), stroke 0.4s ease",
            }}
          />
        </svg>
        <span className="absolute bottom-1 font-sans text-[26px] font-bold tracking-tight text-ink">
          {h.toFixed(2)}
        </span>
      </div>
      <span className="mt-1.5 block text-center font-mono text-[11px] text-ink-m">
        liq. buffer {(f * 100).toFixed(0)}%
      </span>
    </GlassCard>
  );
}

/* ============================ price ticker tape ============================ */
type Tick = { sym: string; price: number; chg: number };
const TICKS_SEED: Tick[] = [
  { sym: "ETH", price: 3402.1, chg: 1.24 },
  { sym: "BTC", price: 64118, chg: 0.82 },
  { sym: "SOL", price: 171.4, chg: -2.07 },
  { sym: "ARB", price: 1.18, chg: 3.41 },
  { sym: "OP", price: 2.46, chg: -1.12 },
  { sym: "AVAX", price: 38.9, chg: 0.64 },
  { sym: "LINK", price: 17.83, chg: 2.18 },
  { sym: "WBTC", price: 64020, chg: 0.77 },
];

export function PriceTicker() {
  const [ticks, setTicks] = useState<Tick[]>(TICKS_SEED);
  useEffect(() => {
    const id = setInterval(() => {
      setTicks((prev) =>
        prev.map((t) => ({
          ...t,
          price: jitter(t.price, 0.004),
          chg: t.chg + (Math.random() - 0.5) * 0.3,
        })),
      );
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // each item carries its own trailing space (pr-8) so two identical rows make
  // a track whose halves are byte-identical → translateX(-50%) loops seamlessly
  const Row = ({ list }: { list: Tick[] }) => (
    <>
      {list.map((t, i) => (
        <span key={i} className="flex items-center gap-2 pr-8 font-mono text-[12px]">
          <span className="font-semibold text-ink">{t.sym}</span>
          <span className="text-ink-s">
            {t.price >= 100 ? t.price.toFixed(0) : t.price.toFixed(2)}
          </span>
          <span style={{ color: t.chg >= 0 ? UP : DOWN }}>
            {t.chg >= 0 ? "▲" : "▼"} {Math.abs(t.chg).toFixed(2)}%
          </span>
          <span className="ml-1 h-1 w-1 rounded-full bg-hair" />
        </span>
      ))}
    </>
  );

  return (
    <div
      className="relative z-20 flex overflow-hidden py-3"
      style={{
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)",
        maskImage: "linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)",
      }}
    >
      <div
        className="flex w-max shrink-0 items-center"
        style={{ animation: "marquee 34s linear infinite" }}
      >
        <Row list={ticks} />
        <Row list={ticks} />
      </div>
    </div>
  );
}

/* ============================ positions / PnL ============================ */
type Pos = { mkt: string; side: "Long" | "Short"; lev: number; pnl: number };
const POS_SEED: Pos[] = [
  { mkt: "ETH-PERP", side: "Long", lev: 5, pnl: 96_800 },
  { mkt: "BTC-PERP", side: "Long", lev: 3, pnl: 37_500 },
  { mkt: "SOL-PERP", side: "Short", lev: 4, pnl: 18_700 },
];

export function PositionsPanel() {
  const [pos, setPos] = useState<Pos[]>(POS_SEED);
  useEffect(() => {
    const id = setInterval(
      () =>
        setPos((p) => p.map((x) => ({ ...x, pnl: x.pnl * (1 + (Math.random() - 0.5) * 0.06) }))),
      1800,
    );
    return () => clearInterval(id);
  }, []);
  const total = pos.reduce((s, p) => s + p.pnl, 0);
  const fmtK = (v: number) => `${v >= 0 ? "+" : "-"}$${(Math.abs(v) / 1000).toFixed(1)}k`;

  return (
    <GlassCard className="w-[280px]" inner="p-3">
      <div className="mb-2 flex items-center justify-between px-1.5">
        <span className="font-mono text-[12px] font-semibold tracking-tight text-ink">
          Positions
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-f">
          {pos.length} open
        </span>
      </div>
      <div className="flex flex-col">
        {pos.map((p) => {
          const tone = p.side === "Long" ? UP : DOWN;
          return (
            <div key={p.mkt} className="flex items-center justify-between px-1.5 py-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold"
                  style={{ color: tone, background: tone + "1f" }}
                >
                  {p.side === "Long" ? "LONG" : "SHORT"}
                </span>
                <span className="font-mono text-[12px] text-ink">{p.mkt}</span>
                <span className="font-mono text-[10px] text-ink-f">{p.lev}x</span>
              </div>
              <span
                className="font-mono text-[12px] font-semibold tabular-nums"
                style={{ color: p.pnl >= 0 ? UP : DOWN }}
              >
                {fmtK(p.pnl)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center justify-between border-t border-hair-lt px-1.5 pt-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-f">
          Unrealized PnL
        </span>
        <span
          className="font-sans text-[15px] font-bold tabular-nums"
          style={{ color: total >= 0 ? UP : DOWN }}
        >
          {fmtK(total)}
        </span>
      </div>
    </GlassCard>
  );
}

/* ============================ top utility strip ============================ */
export function UtilityStrip() {
  const [block, setBlock] = useState(21_453_918);
  const [gas, setGas] = useState(14);
  useEffect(() => {
    const id = setInterval(() => {
      setBlock((b) => b + 1);
      setGas(8 + Math.round(Math.random() * 22));
    }, 3000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden items-center gap-3 font-mono text-[11px] text-ink-m md:flex">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#627eea]" />
        Ethereum
      </span>
      <span className="text-hair">·</span>
      <span className="tabular-nums">#{block.toLocaleString("en-US")}</span>
      <span className="text-hair">·</span>
      <span className="tabular-nums">{gas} gwei</span>
    </div>
  );
}

/* ============================ scattered finance icons (bg) ============================ */
const BG_ICONS = [
  // top band (fill the empty area above the headline)
  { I: Bitcoin, left: 6, top: 9, size: 34, rot: -12, a: "gfloat1", d: 11 },
  { I: Banknote, left: 19, top: 6, size: 32, rot: 8, a: "gfloat2", d: 9 },
  { I: Bitcoin, left: 33, top: 11, size: 26, rot: 12, a: "gfloat3", d: 13 },
  { I: Banknote, left: 49, top: 6, size: 30, rot: -6, a: "gfloat1", d: 10 },
  { I: Coins, left: 64, top: 10, size: 28, rot: 10, a: "gfloat2", d: 12 },
  { I: Banknote, left: 78, top: 7, size: 32, rot: -8, a: "gfloat3", d: 9 },
  { I: Bitcoin, left: 91, top: 12, size: 26, rot: 14, a: "gfloat1", d: 8 },
  { I: TrendingUp, left: 12, top: 26, size: 28, rot: 6, a: "gfloat2", d: 13 },
  { I: Bitcoin, left: 86, top: 28, size: 28, rot: -10, a: "gfloat3", d: 12 },
  { I: Banknote, left: 40, top: 27, size: 24, rot: 6, a: "gfloat1", d: 11 },
  // mid / lower (lighter scatter)
  { I: Bitcoin, left: 8, top: 52, size: 28, rot: -8, a: "gfloat2", d: 10 },
  { I: Coins, left: 90, top: 56, size: 26, rot: 8, a: "gfloat1", d: 12 },
  { I: Banknote, left: 22, top: 70, size: 30, rot: -6, a: "gfloat3", d: 14 },
  { I: CircleDollarSign, left: 80, top: 80, size: 26, rot: -6, a: "gfloat2", d: 11 },
  { I: Bitcoin, left: 56, top: 80, size: 28, rot: 12, a: "gfloat1", d: 12 },
];

export function BgIcons() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] hidden lg:block">
      {BG_ICONS.map(({ I, left, top, size, rot, a, d }, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            animation: `${a} ${d}s ease-in-out ${-i}s infinite`,
          }}
        >
          <span
            style={{
              display: "inline-block",
              transform: `rotate(${rot}deg)`,
              color: "rgba(10,10,10,0.1)",
            }}
          >
            <I size={size} strokeWidth={1.6} />
          </span>
        </span>
      ))}
    </div>
  );
}

/* ============================ background brand watermark ============================ */
export function BrandWatermark() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[16] flex items-center justify-center overflow-hidden">
      <span
        className="select-none font-sans font-extrabold leading-none tracking-tighter"
        style={{
          fontSize: "clamp(7rem, 17vw, 16rem)",
          color: "transparent",
          WebkitTextStrokeWidth: "1.5px",
          WebkitTextStrokeColor: "rgba(10,10,10,0.10)",
        }}
      >
        Meridian
      </span>
    </div>
  );
}
