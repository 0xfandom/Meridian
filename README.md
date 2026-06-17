# Meridian

Non-custodial digital-asset prime brokerage.

Lenders supply ERC-4626 pools. Asset managers borrow against collateral to trade through a constrained, account-scoped margin system that touches only whitelisted protocols via adapters. A portfolio margin engine prices risk off-chain; an on-chain liquidation floor enforces solvency at all times.

## Repository layout

```
contracts/   Solidity protocol (Foundry workspace)
backend/     API gateway, indexer, auth/KYC, services
apps/        Lender, Borrower, and Admin portals
packages/    Shared UI, SDK, and generated contract types
scripts/     Developer tooling
```

This is a Turborepo monorepo. The Node workspaces (`backend`, `apps/*`, `packages/*`) are managed with pnpm; the on-chain code under `contracts/` is a self-contained Foundry project.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`)
- Node.js 22+ and pnpm (`corepack enable`)

## Getting started

```bash
git clone --recurse-submodules https://github.com/0xfandom/Meridian.git
cd Meridian
pnpm install
```

### Contracts

```bash
cd contracts
forge build
forge test
forge fmt --check
```

### Local mainnet fork

```bash
cp .env.example .env        # set MAINNET_RPC_URL
./scripts/dev-fork.sh       # anvil fork on http://127.0.0.1:8545 (chain id 31337)
```

### Quality gates

```bash
pnpm fmt:check              # prettier + forge fmt
pnpm lint:sol               # solhint
```

CI runs the same checks on every pull request.

## Status

Early development. See the issue tracker and milestones for the current roadmap.

## License

To be determined.
