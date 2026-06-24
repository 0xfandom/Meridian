"use client";

import { useCallback, useState } from "react";
import { parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { USDC_DECIMALS, faucetAbi } from "./contracts";
import { useDeployment } from "./use-deployment";
import { useMarkets } from "./use-markets";
import { useWallet } from "./use-wallet";

export type FaucetPhase = "idle" | "minting" | "success" | "error";

const USDC_GRANT = 100_000; // mock USDC handed to a fresh wallet
// Per-collateral grant (in whole tokens); a fresh wallet gets a usable amount of every market's
// collateral so it can open a position in any of them. Unknown symbols fall back to the default.
const COLLATERAL_GRANTS: Record<string, number> = { WETH: 50, LINK: 5000 };
const DEFAULT_COLLATERAL_GRANT = 1000;

/// Local-only test faucet: mints mock USDC and every market's collateral to the connected wallet so
/// the demo works in-browser without external funding. Available only when the deployment exposes
/// mintable mock tokens (the local stack); harmless to call elsewhere since the mint would revert.
export interface Faucet {
  phase: FaucetPhase;
  error?: string;
  available: boolean;
  mint: () => Promise<void>;
}

export function useFaucet(onSuccess?: () => void): Faucet {
  const { address, isConnected } = useWallet();
  const deployment = useDeployment();
  const markets = useMarkets();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<FaucetPhase>("idle");
  const [error, setError] = useState<string>();

  const usdc = deployment?.addresses.usdc as `0x${string}` | undefined;
  const available = Boolean(isConnected && address && usdc && markets && markets.length > 0);

  const mint = useCallback(async () => {
    if (!address || !usdc || !publicClient || !markets) return;
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

      // Mint every market's collateral so the wallet can open a position in any market.
      for (const market of markets) {
        const grant = COLLATERAL_GRANTS[market.symbol] ?? DEFAULT_COLLATERAL_GRANT;
        const hash = await writeContractAsync({
          address: market.collateralToken as `0x${string}`,
          abi: faucetAbi,
          functionName: "mint",
          args: [address, parseUnits(String(grant), market.decimals)],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

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
  }, [address, usdc, markets, publicClient, writeContractAsync, onSuccess]);

  return { phase, error, available, mint };
}
