<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/meridian-wordmark-dark.svg">
    <img alt="Meridian" src=".github/assets/meridian-wordmark-light.svg" width="380">
  </picture>
</p>

<p align="center">
  <b>Non-custodial digital-asset prime brokerage.</b><br>
  Lenders supply ERC-4626 pools. Asset managers borrow against collateral and trade through a
  constrained, account-scoped margin system that can touch only whitelisted protocols.
</p>

<p align="center">
  <img alt="status" src="https://img.shields.io/badge/status-local%20%26%20fork%20demo-dc2626">
  <img alt="solidity" src="https://img.shields.io/badge/solidity-0.8.24-b91c1c">
  <img alt="foundry" src="https://img.shields.io/badge/built%20with-foundry-1f1f23">
  <img alt="license" src="https://img.shields.io/badge/license-all%20rights%20reserved-6b7280">
</p>

---

## What is Meridian

Meridian is an on-chain prime brokerage. It connects two sides of the market without ever taking
custody of anyone's funds:

- **Lenders** supply USDC into an ERC-4626 pool and earn the borrow rate set by a kinked,
  utilization-based interest-rate model.
- **Asset managers** post collateral, draw credit against it, and trade with leverage — but only
  inside an isolated, account-scoped margin account that can call nothing except whitelisted
  protocol adapters.

A borrower's collateral and the credit they draw live together inside one isolated margin account
(an EIP-1167 clone). Drawn funds never leave that account on trust; they can only move through
whitelisted adapters, and every action ends in a single health check. A portfolio risk engine prices
health off-chain, and an on-chain liquidation floor enforces solvency at all times — **the pool is
always made whole**. That is what makes capital-efficient leverage possible while keeping lenders
fully covered. The model mirrors institutional DeFi prime brokers such as Arkis.

## Who it's for

| Audience | What they get |
| --- | --- |
| **Lenders / LPs** | Supply USDC, earn the borrow rate, withdraw idle liquidity any time. Liquidations always repay the pool first. |
| **Asset managers & funds** | Capital-efficient (undercollateralized) leverage with non-custodial, constrained trading. |
| **Treasuries** | Put idle stablecoins to work as a lender, or borrow against holdings without giving up custody. |
| **Keepers** | Watch account health and earn by funding shortfalls and seizing collateral at a discount. |
| **Developers & integrators** | A full local stack — contracts, indexer, API, risk engine, keeper, web — to fork, study, and build on. |

## How it works

Everything reduces to three flows, all live and verified on-chain:

- **Lend** — approve USDC, `deposit` into the pool, receive ERC-4626 shares (a claim on principal + interest).
- **Lever** — approve collateral to the credit manager, `openCreditAccount` (clones an account, posts
  collateral, draws USDC), then a gated `multicall` swaps the drawn USDC into more collateral through
  a whitelisted adapter. One health check at the end.
- **Liquidate** — when an account's health drops below the maintenance floor, the keeper triggers the
  liquidation module. The account's own assets repay the pool first; the keeper funds any shortfall
  and seizes the collateral at a discount.

## Quick start

A single command brings up the entire system on a local node with a seeded book you can inspect,
stress, and liquidate.

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`)
- Node.js 22+ and pnpm (`corepack enable`)
- Go 1.23+ (keeper)
- Python 3.11+ (margin engine)

### 1. Clone and install

```bash
git clone --recurse-submodules https://github.com/0xfandom/Meridian.git
cd Meridian
pnpm install
```

### 2. Run the stack

**Local (clean chain, mock prices) — the default:**

```bash
./scripts/dev-up.sh --seed
```

**Mainnet fork (real Chainlink prices):** set a mainnet RPC URL, then pass `--fork`. The deploy wires
the real `ChainlinkPriceOracle` against the live ETH/USD feed, so collateral valuation and account
health move on the real market price.

```bash
cp .env.example .env          # then set MAINNET_RPC_URL (any mainnet RPC; a free public one works)
./scripts/dev-up.sh --fork --seed
```

Either way the script starts anvil, deploys and wires every contract, seeds a realistic book
(healthy, warning, and margin-call accounts), and launches all five services. Stop everything with
`Ctrl-C`.

### 3. Start the web app

```bash
cd apps/web
pnpm dev
```

Open <http://localhost:3000>.

### 4. Connect a wallet

Add a network to MetaMask — **Chain ID `31337`**, **RPC `http://127.0.0.1:8545`** — then use the
in-app faucet to fund a fresh wallet with mock USDC and WETH. You can now lend, open a margin
account, borrow, lever, and close, all signing straight to the local chain.

### 5. Inspect and stress the book

```bash
curl -s http://127.0.0.1:3001/pools     | jq   # pool totals + live collateral price
curl -s http://127.0.0.1:3001/accounts  | jq   # every account's health, collateral, debt
curl -s http://127.0.0.1:3002/alerts    | jq   # alert engine

# Drive a liquidation cascade (the keeper acts on it when started with KEEPER_DRY_RUN=false)
cd contracts
forge script script/Seed.s.sol:SeedScript --sig "crash()" \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

On a fork, `crash()` simulates the drop by repointing the oracle's feed to a low mock aggregator (a
real Chainlink feed can't be moved), so the liquidation cascade works on real-price infrastructure too.

### Contracts workflow

```bash
cd contracts
forge build
forge test
forge fmt --check
```

## Services and surfaces

| Service | URL | Stack |
| --- | --- | --- |
| anvil | http://127.0.0.1:8545 (chain id 31337) | Foundry |
| API | http://127.0.0.1:3001 | TypeScript · Hono · REST + WebSocket + SIWE |
| alerts | http://127.0.0.1:3002 | TypeScript · Hono · Prometheus metrics |
| margin engine | http://127.0.0.1:8000 | Python · FastAPI |
| web | http://localhost:3000 | Next.js · React 19 · wagmi · viem |

## Repository layout

```
contracts/   Solidity protocol + deploy/seed scripts (Foundry workspace)
backend/     Off-chain services: indexer, api, margin-engine, keeper, alerts
apps/        Frontend: web (Next.js + wagmi)
ops/         Monitoring stack (Prometheus) and docker-compose
scripts/     Developer tooling (dev-up, dev-fork)
packages/    Shared UI, SDK, and generated contract types (placeholder)
```

Turborepo monorepo. Node workspaces use pnpm; `contracts/` is a self-contained Foundry project;
`backend/margin-engine` is Python and `backend/keeper` is Go.

## Project status

The protocol and the off-chain services are built and run end to end on a local node.

**Done**

- On-chain core — ERC-4626 pool with a kinked two-slope IRM; isolated margin accounts (EIP-1167
  clones); leverage via whitelisted adapters (Uniswap v3, Curve, an LST) behind a gated multicall;
  price oracle with per-collateral haircuts; a governance-tunable risk configurator; keeper-funded
  liquidation that always makes the pool whole; and safety/governance rails (Guardian pause,
  whitelist, access control, Safe + Timelock).
- Off-chain spine — indexer (viem), api (Hono, REST + WS + SIWE), margin engine (FastAPI), keeper
  (Go), and alerts (Hono + Prometheus).
- Frontend — wallet connect, faucet, lender deposit/withdraw, and the full borrower flow
  (open/borrow/repay/add/withdraw/lever/close) signing straight to chain.
- Local stack — one command boots a clean local chain with a seeded book and a price-crash
  entrypoint that drives a full liquidation cascade.
- Real-price fork mode — `--fork` runs the whole stack against a mainnet fork, pricing collateral
  from the **live Chainlink ETH/USD feed**, with a fork-aware crash that drives a real-price
  liquidation cascade.

**Current stage:** local and mainnet-fork demo, pre-audit. Tokens and the swap venue are still mocks;
fork mode adds real Chainlink prices. It is not deployed to mainnet and must not be used with real funds.

## Roadmap

Most of what is next is gated by a real environment or an external phase, not by missing protocol
logic — the contracts are written interface-first for exactly these steps.

- **Real swaps against live DEX liquidity** — point the Uniswap/Curve adapters at real routers/pools
  on a fork or mainnet (the adapters already take the venue address). Also removes the close-out
  interest dust seen with the one-way mock router.
- **Multi-collateral** — register more collateral tokens with their feeds, haircuts, and adapters.
- **Borrower onboarding** — KYC / permissioning layer and credit terms for institutional borrowers.
- **Admin / risk console** — a UI over the on-chain risk and whitelist setters that already exist.
- **External audit** — the gate for any real-money deployment.
- **Mainnet deployment** — after audit, with real assets, Chainlink feeds, and a Safe owner.
- **Multi-chain and unified CeFi-DeFi margin (v2)** — cross-chain settlement and a single margin view
  across venues, with broader exotic collateral.

## Quality gates

CI runs the full matrix on every pull request: contracts (build + test + fmt), lint, the three
TypeScript services, the margin engine, the keeper, and a deploy-and-smoke job on a fresh anvil.

## License

Unlicensed; all rights reserved pending license selection.
