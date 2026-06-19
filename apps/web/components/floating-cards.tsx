// Slow-bobbing gray objects scattered across the whole hero background — a
// coin, mini chart and APY pill as accents, plus a spaced brick-grid of faint
// finance line icons covering the panel. Each gently floats in place
// (fc1..fc3 in globals.css) with a static tilt; no rotation. Behind the
// watermark / dot-grid / foreground content.
import type { LucideIcon } from "lucide-react";
import {
  Lock,
  ShieldCheck,
  Landmark,
  Wallet,
  TrendingUp,
  KeyRound,
  Coins,
  Percent,
  Banknote,
  LineChart,
  Scale,
  CircleDollarSign,
} from "lucide-react";

type Kind = "coin" | "chart" | "pill" | "icon";

type Floater = {
  kind: Kind;
  left: number; // %
  top: number; // %
  tilt: number;
  anim: string;
  dur: number;
  delay: number;
  opacity: number;
  Icon?: LucideIcon;
  size?: number;
};

const ANIMS = ["fc1", "fc2", "fc3"];
const ICON_SET: LucideIcon[] = [
  Lock,
  TrendingUp,
  ShieldCheck,
  Coins,
  Landmark,
  Percent,
  Wallet,
  LineChart,
  KeyRound,
  Banknote,
  Scale,
  CircleDollarSign,
];

// brick-grid scatter — rows offset on alternating lines so icons stay distant
const COLS = [6, 24, 42, 60, 78];
const ROWS = [8, 26, 44, 62, 80];

const ICONS: Floater[] = [];
let k = 0;
for (let r = 0; r < ROWS.length; r++) {
  for (let c = 0; c < COLS.length; c++) {
    const left = COLS[c] + (r % 2 ? 9 : 0);
    if (left > 90) continue;
    ICONS.push({
      kind: "icon",
      left,
      top: ROWS[r],
      tilt: ((k * 41) % 13) - 6,
      anim: ANIMS[k % 3],
      dur: 12 + (k % 7),
      delay: -(k % 9),
      opacity: 0.2,
      Icon: ICON_SET[k % ICON_SET.length],
      size: 30 + (k % 3) * 6,
    });
    k++;
  }
}

const ACCENTS: Floater[] = [
  {
    kind: "icon",
    left: 83,
    top: 52,
    tilt: -3,
    anim: "fc1",
    dur: 18,
    delay: -11,
    opacity: 0.2,
    Icon: LineChart,
    size: 40,
  },
  { kind: "pill", left: 48, top: 16, tilt: 4, anim: "fc3", dur: 12, delay: -7, opacity: 0.45 },
];

const FLOATERS: Floater[] = [...ICONS, ...ACCENTS];

// real-looking but simple coin: light top / dark bottom for depth, raised
// inner face, clean $.
function Coin() {
  return (
    <div className="relative flex h-[80px] w-[80px] items-center justify-center rounded-full bg-gradient-to-b from-[#e7e7e2] to-[#c2c2bc] shadow-[0_14px_32px_-16px_rgba(0,0,0,0.4)]">
      <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-[#b3b3ac]" />
      <span className="absolute inset-[7px] rounded-full bg-gradient-to-b from-[#efefec] to-[#d4d4ce] shadow-[inset_0_2px_3px_rgba(255,255,255,0.6),inset_0_-2px_3px_rgba(0,0,0,0.08)]" />
      <span className="relative font-sans text-[28px] font-bold text-[#9a9a93]">$</span>
    </div>
  );
}

function ChartTile() {
  return (
    <div className="relative h-[108px] w-[160px] overflow-hidden rounded-[14px] bg-gradient-to-br from-[#eaeae7] to-[#d6d6d1] p-3 shadow-[0_20px_44px_-22px_rgba(0,0,0,0.35)]">
      <svg viewBox="0 0 136 84" preserveAspectRatio="none" className="h-full w-full">
        <line x1="0" y1="30" x2="136" y2="30" stroke="#d0d0c9" strokeWidth="1" />
        <line x1="0" y1="56" x2="136" y2="56" stroke="#d0d0c9" strokeWidth="1" />
        <path
          d="M0 62 L24 50 L48 56 L72 34 L96 40 L120 18 L136 24 L136 84 L0 84 Z"
          fill="#c5c5bd"
          opacity="0.5"
        />
        <path
          d="M0 62 L24 50 L48 56 L72 34 L96 40 L120 18 L136 24"
          fill="none"
          stroke="#a6a69e"
          strokeWidth="2.5"
        />
        <circle cx="120" cy="18" r="4" fill="#8f8f88" />
      </svg>
    </div>
  );
}

function Pill() {
  return (
    <div className="rounded-full bg-gradient-to-br from-[#ededeb] to-[#d9d9d4] px-5 py-2.5 shadow-[0_16px_36px_-20px_rgba(0,0,0,0.32)]">
      <span className="font-mono text-[14px] font-medium tracking-tight text-[#8f8f89]">
        5.2% APY
      </span>
    </div>
  );
}

function render(f: Floater) {
  switch (f.kind) {
    case "coin":
      return <Coin />;
    case "chart":
      return <ChartTile />;
    case "pill":
      return <Pill />;
    case "icon": {
      const Icon = f.Icon!;
      return <Icon size={f.size} strokeWidth={1.5} className="text-[#8f8f88]" />;
    }
  }
}

export function FloatingCards() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden lg:block">
      {FLOATERS.map((f, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${f.left}%`,
            top: `${f.top}%`,
            opacity: f.opacity,
            animation: `${f.anim} ${f.dur}s ease-in-out ${f.delay}s infinite`,
          }}
        >
          <div style={{ transform: `rotate(${f.tilt}deg)` }}>{render(f)}</div>
        </div>
      ))}
    </div>
  );
}
