"use client";

import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { USDC_DECIMALS, WETH_DECIMALS, erc20Abi } from "./contracts";
import { useDeployment } from "./use-deployment";
import { useWallet } from "./use-wallet";

/// The connected wallet's spendable token balances in display units (not raw wei). Null until a
/// wallet is connected and the deployment addresses are known, so callers fall back to placeholders
/// in demo mode or while loading.
export interface WalletBalances {
  usdc: number;
  weth: number;
}

export function useWalletBalances(pollMs = 8000): WalletBalances | null {
  const { address, isConnected } = useWallet();
  const deployment = useDeployment();
  const usdc = deployment?.addresses.usdc as `0x${string}` | undefined;
  const weth = deployment?.addresses.weth as `0x${string}` | undefined;

  const enabled = Boolean(isConnected && address && usdc && weth);

  const { data } = useReadContracts({
    query: { enabled, refetchInterval: pollMs },
    contracts:
      enabled && address
        ? [
            { address: usdc!, abi: erc20Abi, functionName: "balanceOf", args: [address] },
            { address: weth!, abi: erc20Abi, functionName: "balanceOf", args: [address] },
          ]
        : [],
  });

  if (!data) return null;
  const [usdcRes, wethRes] = data;
  if (usdcRes?.status !== "success" || wethRes?.status !== "success") return null;

  return {
    usdc: Number(formatUnits(usdcRes.result as bigint, USDC_DECIMALS)),
    weth: Number(formatUnits(wethRes.result as bigint, WETH_DECIMALS)),
  };
}
