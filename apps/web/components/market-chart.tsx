// Faint background market chart — trading-desk detail, all deterministic.
const W = 1000;
const H = 420;
const BASE = 348; // chart baseline (volume strip below)
const TOP = 60;
const N = 120;

function priceAt(i: number) {
  const t = i / N;
  const trend = 300 - t * 196; // gentle uptrend
  const wig =
    20 * Math.sin(i * 0.55) + 11 * Math.sin(i * 0.19 + 0.7) + 5.5 * Math.sin(i * 1.27 + 2);
  return Math.max(TOP, Math.min(BASE - 6, trend + wig));
}
function maAt(i: number) {
  const t = i / N;
  return 312 - t * 196 + 7 * Math.sin(i * 0.12);
}

const pts = Array.from({ length: N + 1 }, (_, i) => [(i / N) * W, priceAt(i)] as const);
const linePath = pts
  .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
  .join(" ");
const areaPath = `${linePath} L${W},${BASE} L0,${BASE} Z`;
const maPath = Array.from({ length: N + 1 }, (_, i) => {
  const x = (i / N) * W;
  return `${i ? "L" : "M"}${x.toFixed(1)},${maAt(i).toFixed(1)}`;
}).join(" ");

const last = pts[N];

const gridYs = [100, 165, 230, 295];
const tickLabels = ["6.9%", "6.6%", "6.3%", "6.0%"];

const volBars = Array.from({ length: Math.floor(N / 3) }, (_, k) => {
  const i = k * 3;
  const x = (i / N) * W;
  const h = 10 + 34 * Math.abs(Math.sin(i * 0.8 + 0.5));
  return { x, h };
});

export function MarketChart({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className}>
      <defs>
        <linearGradient id="mkt-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dededa" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#dededa" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* horizontal gridlines + right-edge value ticks */}
      {gridYs.map((y, i) => (
        <g key={y}>
          <line
            x1="0"
            y1={y}
            x2={W}
            y2={y}
            stroke="#e7e7e3"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={W - 6}
            y={y - 5}
            textAnchor="end"
            fontFamily="var(--font-mono)"
            fontSize="13"
            fill="#cdcdc7"
          >
            {tickLabels[i]}
          </text>
        </g>
      ))}

      {/* volume bars */}
      {volBars.map((b, i) => (
        <rect key={i} x={b.x - 2.5} y={BASE - b.h} width="5" height={b.h} fill="#e6e6e1" />
      ))}
      <line
        x1="0"
        y1={BASE}
        x2={W}
        y2={BASE}
        stroke="#dcdcd6"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />

      {/* area + lines */}
      <path d={areaPath} fill="url(#mkt-fill)" />
      <path
        d={maPath}
        fill="none"
        stroke="#d3d3cd"
        strokeWidth="1.5"
        strokeDasharray="5 5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={linePath}
        fill="none"
        stroke="#b6b6af"
        strokeWidth="2.25"
        vectorEffect="non-scaling-stroke"
      />

      {/* red level marker + endpoint */}
      <line
        x1="0"
        y1={last[1]}
        x2={W}
        y2={last[1]}
        stroke="#e11d2a"
        strokeWidth="1"
        strokeDasharray="4 4"
        opacity="0.4"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r="5.5" fill="#e11d2a" />
      <circle cx={last[0]} cy={last[1]} r="11" fill="#e11d2a" opacity="0.18" />
    </svg>
  );
}
