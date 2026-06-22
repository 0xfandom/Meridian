"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { LOCAL_CHAIN } from "./wagmi";

/// Thin wrapper over wagmi's account hooks for the UI: connect via the browser's injected wallet,
/// disconnect, and surface the connected address, chain, and a short display form. `wrongNetwork`
/// is true when a wallet is connected but pointed at a chain other than the local node, so the UI
/// can prompt the user to switch.
export interface WalletState {
  address?: `0x${string}`;
  shortAddress?: string;
  isConnected: boolean;
  isConnecting: boolean;
  chainId?: number;
  wrongNetwork: boolean;
  hasInjected: boolean;
  connectInjected: () => void;
  disconnectWallet: () => void;
}

export function shortenAddress(address?: string): string | undefined {
  if (!address) return undefined;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function useWallet(): WalletState {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  // The injected connector is registered in wagmiConfig; fall back to a fresh one if the registry
  // is empty (keeps the call defined even before connectors hydrate).
  const injectedConnector = connectors.find((c) => c.type === "injected") ?? injected();
  const hasInjected =
    typeof window !== "undefined" && Boolean((window as { ethereum?: unknown }).ethereum);

  return {
    address,
    shortAddress: shortenAddress(address),
    isConnected,
    isConnecting: isPending,
    chainId,
    wrongNetwork: isConnected && chainId !== undefined && chainId !== LOCAL_CHAIN.id,
    hasInjected,
    connectInjected: () => connect({ connector: injectedConnector }),
    disconnectWallet: () => disconnect(),
  };
}
