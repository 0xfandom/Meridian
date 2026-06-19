"use client";

// Premium brushed-metal cards drifting around the centred hero, Revolut-style.
// Clean faces: metallic gradient + soft sheen + one frosted square + wordmark.
// Each card has a fixed 3D tilt (inner) plus a gentle translate float (outer).
//
// Cursor interaction (per card):
//  - Tilt-follow: card rotates toward the pointer on top of its base tilt.
//  - Sheen sweep: a bright diagonal streak tracks the pointer's X.
//  - Lift + shadow grow: translateZ raise with a deeper drop shadow.
//  - Glare spot: a radial highlight follows the pointer position.
// Float pauses while hovered; everything snaps back smoothly on leave.

import { useRef, useState } from "react";

type Card = {
  left: number; // % within hero
  top: number; // %
  w: number; // px width (1.585 credit-card ratio)
  tilt: string; // static 3D transform
  grad: string; // metallic face gradient
  light: boolean; // light face → dark wordmark
  anim: string;
  dur: number;
  delay: number;
  z: number;
};

const CARDS: Card[] = [
  {
    left: 16,
    top: 15,
    w: 330,
    tilt: "rotateX(34deg) rotateY(-15deg) rotateZ(-9deg)",
    grad: "linear-gradient(150deg,#62656b 0%,#3c3f44 42%,#212327 100%)",
    light: false,
    anim: "fc1",
    dur: 18,
    delay: -2,
    z: 12,
  },
  {
    left: 64,
    top: 13,
    w: 330,
    tilt: "rotateX(20deg) rotateY(38deg) rotateZ(-20deg)",
    grad: "linear-gradient(150deg,#ff5a60 0%,#e21e29 46%,#9e1018 100%)",
    light: false,
    anim: "fc2",
    dur: 20,
    delay: -7,
    z: 12,
  },
  {
    left: 3,
    top: 55,
    w: 320,
    tilt: "rotateX(46deg) rotateY(15deg) rotateZ(13deg)",
    grad: "linear-gradient(150deg,#f3f4f6 0%,#d0d3d9 48%,#abb1ba 100%)",
    light: true,
    anim: "fc3",
    dur: 22,
    delay: -11,
    z: 11,
  },
  {
    left: 63,
    top: 64,
    w: 288,
    tilt: "rotateX(32deg) rotateY(-12deg) rotateZ(-19deg)",
    grad: "linear-gradient(150deg,#f4edd9 0%,#ddd0a9 50%,#c4b588 100%)",
    light: true,
    anim: "fc1",
    dur: 19,
    delay: -4,
    z: 10,
  },
  {
    left: 76,
    top: 69,
    w: 288,
    tilt: "rotateX(27deg) rotateY(-20deg) rotateZ(-11deg)",
    grad: "linear-gradient(150deg,#f3f4f6 0%,#d0d3d9 46%,#abb1ba 100%)",
    light: true,
    anim: "fc2",
    dur: 21,
    delay: -9,
    z: 11,
  },
];

type Pt = { x: number; y: number };

function Face({ c, hover, pt }: { c: Card; hover: boolean; pt: Pt }) {
  const text = c.light ? "rgba(30,30,30,0.55)" : "rgba(255,255,255,0.78)";
  return (
    <div
      style={{
        width: c.w,
        aspectRatio: "1.585",
        borderRadius: 22,
        background: c.grad,
        boxShadow: hover
          ? "0 64px 104px -30px rgba(0,0,0,0.62), 0 26px 52px -18px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -2px 3px rgba(0,0,0,0.25)"
          : "0 40px 70px -28px rgba(0,0,0,0.55), 0 12px 26px -16px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -2px 3px rgba(0,0,0,0.25)",
        transition: "box-shadow 0.3s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* brushed-metal soft diagonal sheen (base) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(118deg, rgba(255,255,255,0) 24%, rgba(255,255,255,0.30) 44%, rgba(255,255,255,0.05) 52%, rgba(255,255,255,0) 70%)",
        }}
      />
      {/* sheen sweep — bright streak tracks pointer X */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(118deg, transparent 38%, rgba(255,255,255,0.55) 50%, transparent 62%)",
          transform: `translateX(${(pt.x - 0.5) * 130}%)`,
          opacity: hover ? 1 : 0,
          transition: hover ? "opacity 0.2s ease" : "opacity 0.4s ease, transform 0.5s ease",
        }}
      />
      {/* top corner glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(130% 90% at 16% -8%, rgba(255,255,255,0.32), transparent 56%)",
        }}
      />
      {/* glare spot — radial highlight follows pointer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at ${pt.x * 100}% ${pt.y * 100}%, rgba(255,255,255,0.5), transparent 42%)`,
          opacity: hover ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
      />
      {/* frosted square (EMV) */}
      <div
        style={{
          position: "absolute",
          left: "62%",
          top: "20%",
          width: "13%",
          height: "20%",
          borderRadius: 7,
          background: c.light
            ? "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(220,220,220,0.7))"
            : "linear-gradient(135deg, rgba(255,255,255,0.85), rgba(255,255,255,0.35))",
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
      {/* wordmark */}
      <span
        style={{
          position: "absolute",
          left: "8%",
          bottom: "16%",
          fontFamily: "var(--font-mono), monospace",
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: text,
          fontSize: c.w * 0.078,
        }}
      >
        Meridian
      </span>
    </div>
  );
}

function CardItem({ c }: { c: Card }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [pt, setPt] = useState<Pt>({ x: 0.5, y: 0.5 });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPt({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  };

  // rotate toward the cursor on top of the base tilt
  const MAX = 18;
  const ry = hover ? (pt.x - 0.5) * 2 * MAX : 0;
  const rx = hover ? -(pt.y - 0.5) * 2 * MAX : 0;

  return (
    <div
      className="absolute"
      style={{
        left: `${c.left}%`,
        top: `${c.top}%`,
        zIndex: hover ? 30 : c.z,
        perspective: "1300px", // gentle, realistic foreshorten (no warp)
        animation: `${c.anim} ${c.dur}s ease-in-out ${c.delay}s infinite`,
        animationPlayState: hover ? "paused" : "running",
      }}
    >
      <div
        ref={ref}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => {
          setHover(false);
          setPt({ x: 0.5, y: 0.5 });
        }}
        onMouseMove={onMove}
        style={{
          transform: `${c.tilt} rotateX(${rx}deg) rotateY(${ry}deg) translateZ(${hover ? 70 : 0}px)`,
          transformStyle: "preserve-3d",
          transition: hover
            ? "transform 0.12s ease-out"
            : "transform 0.55s cubic-bezier(.2,.7,.2,1)",
          pointerEvents: "auto",
          cursor: "pointer",
        }}
      >
        <Face c={c} hover={hover} pt={pt} />
      </div>
    </div>
  );
}

export function HeroCards() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block">
      {CARDS.map((c, i) => (
        <CardItem key={i} c={c} />
      ))}
    </div>
  );
}
