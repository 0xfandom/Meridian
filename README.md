# Meridian

Non-custodial digital-asset prime brokerage.

Lenders supply ERC-4626 pools. Asset managers borrow against collateral and trade through a constrained, account-scoped margin system that can touch only whitelisted protocols via adapters. A portfolio margin engine prices risk off-chain; an on-chain liquidation floor enforces solvency at all times, and the pool is always made whole.

## What works today

The on-chain protocol and the off-chain services are built and run end to end on a local node. One command brings up the whole system with a seeded book you can inspect, stress, and liquidate.

**On-chain (Foundry, Solidity 0.8.24)**

- ERC-4626 lending pool with a kinked, two-slope interest rate model.
- Isolated margin accounts (EIP-1167 clones) that simultaneously hold a borrower's collateral and drawn credit.
- Leverage by borrowing from a pool and trading through whitelisted protocol adapters (Uniswap v3, Curve, an LST) via a gated multicall.
- Price oracle with per-collateral haircuts and a governance-tunable `RiskConfigurator` (thresholds, IRM curve, leverage caps).
- Keeper-funded liquidation: the account's own assets repay first, the keeper funds any shortfall and seizes the collateral, and the pool is always made whole.
- Safety and governance: `Guardian` emergency pause, `WhitelistRegistry`, `AccessController`, and a Safe + Timelock owner.

**Off-chain spine**

- `indexer` (TypeScript / viem) — folds pool, account, position, and liquidation events into a queryable snapshot.
- `api` (TypeScript / Hono) — REST + WebSocket over the snapshot, with SIWE authentication.
- `margin-engine` (Python / FastAPI) — portfolio risk: ingest, mark, haircut, health, signal, stress.
- `keeper` (Go) — watches account health and submits liquidations through the module, with a retry watchdog.
- `alerts` (TypeScript / Hono) — rule engine plus Prometheus metrics and runbooks (`ops/`).

**Tooling**

- Deterministic deploy script that wires the entire system and writes an address manifest the services read.
- `scripts/dev-up.sh` — one command for anvil + deploy + all five services.
- A seed driver that populates a realistic book (healthy, warning, and margin-call accounts) and a price-crash entrypoint that drives a liquidation cascade.

## Not yet / out of scope here

- **Frontend** (lender, borrower, and admin portals) is developed in a separate repository and will be merged later; `apps/` is an empty placeholder for now.
- Mainnet deployment, external audits, CeFi-DeFi unified margin (v2), multi-chain, and broader exotic collateral are later, externally gated phases.

## Repository layout

```
contracts/   Solidity protocol + deploy/seed scripts (Foundry workspace)
backend/     Off-chain services: indexer, api, margin-engine, keeper, alerts
ops/         Monitoring stack (Prometheus) and docker-compose
scripts/     Developer tooling (dev-up, dev-fork)
apps/        Frontend apps (developed separately; placeholder)
packages/    Shared UI, SDK, and generated contract types (placeholder)
```

Turborepo monorepo. The Node workspaces are managed with pnpm; `contracts/` is a self-contained Foundry project; `backend/margin-engine` is Python and `backend/keeper` is Go.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`)
- Node.js 22+ and pnpm (`corepack enable`)
- Go 1.23+ (keeper)
- Python 3.11+ (margin engine)

## Getting started

```bash
git clone --recurse-submodules https://github.com/0xfandom/Meridian.git
cd Meridian
pnpm install
```

### Run the full stack locally

```bash
./scripts/dev-up.sh --seed
```

This starts a clean local anvil, deploys and wires the whole system, seeds a demo book, and launches all five services:

| Service       | URL                   |
| ------------- | --------------------- |
| anvil         | http://127.0.0.1:8545 |
| API           | http://127.0.0.1:3001 |
| alerts        | http://127.0.0.1:3002 |
| margin engine | http://127.0.0.1:8000 |

Inspect the seeded book:

```bash
curl -s http://127.0.0.1:3001/pools
curl -s http://127.0.0.1:3001/accounts
curl -s http://127.0.0.1:3002/alerts
```

Drive a liquidation cascade (a keeper started with `KEEPER_DRY_RUN=false` will act on it):

```bash
cd contracts
forge script script/Seed.s.sol:SeedScript --sig "crash()" \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

Press Ctrl-C to tear the whole stack down.

### Contracts

```bash
cd contracts
forge build
forge test
forge fmt --check
```

### Deploy and smoke

```bash
cd contracts
# deploy to a running anvil; writes deployments/<network>.json
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil_key>
# end-to-end lever-then-liquidate against the live deployment
forge script script/Smoke.s.sol:SmokeScript \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

### Quality gates

```bash
pnpm fmt:check              # prettier + forge fmt
pnpm lint:sol               # solhint
```

CI runs the full matrix on every pull request: contracts, lint, the three TypeScript services, the margin engine, the keeper, and a deploy-and-smoke job on a fresh anvil.

## Status

Foundations, on-chain core, off-chain spine, and local deployment are complete; the system runs and liquidates end to end locally. Frontend and mainnet/audit phases are tracked in the issue tracker and milestones.

## License

Unlicensed; all rights reserved pending license selection.
