"use client";

import { formatUnits } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { USDC_DECIMALS, poolAbi } from "./contracts";
import { useDeployment } from "./use-deployment";
import { useWallet } from "./use-wallet";

/// The connected wallet's lender position in the pool, in display units. `supplied` is the full
/// value of the wallet's pool shares (principal + accrued interest via convertToAssets);
/// `maxWithdraw` is what can be withdrawn right now, capped by the pool's idle liquidity. Null in
/// demo mode or while loading, so callers fall back to placeholder figures.
export interface LenderPosition {
  shares: bigint;
  supplied: number;
  maxWithdraw: number;
}

export function useLenderPosition(pollMs = 8000): LenderPosition | null {
  const { address, isConnected } = useWallet();
  const deployment = useDeployment();
  const pool = deployment?.addresses.pool as `0x${string}` | undefined;
  const enabled = Boolean(isConnected && address && pool);

  const { data } = useReadContracts({
    query: { enabled, refetchInterval: pollMs },
    contracts:
      enabled && address && pool
        ? [
            { address: pool, abi: poolAbi, functionName: "balanceOf", args: [address] },
            { address: pool, abi: poolAbi, functionName: "maxWithdraw", args: [address] },
          ]
        : [],
  });

  const sharesRes = data?.[0];
  const maxRes = data?.[1];
  const shares = sharesRes?.status === "success" ? (sharesRes.result as bigint) : undefined;

  // Valuing shares needs the share count as an argument, so this read is chained on the balance.
  const { data: assetsData } = useReadContract({
    address: pool,
    abi: poolAbi,
    functionName: "convertToAssets",
    args: shares !== undefined ? [shares] : undefined,
    query: { enabled: enabled && shares !== undefined && shares > 0n, refetchInterval: pollMs },
  });

  if (shares === undefined || maxRes?.status !== "success") return null;

  const supplied =
    shares === 0n ? 0 : Number(formatUnits((assetsData ?? 0n) as bigint, USDC_DECIMALS));
  return {
    shares,
    supplied,
    maxWithdraw: Number(formatUnits(maxRes.result as bigint, USDC_DECIMALS)),
  };
}
