"use client";

import dynamic from "next/dynamic";

// WebGL canvas must never SSR — load client-only.
const CoinCanvas = dynamic(() => import("./coin-canvas").then((m) => m.CoinCanvas), {
  ssr: false,
  loading: () => null,
});

export function CoinHero() {
  return (
    <div className="absolute inset-0">
      <CoinCanvas />
    </div>
  );
}
