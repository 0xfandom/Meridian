"use client";

import { useCallback, useState } from "react";
import { parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { USDC_DECIMALS, WETH_DECIMALS, faucetAbi } from "./contracts";
import { useDeployment } from "./use-deployment";
import { useWallet } from "./use-wallet";

export type FaucetPhase = "idle" | "minting" | "success" | "error";

const USDC_GRANT = 100_000; // mock USDC handed to a fresh wallet
const WETH_GRANT = 50; // mock WETH handed to a fresh wallet

/// Local-only test faucet: mints mock USDC and WETH to the connected wallet so the demo works
/// in-browser without external funding. Available only when the deployment exposes mintable mock
/// tokens (the local stack); harmless to call elsewhere since the mint would simply revert.
export interface Faucet {
  phase: FaucetPhase;
  error?: string;
  available: boolean;
  mint: () => Promise<void>;
}

export function useFaucet(onSuccess?: () => void): Faucet {
  const { address, isConnected } = useWallet();
  const deployment = useDeployment();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<FaucetPhase>("idle");
  const [error, setError] = useState<string>();

  const usdc = deployment?.addresses.usdc as `0x${string}` | undefined;
  const weth = deployment?.addresses.weth as `0x${string}` | undefined;
  const available = Boolean(isConnected && address && usdc && weth);

  const mint = useCallback(async () => {
    if (!address || !usdc || !weth || !publicClient) return;
    try {
      setError(undefined);
      setPhase("minting");
      const usdcHash = await writeContractAsync({
        address: usdc,
        abi: faucetAbi,
        functionName: "mint",
        args: [address, parseUnits(String(USDC_GRANT), USDC_DECIMALS)],
      });
      await publicClient.waitForTransactionReceipt({ hash: usdcHash });
      const wethHash = await writeContractAsync({
        address: weth,
        abi: faucetAbi,
        functionName: "mint",
        args: [address, parseUnits(String(WETH_GRANT), WETH_DECIMALS)],
      });
      await publicClient.waitForTransactionReceipt({ hash: wethHash });
      setPhase("success");
      onSuccess?.();
    } catch (e) {
      setError(
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: unknown }).shortMessage)
          : "Faucet failed",
      );
      setPhase("error");
    }
  }, [address, usdc, weth, publicClient, writeContractAsync, onSuccess]);

  return { phase, error, available, mint };
}
