// wagmi configuration for the local-first stack. The app talks to the anvil node that `dev-up`
// starts (chain id 31337, JSON-RPC on 127.0.0.1:8545), using the browser's injected wallet
// (MetaMask, Rabby, Coinbase Wallet, etc.). The RPC URL is overridable so the same build can point
// at a hosted chain later.

import { createConfig, http } from "wagmi";
import { foundry } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// The local chain the seed/deploy scripts target. `foundry` is viem's built-in 31337 definition;
// we only override the transport URL so a hosted RPC can be supplied via env at build time.
export const LOCAL_CHAIN = foundry;

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

export const wagmiConfig = createConfig({
  chains: [LOCAL_CHAIN],
  connectors: [injected()],
  transports: {
    [LOCAL_CHAIN.id]: http(RPC_URL),
  },
  // The app renders on the server first (Next.js app router); ssr keeps wagmi from touching the
  // wallet during that pass and hydrates cleanly on the client.
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
