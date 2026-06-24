"use client";

import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { USDC_DECIMALS, erc20Abi } from "./contracts";
import { useDeployment } from "./use-deployment";
import { useMarkets } from "./use-markets";
import { useWallet } from "./use-wallet";

/// A single collateral asset held by the wallet, valued at its live oracle mark.
export interface CollateralBalance {
  symbol: string;
  token: string;
  decimals: number;
  amount: number; // display units
  priceUsdc: number; // live mark, display units
}

/// The connected wallet's spendable token balances in display units (not raw wei). Null until a
/// wallet is connected and the deployment/markets are known, so callers fall back to placeholders in
/// demo mode or while loading. `collaterals` carries one entry per market collateral.
export interface WalletBalances {
  usdc: number;
  collaterals: CollateralBalance[];
}

export function useWalletBalances(pollMs = 8000): WalletBalances | null {
  const { address, isConnected } = useWallet();
  const deployment = useDeployment();
  const markets = useMarkets();
  const usdc = deployment?.addresses.usdc as `0x${string}` | undefined;

  const enabled = Boolean(isConnected && address && usdc && markets && markets.length > 0);

  const { data } = useReadContracts({
    query: { enabled, refetchInterval: pollMs },
    contracts:
      enabled && address && markets
        ? [
            { address: usdc!, abi: erc20Abi, functionName: "balanceOf", args: [address] },
            ...markets.map((m) => ({
              address: m.collateralToken as `0x${string}`,
              abi: erc20Abi,
              functionName: "balanceOf" as const,
              args: [address] as const,
            })),
          ]
        : [],
  });

  if (!data || !markets) return null;
  const [usdcRes, ...collateralRes] = data;
  if (usdcRes?.status !== "success") return null;

  const collaterals: CollateralBalance[] = markets.map((m, i) => {
    const res = collateralRes[i];
    const amount =
      res?.status === "success" ? Number(formatUnits(res.result as bigint, m.decimals)) : 0;
    return {
      symbol: m.symbol,
      token: m.collateralToken,
      decimals: m.decimals,
      amount,
      priceUsdc: Number(formatUnits(BigInt(m.priceUsdc), USDC_DECIMALS)),
    };
  });

  return {
    usdc: Number(formatUnits(usdcRes.result as bigint, USDC_DECIMALS)),
    collaterals,
  };
}

/// Looks up a collateral balance by token address (case-insensitive).
export function collateralByToken(
  balances: WalletBalances | null,
  token: string | undefined,
): CollateralBalance | undefined {
  if (!balances || !token) return undefined;
  const target = token.toLowerCase();
  return balances.collaterals.find((c) => c.token.toLowerCase() === target);
}
