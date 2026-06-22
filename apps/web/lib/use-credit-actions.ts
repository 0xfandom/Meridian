"use client";

import { useCallback, useState } from "react";
import { parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { USDC_DECIMALS, WETH_DECIMALS, creditFacadeAbi, erc20Abi } from "./contracts";
import { useDeployment } from "./use-deployment";
import { useWallet } from "./use-wallet";

export type CreditPhase = "idle" | "approving" | "opening" | "success" | "error";

/// On-chain borrower actions. open() approves the credit manager to pull the WETH collateral when
/// its allowance is short, then opens a margin account that posts the collateral and draws the
/// requested USDC in one call. `phase` drives the modal's status UI; `onSuccess` (e.g. a refetch
/// trigger) runs after a confirmed receipt.
export interface CreditActions {
  phase: CreditPhase;
  error?: string;
  txHash?: `0x${string}`;
  open: (collateralWeth: number, borrowUsdc: number) => Promise<void>;
  reset: () => void;
}

export function useCreditActions(onSuccess?: () => void): CreditActions {
  const { address } = useWallet();
  const deployment = useDeployment();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<CreditPhase>("idle");
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<`0x${string}`>();

  const weth = deployment?.addresses.weth as `0x${string}` | undefined;
  const creditManager = deployment?.addresses.creditManager as `0x${string}` | undefined;
  const facade = deployment?.addresses.creditFacade as `0x${string}` | undefined;

  const reset = useCallback(() => {
    setPhase("idle");
    setError(undefined);
    setTxHash(undefined);
  }, []);

  const open = useCallback(
    async (collateralWeth: number, borrowUsdc: number) => {
      if (!address || !weth || !creditManager || !facade || !publicClient) return;
      const collateral = parseUnits(collateralWeth.toString(), WETH_DECIMALS);
      const borrow = parseUnits(borrowUsdc.toString(), USDC_DECIMALS);
      try {
        setError(undefined);
        // The credit manager pulls the collateral, so the borrower approves it (not the facade).
        const allowance = await publicClient.readContract({
          address: weth,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, creditManager],
        });
        if (allowance < collateral) {
          setPhase("approving");
          const approveHash = await writeContractAsync({
            address: weth,
            abi: erc20Abi,
            functionName: "approve",
            args: [creditManager, collateral],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
        setPhase("opening");
        const hash = await writeContractAsync({
          address: facade,
          abi: creditFacadeAbi,
          functionName: "openCreditAccount",
          args: [collateral, borrow],
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
    [address, weth, creditManager, facade, publicClient, writeContractAsync, onSuccess],
  );

  return { phase, error, txHash, open, reset };
}

function toMessage(e: unknown): string {
  if (e && typeof e === "object" && "shortMessage" in e) {
    return String((e as { shortMessage: unknown }).shortMessage);
  }
  return e instanceof Error ? e.message : "Transaction failed";
}
