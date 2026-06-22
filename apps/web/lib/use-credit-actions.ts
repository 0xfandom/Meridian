"use client";

import { useCallback, useState } from "react";
import { type Abi, encodeFunctionData, parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import {
  POOL_FEE,
  USDC_DECIMALS,
  WETH_DECIMALS,
  creditFacadeAbi,
  creditManagerAbi,
  erc20Abi,
  swapAdapterAbi,
} from "./contracts";
import { useDeployment } from "./use-deployment";
import { useWallet } from "./use-wallet";

export type CreditPhase =
  | "idle"
  | "approving"
  | "opening"
  | "borrowing"
  | "repaying"
  | "adding"
  | "withdrawing"
  | "trading"
  | "closing"
  | "success"
  | "error";

/// On-chain borrower actions. open() approves the credit manager to pull the WETH collateral when
/// its allowance is short, then opens a margin account that posts the collateral and draws the
/// requested USDC in one call. The manage actions adjust an existing account: borrow/repay move
/// debt (repayment is funded by the USDC the account already holds, so no approval), addCollateral
/// pulls WETH from the wallet (approval needed), withdrawCollateral returns WETH to the wallet, and
/// close repays from the account and returns the rest. `phase` drives status UI; `onSuccess`
/// (e.g. a refetch trigger) runs after a confirmed receipt.
export interface CreditActions {
  phase: CreditPhase;
  error?: string;
  txHash?: `0x${string}`;
  open: (collateralWeth: number, borrowUsdc: number) => Promise<void>;
  borrow: (account: `0x${string}`, amountUsdc: number) => Promise<void>;
  repay: (account: `0x${string}`, amountUsdc: number) => Promise<void>;
  addCollateral: (account: `0x${string}`, amountWeth: number) => Promise<void>;
  withdrawCollateral: (account: `0x${string}`, amountWeth: number) => Promise<void>;
  lever: (account: `0x${string}`, amountUsdc: number) => Promise<void>;
  close: (account: `0x${string}`) => Promise<void>;
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
  const usdc = deployment?.addresses.usdc as `0x${string}` | undefined;
  const creditManager = deployment?.addresses.creditManager as `0x${string}` | undefined;
  const facade = deployment?.addresses.creditFacade as `0x${string}` | undefined;
  const swapAdapter = deployment?.addresses.swapAdapter as `0x${string}` | undefined;

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

  // Sends a single write, tracks the phase, waits for the receipt, then fires onSuccess. Used by
  // every manage action; opening is separate because it may also approve first.
  const send = useCallback(
    async (
      busy: CreditPhase,
      call: { address: `0x${string}`; abi: Abi; functionName: string; args: unknown[] },
    ) => {
      if (!publicClient) return;
      try {
        setError(undefined);
        setPhase(busy);
        const hash = await writeContractAsync(call as never);
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        setPhase("success");
        onSuccess?.();
      } catch (e) {
        setError(toMessage(e));
        setPhase("error");
      }
    },
    [publicClient, writeContractAsync, onSuccess],
  );

  const borrow = useCallback(
    async (account: `0x${string}`, amountUsdc: number) => {
      if (!facade) return;
      await send("borrowing", {
        address: facade,
        abi: creditFacadeAbi,
        functionName: "increaseDebt",
        args: [account, parseUnits(amountUsdc.toString(), USDC_DECIMALS)],
      });
    },
    [facade, send],
  );

  const repay = useCallback(
    async (account: `0x${string}`, amountUsdc: number) => {
      if (!facade) return;
      await send("repaying", {
        address: facade,
        abi: creditFacadeAbi,
        functionName: "decreaseDebt",
        args: [account, parseUnits(amountUsdc.toString(), USDC_DECIMALS)],
      });
    },
    [facade, send],
  );

  const withdrawCollateral = useCallback(
    async (account: `0x${string}`, amountWeth: number) => {
      if (!facade || !address) return;
      await send("withdrawing", {
        address: facade,
        abi: creditFacadeAbi,
        functionName: "withdrawCollateral",
        args: [account, parseUnits(amountWeth.toString(), WETH_DECIMALS), address],
      });
    },
    [facade, address, send],
  );

  // Lever up: swap the account's drawn USDC into WETH collateral through the whitelisted adapter,
  // batched so the account approves the adapter and swaps in one health-checked multicall.
  const lever = useCallback(
    async (account: `0x${string}`, amountUsdc: number) => {
      if (!facade || !usdc || !weth || !swapAdapter) return;
      const amount = parseUnits(amountUsdc.toString(), USDC_DECIMALS);
      const approveCall = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [swapAdapter, amount],
      });
      const swapCall = encodeFunctionData({
        abi: swapAdapterAbi,
        functionName: "swapExactInputSingle",
        args: [usdc, weth, POOL_FEE, amount, 0n],
      });
      await send("trading", {
        address: facade,
        abi: creditFacadeAbi,
        functionName: "multicall",
        args: [
          account,
          [
            { target: usdc, callData: approveCall },
            { target: swapAdapter, callData: swapCall },
          ],
        ],
      });
    },
    [facade, usdc, weth, swapAdapter, send],
  );

  const close = useCallback(
    async (account: `0x${string}`) => {
      if (!facade) return;
      await send("closing", {
        address: facade,
        abi: creditFacadeAbi,
        functionName: "closeCreditAccount",
        args: [account],
      });
    },
    [facade, send],
  );

  // addCollateral pulls WETH from the wallet, so approve the credit manager first when short.
  const addCollateral = useCallback(
    async (account: `0x${string}`, amountWeth: number) => {
      if (!address || !weth || !creditManager || !publicClient) return;
      const amount = parseUnits(amountWeth.toString(), WETH_DECIMALS);
      try {
        setError(undefined);
        const allowance = await publicClient.readContract({
          address: weth,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, creditManager],
        });
        if (allowance < amount) {
          setPhase("approving");
          const approveHash = await writeContractAsync({
            address: weth,
            abi: erc20Abi,
            functionName: "approve",
            args: [creditManager, amount],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
        await send("adding", {
          address: creditManager,
          abi: creditManagerAbi,
          functionName: "addCollateral",
          args: [account, amount],
        });
      } catch (e) {
        setError(toMessage(e));
        setPhase("error");
      }
    },
    [address, weth, creditManager, publicClient, writeContractAsync, send],
  );

  return {
    phase,
    error,
    txHash,
    open,
    borrow,
    repay,
    addCollateral,
    withdrawCollateral,
    lever,
    close,
    reset,
  };
}

function toMessage(e: unknown): string {
  if (e && typeof e === "object" && "shortMessage" in e) {
    return String((e as { shortMessage: unknown }).shortMessage);
  }
  return e instanceof Error ? e.message : "Transaction failed";
}
