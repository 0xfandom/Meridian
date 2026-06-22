"use client";

import { useCallback, useState } from "react";
import { parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { USDC_DECIMALS, erc20Abi, poolAbi } from "./contracts";
import { useDeployment } from "./use-deployment";
import { useWallet } from "./use-wallet";

export type TxPhase = "idle" | "approving" | "depositing" | "withdrawing" | "success" | "error";

/// On-chain lender actions against the pool. deposit() approves USDC first when the pool's
/// allowance is short, then deposits; withdraw() pulls assets back to the wallet. `phase` drives the
/// modal's status UI; `onSuccess` (e.g. a refetch trigger) runs after a confirmed receipt.
export interface PoolActions {
  phase: TxPhase;
  error?: string;
  txHash?: `0x${string}`;
  deposit: (amount: number) => Promise<void>;
  withdraw: (amount: number) => Promise<void>;
  reset: () => void;
}

export function usePoolActions(onSuccess?: () => void): PoolActions {
  const { address } = useWallet();
  const deployment = useDeployment();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<TxPhase>("idle");
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<`0x${string}`>();

  const usdc = deployment?.addresses.usdc as `0x${string}` | undefined;
  const pool = deployment?.addresses.pool as `0x${string}` | undefined;

  const reset = useCallback(() => {
    setPhase("idle");
    setError(undefined);
    setTxHash(undefined);
  }, []);

  const deposit = useCallback(
    async (amount: number) => {
      if (!address || !usdc || !pool || !publicClient) return;
      const assets = parseUnits(amount.toString(), USDC_DECIMALS);
      try {
        setError(undefined);
        const allowance = await publicClient.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, pool],
        });
        if (allowance < assets) {
          setPhase("approving");
          const approveHash = await writeContractAsync({
            address: usdc,
            abi: erc20Abi,
            functionName: "approve",
            args: [pool, assets],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
        setPhase("depositing");
        const hash = await writeContractAsync({
          address: pool,
          abi: poolAbi,
          functionName: "deposit",
          args: [assets, address],
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        setPhase("success");
        onSuccess?.();
      } catch (e) {
        setError(toMessage(e));
        setPhase("error");
      }
    },
    [address, usdc, pool, publicClient, writeContractAsync, onSuccess],
  );

  const withdraw = useCallback(
    async (amount: number) => {
      if (!address || !pool || !publicClient) return;
      const assets = parseUnits(amount.toString(), USDC_DECIMALS);
      try {
        setError(undefined);
        setPhase("withdrawing");
        const hash = await writeContractAsync({
          address: pool,
          abi: poolAbi,
          functionName: "withdraw",
          args: [assets, address, address],
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        setPhase("success");
        onSuccess?.();
      } catch (e) {
        setError(toMessage(e));
        setPhase("error");
      }
    },
    [address, pool, publicClient, writeContractAsync, onSuccess],
  );

  return { phase, error, txHash, deposit, withdraw, reset };
}

function toMessage(e: unknown): string {
  if (e && typeof e === "object" && "shortMessage" in e) {
    return String((e as { shortMessage: unknown }).shortMessage);
  }
  return e instanceof Error ? e.message : "Transaction failed";
}
