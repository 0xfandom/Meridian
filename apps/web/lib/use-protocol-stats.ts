"use client";

import { useEffect, useState } from "react";
import { getAccounts, getPool } from "./api";

const USDC = 1_000_000; // the pool asset has 6 decimals

/// Headline protocol stats in display units (USDC, account count), polled from the backend API.
/// Returns null until the first successful fetch and stays null when the API is unreachable, so
/// callers can fall back to placeholder values offline (CI build, no local node).
export interface ProtocolStats {
  tvl: number;
  openInterest: number;
  accounts: number;
  utilization: number; // borrowed / deposited, 0..1
  collateralPrice: number; // oracle price of the collateral asset, in USDC
}

export function useProtocolStats(pollMs = 8000): ProtocolStats | null {
  const [stats, setStats] = useState<ProtocolStats | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        const [pool, accounts] = await Promise.all([
          getPool(controller.signal),
          getAccounts(controller.signal),
        ]);
        if (!active) return;
        setStats({
          tvl: Number(pool.totalDeposited) / USDC,
          openInterest: Number(pool.totalBorrowed) / USDC,
          accounts: accounts.length,
          utilization: Number(pool.utilizationWad) / 1e18,
          collateralPrice: Number(pool.collateralPriceUsdc) / USDC,
        });
      } catch {
        // Unreachable API: leave stats null so the caller keeps its placeholder values.
      }
    };

    void load();
    const id = setInterval(() => void load(), pollMs);
    return () => {
      active = false;
      controller.abort();
      clearInterval(id);
    };
  }, [pollMs]);

  return stats;
}
