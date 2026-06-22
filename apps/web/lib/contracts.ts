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
export const creditFacadeAbi = parseAbi([
  "function openCreditAccount(uint256 collateral, uint256 borrow) returns (address account)",
  "function increaseDebt(address account, uint256 amount)",
  "function decreaseDebt(address account, uint256 amount)",
  "function withdrawCollateral(address account, uint256 amount, address to)",
  "function closeCreditAccount(address account)",
]);
