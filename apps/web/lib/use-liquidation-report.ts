"use client";

import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { getLiquidations } from "./api";
import { USDC_DECIMALS } from "./contracts";
import { useAccounts } from "./use-accounts";
import { findMarket, useMarkets } from "./use-markets";
import { useWallet } from "./use-wallet";

/// A read-only post-mortem of the connected wallet's most recent liquidation: what was seized, what
/// debt the pool recovered, who liquidated it, and where to find it on-chain.
export interface LiquidationReport {
  account: `0x${string}`;
  symbol: string;
  collateralSeized: number; // display units
  debtRepaid: number; // USDC
  liquidator: `0x${string}`;
  blockNumber: number;
  txHash: `0x${string}`;
}

/// Builds the liquidation report for the connected wallet, or null when it has none. Joins the
/// wallet's liquidated accounts (for the market) with the recorded liquidation events (for the
/// economic detail), and returns the most recent. undefined while loading.
export function useLiquidationReport(pollMs = 8000): LiquidationReport | null | undefined {
  const { address, isConnected } = useWallet();
  const accounts = useAccounts();
  const markets = useMarkets();
  const { data: liquidations } = useQuery({
    queryKey: ["liquidations"],
    queryFn: ({ signal }) => getLiquidations(signal),
    refetchInterval: pollMs,
    retry: false,
  });

  if (!isConnected || !address) return null;
  if (accounts === null || !liquidations) return undefined; // loading

  // The wallet's liquidated accounts, joined to their liquidation record by account address.
  const mine = accounts.filter(
    (a) => a.owner.toLowerCase() === address.toLowerCase() && a.liquidated,
  );
  if (mine.length === 0) return null;

  const byAccount = new Map(liquidations.map((l) => [l.account.toLowerCase(), l]));

  const reports: LiquidationReport[] = [];
  for (const account of mine) {
    const record = byAccount.get(account.account.toLowerCase());
    if (!record) continue;
    const market = findMarket(markets, account.collateralToken);
    const decimals = market?.decimals ?? 18;
    reports.push({
      account: account.account as `0x${string}`,
      symbol: market?.symbol ?? account.symbol ?? "",
      collateralSeized: Number(formatUnits(BigInt(record.collateralSeized), decimals)),
      debtRepaid: Number(formatUnits(BigInt(record.debtRepaid), USDC_DECIMALS)),
      liquidator: record.liquidator as `0x${string}`,
      blockNumber: Number(record.blockNumber),
      txHash: record.txHash as `0x${string}`,
    });
  }
  if (reports.length === 0) return null;

  // Most recent first.
  reports.sort((a, b) => b.blockNumber - a.blockNumber);
  return reports[0]!;
}
