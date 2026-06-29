"use client";

import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import type { MarketView } from "./api";
import { USDC_DECIMALS, erc20Abi } from "./contracts";
import { useAccounts } from "./use-accounts";
import { useDeployment } from "./use-deployment";
import { findMarket, findMarketByManager, useMarkets } from "./use-markets";
import { useWallet } from "./use-wallet";

/// The connected wallet's margin account, valued at the live oracle price of its own market's
/// collateral. `undefined` while the account book is loading, `null` when the wallet has no open
/// account (so the UI shows an open flow), otherwise the resolved position. Equity, leverage and
/// liquidation price use the USDC the account currently holds (read on-chain), so they stay exact
/// rather than assuming a fully-drawn account.
/// One collateral of a basket account, with its live amount and value.
export interface BorrowerCollateral {
  symbol: string;
  token: `0x${string}`;
  amount: number; // display units
  price: number; // USDC
  value: number; // USDC
}

export interface BorrowerAccount {
  account: `0x${string}`;
  symbol: string; // collateral symbol of the account's market
  collateralToken: `0x${string}`;
  collateralDecimals: number;
  collateral: number; // primary collateral amount in display units
  collateralValue: number; // USDC (summed across the basket)
  // Present for a basket-market account: the per-asset breakdown. Single-collateral accounts omit it.
  collaterals?: BorrowerCollateral[];
  debt: number; // USDC
  usdcHeld: number; // borrowed USDC sitting in the account
  assets: number; // collateralValue + usdcHeld
  equity: number; // assets - debt
  leverage: number;
  health: number; // health factor; Infinity when there is no debt
  liquidationPrice: number; // collateral price at which health hits 1
  price: number; // current collateral price, USDC
  market?: MarketView; // the account's market (for manage actions)
}

export function useBorrowerAccount(): BorrowerAccount | null | undefined {
  const { address, isConnected } = useWallet();
  const deployment = useDeployment();
  const markets = useMarkets();
  const accounts = useAccounts();

  const usdc = deployment?.addresses.usdc as `0x${string}` | undefined;
  const mine =
    isConnected && address && accounts
      ? accounts.find((a) => a.owner.toLowerCase() === address.toLowerCase() && a.open)
      : undefined;

  // The account's market sets the collateral token, decimals, and live price. Resolve by credit
  // manager first: a basket market shares its primary token with a single-collateral market, so the
  // token alone is ambiguous. Fall back to the token for pre-tag snapshots.
  const market =
    findMarketByManager(markets, mine?.creditManager) ?? findMarket(markets, mine?.collateralToken);
  const collateralToken = (mine?.collateralToken ?? market?.collateralToken) as
    | `0x${string}`
    | undefined;

  // Read the account's live balances on-chain. The contract values collateral as the account's
  // collateral-token balance and credit as the USDC it holds, so reading the balances (rather than
  // the indexer's event-tracked deposited amount) stays correct after a swap moves USDC into
  // collateral inside the account.
  const acct = mine ? (mine.account as `0x${string}`) : undefined;
  const { data: balances } = useReadContracts({
    query: { enabled: Boolean(usdc && collateralToken && acct), refetchInterval: 8000 },
    contracts:
      usdc && collateralToken && acct
        ? [
            { address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [acct] },
            { address: collateralToken, abi: erc20Abi, functionName: "balanceOf", args: [acct] },
          ]
        : [],
  });

  if (!isConnected || accounts === null) return undefined; // loading
  if (!mine || !collateralToken) return null; // no open account

  const collateralDecimals = market?.decimals ?? 18;
  const usdcRaw = balances?.[0]?.status === "success" ? (balances[0].result as bigint) : undefined;
  const collateralRaw =
    balances?.[1]?.status === "success" ? (balances[1].result as bigint) : undefined;

  const price = market ? Number(formatUnits(BigInt(market.priceUsdc), USDC_DECIMALS)) : 0;
  const debt = Number(formatUnits(BigInt(mine.facePrincipal), USDC_DECIMALS));
  const usdcHeld = usdcRaw !== undefined ? Number(formatUnits(usdcRaw, USDC_DECIMALS)) : 0;

  // A basket account holds several collaterals (from the indexer); value each by its own live mark and
  // sum. A single-collateral account values its one on-chain balance at its market price.
  const marketCollaterals = market?.collaterals;
  const isBasket = Boolean(
    marketCollaterals &&
    marketCollaterals.length > 0 &&
    mine.collaterals &&
    mine.collaterals.length > 0,
  );

  let collaterals: BorrowerCollateral[] | undefined;
  let collateral: number;
  let collateralValue: number;
  if (isBasket && mine.collaterals && marketCollaterals) {
    collaterals = mine.collaterals.map((c) => {
      const mc = marketCollaterals.find(
        (x) => x.collateralToken.toLowerCase() === c.token.toLowerCase(),
      );
      const cPrice = mc ? Number(formatUnits(BigInt(mc.priceUsdc), USDC_DECIMALS)) : 0;
      const amount = Number(formatUnits(BigInt(c.amount), c.decimals));
      return {
        symbol: c.symbol,
        token: c.token as `0x${string}`,
        amount,
        price: cPrice,
        value: amount * cPrice,
      };
    });
    collateralValue = collaterals.reduce((sum, c) => sum + c.value, 0);
    collateral = collaterals[0]?.amount ?? 0;
  } else {
    collateral =
      collateralRaw !== undefined
        ? Number(formatUnits(collateralRaw, collateralDecimals))
        : Number(formatUnits(BigInt(mine.collateralDeposited), collateralDecimals));
    collateralValue = collateral * price;
  }

  const assets = collateralValue + usdcHeld;
  const equity = assets - debt;
  const leverage = equity > 0 ? assets / equity : 0;
  const health = mine.healthFactorWad
    ? Number(formatUnits(BigInt(mine.healthFactorWad), 18))
    : Infinity;

  // Derive the liquidation threshold from the exact on-chain health so the liquidation price stays
  // consistent with the displayed health: health = assets * LT / debt.
  const lt = debt > 0 && assets > 0 ? (health * debt) / assets : 0;
  // A single collateral price at which health hits 1 is only meaningful for a single-collateral
  // account; a basket has no one price, so leave it 0 and let the UI show the health factor instead.
  const liquidationPrice =
    !isBasket && debt > 0 && collateral > 0 && lt > 0
      ? Math.max(0, (debt / lt - usdcHeld) / collateral)
      : 0;

  return {
    account: mine.account as `0x${string}`,
    symbol: market?.symbol ?? mine.symbol ?? "",
    collateralToken,
    collateralDecimals,
    collateral,
    collateralValue,
    collaterals,
    debt,
    usdcHeld,
    assets,
    equity,
    leverage,
    health,
    liquidationPrice,
    price,
    market,
  };
}
