"use client";

// Client-side providers shared by the whole app: wagmi (wallet + chain) and TanStack Query, which
// wagmi uses for its async state. Kept in one client component so the root layout can stay a server
// component.

import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per mount; useState keeps it stable across re-renders without recreating it.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
