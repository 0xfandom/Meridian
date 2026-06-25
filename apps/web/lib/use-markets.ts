"use client";

import { useQuery } from "@tanstack/react-query";
import { type MarketView, getMarkets } from "./api";

/// Fetches the deployment's credit markets (collateral assets and their contracts) with the live
/// oracle mark for each. Polls so prices stay current. Returns undefined while loading and an empty
/// array when the API has no markets, so callers can gate market-scoped reads on a resolved list.
export function useMarkets(pollMs = 8000): MarketView[] | undefined {
  const { data } = useQuery({
    queryKey: ["markets"],
    queryFn: ({ signal }) => getMarkets(signal),
    refetchInterval: pollMs,
    retry: false,
  });
  return data;
}

/// Resolves a market by collateral token address (case-insensitive), or undefined when not found.
export function findMarket(
  markets: MarketView[] | undefined,
  collateralToken: string | undefined,
): MarketView | undefined {
  if (!markets || !collateralToken) return undefined;
  const target = collateralToken.toLowerCase();
  return markets.find((m) => m.collateralToken.toLowerCase() === target);
}

/// Resolves a market by its credit manager (case-insensitive). Preferred over findMarket for an
/// account: a basket market shares its primary collateral token with a single-collateral market, so
/// the credit manager is the unambiguous key.
export function findMarketByManager(
  markets: MarketView[] | undefined,
  creditManager: string | undefined,
): MarketView | undefined {
  if (!markets || !creditManager) return undefined;
  const target = creditManager.toLowerCase();
  return markets.find((m) => m.creditManager.toLowerCase() === target);
}
