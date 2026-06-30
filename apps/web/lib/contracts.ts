// Minimal contract ABIs the web app calls directly. Only the functions the UI needs are listed;
// the set grows as read/write flows are wired. Addresses come from the API's /deployment endpoint
// (see use-deployment), not from this file, so the same build works against any deployment.

import { parseAbi } from "viem";

// Token decimals are fixed by the local deployment's mock tokens and match the backend's
// assumptions (the pool asset USDC has 6 decimals; WETH collateral has 18).
export const USDC_DECIMALS = 6;
export const WETH_DECIMALS = 18;

export const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

// The pool is an ERC-4626 vault over USDC; shares are the lender's claim on principal + interest.
export const poolAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function maxWithdraw(address owner) view returns (uint256)",
  "function asset() view returns (address)",
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
]);

// Borrower entry point. openCreditAccount posts collateral (pulled by the credit manager, which the
// borrower must approve) and draws credit in one call; debt is adjusted via increase/decreaseDebt.
// multicall routes a batch of calls through the account (e.g. approve + swap via an adapter); the
// manager applies one health check at the end and gates each call on the whitelist.
export const creditFacadeAbi = parseAbi([
  "function openCreditAccount(uint256 collateral, uint256 borrow) returns (address account)",
  "function increaseDebt(address account, uint256 amount)",
  "function decreaseDebt(address account, uint256 amount)",
  "function withdrawCollateral(address account, uint256 amount, address to)",
  "function closeCreditAccount(address account)",
  "function multicall(address account, (address target, bytes callData)[] calls)",
]);

// The whitelisted Uniswap v3 swap adapter, called through the account inside a multicall.
export const swapAdapterAbi = parseAbi([
  "function swapExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 amountOutMin) returns (uint256)",
]);

export const POOL_FEE = 500; // the local DEX fee tier the seed/deploy use

// The local mock USDC/WETH expose an open mint; the faucet uses it so a fresh wallet can self-fund
// for the demo. Real token deployments do not have this, so the faucet is local-only.
export const faucetAbi = parseAbi(["function mint(address to, uint256 amount)"]);

// addCollateral is not on the facade; the owner calls the credit manager directly (it pulls the
// collateral from the caller, so the manager is the approval target). The single-arg overload tops up
// the market's primary collateral; the token overload tops up any registered collateral of a basket
// market, so the UI can let the owner choose which asset to add.
export const creditManagerAbi = parseAbi([
  "function addCollateral(address account, uint256 amount)",
  "function addCollateral(address account, address token, uint256 amount)",
]);
