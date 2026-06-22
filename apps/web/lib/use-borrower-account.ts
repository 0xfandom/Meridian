"use client";

import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { USDC_DECIMALS, WETH_DECIMALS, erc20Abi } from "./contracts";
import { useAccounts } from "./use-accounts";
import { useDeployment } from "./use-deployment";
import { useProtocolStats } from "./use-protocol-stats";
import { useWallet } from "./use-wallet";

/// The connected wallet's margin account, valued at the live oracle price. `undefined` while the
/// account book is loading, `null` when the wallet has no open account (so the UI shows an open
/// flow), otherwise the resolved position. Equity, leverage and liquidation price use the USDC the
/// account currently holds (read on-chain), so they stay exact rather than assuming a fully-drawn
/// account.
export interface BorrowerAccount {
  account: `0x${string}`;
  collateralWeth: number;
  collateralValue: number; // USDC
  debt: number; // USDC
  usdcHeld: number; // borrowed USDC sitting in the account
  assets: number; // collateralValue + usdcHeld
  equity: number; // assets - debt
  leverage: number;
  health: number; // health factor; Infinity when there is no debt
  liquidationPrice: number; // collateral price at which health hits 1
  price: number; // current collateral price, USDC
}

export function useBorrowerAccount(): BorrowerAccount | null | undefined {
  const { address, isConnected } = useWallet();
  const deployment = useDeployment();
  const stats = useProtocolStats();
  const accounts = useAccounts();

  const usdc = deployment?.addresses.usdc as `0x${string}` | undefined;
  const weth = deployment?.addresses.weth as `0x${string}` | undefined;
  const mine =
    isConnected && address && accounts
      ? accounts.find((a) => a.owner.toLowerCase() === address.toLowerCase() && a.open)
      : undefined;

  // Read the account's live balances on-chain. The contract values collateral as the account's WETH
  // balance and credit as the USDC it holds, so reading the balances (rather than the indexer's
  // event-tracked deposited amount) stays correct after a swap moves USDC into WETH inside the
  // account.
  const acct = mine ? (mine.account as `0x${string}`) : undefined;
  const { data: balances } = useReadContracts({
    query: { enabled: Boolean(usdc && weth && acct), refetchInterval: 8000 },
    contracts:
      usdc && weth && acct
        ? [
            { address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [acct] },
            { address: weth, abi: erc20Abi, functionName: "balanceOf", args: [acct] },
          ]
        : [],
  });

  if (!isConnected || accounts === null) return undefined; // loading
  if (!mine) return null; // no open account

  const usdcRaw = balances?.[0]?.status === "success" ? (balances[0].result as bigint) : undefined;
  const wethRaw = balances?.[1]?.status === "success" ? (balances[1].result as bigint) : undefined;

  const price = stats?.collateralPrice ?? 0;
  const collateralWeth =
    wethRaw !== undefined
      ? Number(formatUnits(wethRaw, WETH_DECIMALS))
      : Number(formatUnits(BigInt(mine.collateralDeposited), WETH_DECIMALS));
  const debt = Number(formatUnits(BigInt(mine.facePrincipal), USDC_DECIMALS));
  const usdcHeld = usdcRaw !== undefined ? Number(formatUnits(usdcRaw, USDC_DECIMALS)) : 0;

  const collateralValue = collateralWeth * price;
  const assets = collateralValue + usdcHeld;
  const equity = assets - debt;
  const leverage = equity > 0 ? assets / equity : 0;
  const health = mine.healthFactorWad
    ? Number(formatUnits(BigInt(mine.healthFactorWad), 18))
    : Infinity;

  // Derive the liquidation threshold from the exact on-chain health so the liquidation price stays
  // consistent with the displayed health: health = assets * LT / debt.
  const lt = debt > 0 && assets > 0 ? (health * debt) / assets : 0;
  const liquidationPrice =
    debt > 0 && collateralWeth > 0 && lt > 0
      ? Math.max(0, (debt / lt - usdcHeld) / collateralWeth)
      : 0;

  return {
    account: mine.account as `0x${string}`,
    collateralWeth,
    collateralValue,
    debt,
    usdcHeld,
    assets,
    equity,
    leverage,
    health,
    liquidationPrice,
    price,
  };
}
