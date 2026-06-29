"use client";

import { useCallback, useState } from "react";
import { type Abi, encodeFunctionData, parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import type { MarketView } from "./api";
import {
  POOL_FEE,
  USDC_DECIMALS,
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

/// On-chain borrower actions, scoped to a single credit market. open() approves the market's credit
/// manager to pull the collateral when its allowance is short, then opens a margin account that posts
/// the collateral and draws the requested USDC in one call. The manage actions adjust an existing
/// account: borrow/repay move debt (repayment is funded by the USDC the account already holds, so no
/// approval), addCollateral pulls collateral from the wallet (approval needed), withdrawCollateral
/// returns it to the wallet, lever swaps drawn USDC into more collateral through the market's
/// whitelisted adapter, and close repays from the account and returns the rest. `phase` drives status
/// UI; `onSuccess` (e.g. a refetch trigger) runs after a confirmed receipt.
///
/// Pass the market the action concerns: the selected market for opening, or the account's own market
/// for managing an existing position.
export interface CreditActions {
  phase: CreditPhase;
  error?: string;
  txHash?: `0x${string}`;
  open: (collateralAmount: number, borrowUsdc: number) => Promise<void>;
  borrow: (account: `0x${string}`, amountUsdc: number) => Promise<void>;
  repay: (account: `0x${string}`, amountUsdc: number) => Promise<void>;
  addCollateral: (account: `0x${string}`, amount: number) => Promise<void>;
  withdrawCollateral: (account: `0x${string}`, amount: number) => Promise<void>;
  lever: (account: `0x${string}`, amountUsdc: number) => Promise<void>;
  close: (account: `0x${string}`) => Promise<void>;
  reset: () => void;
}

export function useCreditActions(
  market: MarketView | undefined,
  onSuccess?: () => void,
): CreditActions {
  const { address } = useWallet();
  const deployment = useDeployment();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<CreditPhase>("idle");
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<`0x${string}`>();

  const usdc = deployment?.addresses.usdc as `0x${string}` | undefined;
  const collateral = market?.collateralToken as `0x${string}` | undefined;
  const collateralDecimals = market?.decimals ?? 18;
  const creditManager = market?.creditManager as `0x${string}` | undefined;
  const facade = market?.creditFacade as `0x${string}` | undefined;
  const swapAdapter = market?.swapAdapter as `0x${string}` | undefined;

  const reset = useCallback(() => {
    setPhase("idle");
    setError(undefined);
    setTxHash(undefined);
  }, []);

  const open = useCallback(
    async (collateralAmount: number, borrowUsdc: number) => {
      if (!address || !collateral || !creditManager || !facade || !publicClient) return;
      const collateralWei = parseUnits(collateralAmount.toString(), collateralDecimals);
      const borrow = parseUnits(borrowUsdc.toString(), USDC_DECIMALS);
      try {
        setError(undefined);
        // The credit manager pulls the collateral, so the borrower approves it (not the facade).
        const allowance = await publicClient.readContract({
          address: collateral,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, creditManager],
        });
        if (allowance < collateralWei) {
          setPhase("approving");
          const approveHash = await writeContractAsync({
            address: collateral,
            abi: erc20Abi,
            functionName: "approve",
            args: [creditManager, collateralWei],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
        setPhase("opening");
        const hash = await writeContractAsync({
          address: facade,
          abi: creditFacadeAbi,
          functionName: "openCreditAccount",
          args: [collateralWei, borrow],
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
    [
      address,
      collateral,
      collateralDecimals,
      creditManager,
      facade,
      publicClient,
      writeContractAsync,
      onSuccess,
    ],
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
    async (account: `0x${string}`, amount: number) => {
      if (!facade || !address) return;
      await send("withdrawing", {
        address: facade,
        abi: creditFacadeAbi,
        functionName: "withdrawCollateral",
        args: [account, parseUnits(amount.toString(), collateralDecimals), address],
      });
    },
    [facade, address, collateralDecimals, send],
  );

  // Lever up: swap the account's drawn USDC into collateral through the whitelisted adapter, batched
  // so the account approves the adapter and swaps in one health-checked multicall.
  const lever = useCallback(
    async (account: `0x${string}`, amountUsdc: number) => {
      if (!facade || !usdc || !collateral || !swapAdapter) return;
      const amount = parseUnits(amountUsdc.toString(), USDC_DECIMALS);
      const approveCall = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [swapAdapter, amount],
      });
      const swapCall = encodeFunctionData({
        abi: swapAdapterAbi,
        functionName: "swapExactInputSingle",
        args: [usdc, collateral, POOL_FEE, amount, 0n],
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
    [facade, usdc, collateral, swapAdapter, send],
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

  // addCollateral pulls collateral from the wallet, so approve the credit manager first when short.
  const addCollateral = useCallback(
    async (account: `0x${string}`, amount: number) => {
      if (!address || !collateral || !creditManager || !publicClient) return;
      const amountWei = parseUnits(amount.toString(), collateralDecimals);
      try {
        setError(undefined);
        const allowance = await publicClient.readContract({
          address: collateral,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, creditManager],
        });
        if (allowance < amountWei) {
          setPhase("approving");
          const approveHash = await writeContractAsync({
            address: collateral,
            abi: erc20Abi,
            functionName: "approve",
            args: [creditManager, amountWei],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
        await send("adding", {
          address: creditManager,
          abi: creditManagerAbi,
          functionName: "addCollateral",
          args: [account, amountWei],
        });
      } catch (e) {
        setError(toMessage(e));
        setPhase("error");
      }
    },
    [
      address,
      collateral,
      collateralDecimals,
      creditManager,
      publicClient,
      writeContractAsync,
      send,
    ],
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
