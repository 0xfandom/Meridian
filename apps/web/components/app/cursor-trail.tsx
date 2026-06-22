"use client";

// Small brand cards trail the cursor in a follow-the-leader chain: card[0] eases
// toward the pointer, card[i] eases toward card[i-1]. While moving they spread
// into a trail; when the pointer stops, each catches up to the one ahead so they
// all collapse onto the cursor (stacked / hidden behind the lead card).
// rAF + refs only — writes transforms straight to the DOM, no React re-renders.

import { useEffect, useRef } from "react";

const N = 6;
const LEAD_EASE = 1; // lead card sits exactly on the pointer (acts as the cursor)
const TAIL_EASE = 0.1; // the rest trail slowly behind it

export function CursorTrail() {
  const els = useRef<(HTMLDivElement | null)[]>([]);
  const mouse = useRef({ x: -200, y: -200 });
  const pos = useRef(Array.from({ length: N }, () => ({ x: -200, y: -200 })));

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove);

    // hide the native arrow cursor — the lead card becomes the cursor
    const root = document.documentElement;
    const prevCursor = root.style.cursor;
    root.style.cursor = "none";

    let raf = 0;
    const tick = () => {
      let leadX = mouse.current.x;
      let leadY = mouse.current.y;
      for (let i = 0; i < N; i++) {
        const p = pos.current[i];
        const ease = i === 0 ? LEAD_EASE : TAIL_EASE;
        p.x += (leadX - p.x) * ease;
        p.y += (leadY - p.y) * ease;
        const el = els.current[i];
        if (el) {
          const rot = (i - 2) * 9;
          const scale = 1 - i * 0.07;
          el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;
        }
        leadX = p.x;
        leadY = p.y;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
      root.style.cursor = prevCursor;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] hidden lg:block">
      {Array.from({ length: N }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            els.current[i] = el;
          }}
          className="absolute left-0 top-0 overflow-hidden"
          style={{
            width: 40,
            height: 25,
            borderRadius: 5,
            zIndex: N - i,
            opacity: 1 - i * 0.11,
            border: "1px solid rgba(255,255,255,0.5)",
            boxShadow: "0 6px 13px -6px rgba(10,10,10,0.5)",
            background:
              i % 2 === 0
                ? "linear-gradient(135deg,#ff5a60,#e11d2a)"
                : "linear-gradient(135deg,#2a2a2a,#0a0a0a)",
            willChange: "transform",
          }}
        >
          {/* sheen */}
          <span
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(118deg,transparent 35%,rgba(255,255,255,0.22) 48%,transparent 60%)",
            }}
          />
          {/* chip */}
          <span
            style={{
              position: "absolute",
              left: 5,
              top: 5,
              width: 7,
              height: 5,
              borderRadius: 1.5,
              background: "linear-gradient(135deg,#ffffff,rgba(255,255,255,0.45))",
            }}
          />
          {/* wordmark */}
          <span
            style={{
              position: "absolute",
              left: 5,
              bottom: 3,
              fontFamily: "var(--font-sans), system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 4.4,
              letterSpacing: 0.1,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            Meridian
          </span>
          {/* digits */}
          <span
            style={{
              position: "absolute",
              right: 5,
              bottom: 3,
              fontFamily: "var(--font-mono), monospace",
              fontSize: 4.2,
              letterSpacing: 0.3,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            ••2847
          </span>
        </div>
      ))}
    </div>
  );
}
