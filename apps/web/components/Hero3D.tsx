"use client";

import dynamic from "next/dynamic";

const Scene = dynamic(() => import("@/components/Scene").then((m) => m.Scene), {
  ssr: false,
});

export function Hero3D({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Scene />
    </div>
  );
}
