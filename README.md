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
cp .env.example .env          # then set MAINNET_RPC_URL (see the archive-window note below)
./scripts/dev-up.sh --fork --seed
```

> **Pick an archive RPC for fork mode.** Opening a margin account clones an account contract, which
> makes anvil re-read state at the forked block. Free public RPCs only serve recent state (~128
> blocks, roughly 25 minutes), so a fork session that sits idle past that window starts failing with
> `Archive requests require a personal token` on new account opens. Use an archive-capable endpoint
> (Alchemy, Infura, your own node), or just re-run `./scripts/dev-up.sh --fork --seed` to re-fork at
> the current block. Plain local mode (no `--fork`) never hits this.

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
in-app faucet to fund a fresh wallet with mock USDC and the collateral assets (WETH and LINK, each an
isolated single-collateral market). You can now lend, open a margin account, borrow, lever, and close,
all signing straight to the local chain.

> **Restarting anvil?** A fresh chain resets account nonces, so MetaMask's cached nonce goes stale and
> the next send fails with `replacement transaction underpriced`. Fix it with MetaMask →
> **Settings → Security and privacy → Clear activity tab data** for the account, which resyncs the
> nonce against the new chain.

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

## Walkthrough — lend, borrow, lever, liquidate

A complete run, from a fresh start to a live liquidation, with the exact amount to enter and the
change you should see at every step. It assumes the stack and web app are up (Quick start steps 1–4)
and your wallet is funded from the faucet.

> **Two things decide whether the demo works.** (1) Start the stack with `KEEPER_DRY_RUN=false` or the
> keeper only watches and never liquidates — the crash will do nothing. (2) Use local mode (plain
> `--seed`, no `--fork`): a clean chain with mock prices, nothing that can expire mid-demo.

### 1. Lend USDC (the lender side)

Go to **Earn**. Only USDC can be supplied (one real USDC pool).

| Field | Enter | Action |
| --- | --- | --- |
| Supply amount | **10,000 USDC** | Approve USDC (first time) → Supply |

**Observe:** the pool size moves from `500,000` → `510,000` supplied. Check with
`curl -s http://127.0.0.1:3001/pools | jq`.

### 2. Open a margin account (the borrower side)

Go to **Borrow**, pick the **WETH market**.

| Field | Enter | Why |
| --- | --- | --- |
| Collateral | **5 WETH** | = $10,000 at the $2,000 mock price — your equity |
| Borrow | **5,000 USDC** | Drawn from the lender pool against the collateral |

Approve WETH → Open account. **Observe:** health factor **2.70**, leverage **1.50x ($15k gross)**,
liquidation price **$111.11** (the drawn USDC is stable backing, so WETH would have to crash ~94%).

### 3. Lever up

Click **Lever up** — it swaps the drawn USDC into more WETH inside the account.

| What changes | Before → After | Why |
| --- | --- | --- |
| Collateral | 5 WETH → ~7 WETH | Drawn USDC swapped into WETH |
| Liquidation price | $111 → ~$650 | Stable cushion gone — all backing now moves with the price |
| Health / equity / leverage | ≈ unchanged | Swapped $5k of one asset for $5k of another |

The lesson: leverage didn't change today's numbers, it moved your **liquidation price**. Health factor
tells you where you stand now; liquidation price tells you how much room you have if the market moves.

> **Closing a levered account fails locally.** After levering, the account holds mostly WETH but the
> debt is in USDC, and the mock router is one-way (USDC→WETH only), so it can't swap back to repay. To
> demo a clean Close, open a position and Close it **without** levering. Real two-way DEX liquidity (a
> fork/mainnet) removes this.

### 4. Crash the market (the seeded liquidations)

In a third terminal:

```bash
cd contracts
forge script script/Seed.s.sol:SeedScript --sig "crash()" \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

This lowers the prices the protocol sees; the keeper acts on its ~4-second loop.

| What happens | Value | Result |
| --- | --- | --- |
| WETH price | $2,000 → $1,500 | A 25% drop, calibrated for the fragile seeded accounts |
| LINK price | → $5 | The LINK seed account goes deeply underwater |
| Liquidated | 3 accounts | warning, margin-call, and LINK seed — each repaid, debt → 0 |
| Your account | survives | Its liquidation price (~$650) is below $1,500 |

**Verify:** `curl -s http://127.0.0.1:3001/liquidations | jq` lists three records. The pool was made
whole — lenders lost nothing.

### 5. See the liquidation report on your own wallet

The standard crash spares your account. To liquidate it and flip the screen to the read-only report
card, drop WETH below your liquidation price by setting it to $300 directly on the oracle:

```bash
# Addresses on a fresh local dev-up are deterministic; if a deploy differs, fetch them:
#   ORACLE=$(curl -s http://127.0.0.1:3001/deployment | jq -r .addresses.oracle)
#   WETH=$(curl -s http://127.0.0.1:3001/markets | jq -r '.[]|select(.symbol=="WETH").collateralToken')
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "setPrice(address,uint256)" \
  0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 300000000 \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

`300000000` is $300 in 6-decimal USDC terms; `0xac0974…` is anvil account 0, the oracle owner.
**Observe:** within ~4 seconds the keeper repays your debt and seizes your WETH; refresh the Borrow
page and it flips to the **liquidation report card** — collateral seized, debt repaid, keeper address,
block, and tx, with the outcome breakdown (Debt to pool = Cleared · Your collateral = Seized · Lender
funds = Protected).

### 6. The LINK market (multi-collateral)

Back on **Borrow**, use the market selector to switch to **LINK**. Open a second account — post e.g.
**200 LINK** and borrow USDC. **Observe:** a separate isolated account in the LINK market, drawing from
the **same** USDC pool. Each collateral is its own isolated market; one shared pool.

### 7. The basket market (portfolio margin)

Beyond single-collateral markets, a **basket market** lets one account hold several collaterals at once
and borrow against their combined value. The seed opens a basket account (10 WETH + 1000 LINK), so you
can view it directly.

1. **Import the basket borrower** into MetaMask (public test key):
   `0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97` (address `0x23618e81…`). Select
   it on the 31337 network. Its wallet holds only gas ETH — the basket assets are already inside its
   margin account, so **no faucet needed**.
2. Open **Borrow**. The position is one account backed by two collaterals.

| What you'll see | Value | Meaning |
| --- | --- | --- |
| Collateral | **Basket** | Holds more than one collateral, not a single asset |
| Collateral assets | **10.0000 WETH · 1000.0000 LINK** | Each asset with its own live amount and value |
| Debt | **$20,000** | Drawn against the combined basket value |
| Health factor | **~2.12** | Sum of each collateral's haircut-adjusted value over debt |
| Liquidation | **—** | A basket has no single price; the health factor is the gauge |

This is the institutional **portfolio margin** model: the credit manager values each collateral by its
own price, decimals, and haircut and sums them (v1). Correlation netting (long/short offset) is the next
version. Opening/managing a basket from the browser is a follow-up — the view, indexer, and API are live.

### 8. Verify everything from the API

```bash
curl -s http://127.0.0.1:3001/pools        | jq   # pool totals + live prices
curl -s http://127.0.0.1:3001/accounts     | jq   # every account: health, collateral, debt, liquidated
curl -s http://127.0.0.1:3001/markets      | jq   # WETH, LINK, and the BASKET market (with collaterals)
curl -s http://127.0.0.1:3001/liquidations | jq   # every recorded liquidation

# the basket account's per-collateral balances:
curl -s http://127.0.0.1:3001/accounts | jq '.[] | select(.symbol=="BASKET")'
```

To run it all again, `Ctrl-C` the stack and start from Quick start step 2 — a fresh `dev-up` gives a
clean chain and a freshly seeded book.

> **Restarting anvil?** A fresh chain resets nonces, so MetaMask may throw
> `replacement transaction underpriced`. Fix it with MetaMask → Settings → Security and privacy →
> **Clear activity tab data** for the account.

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
- Multiple markets — more than one collateral runs as its own isolated single-collateral market
  (WETH and LINK ship by default), all sharing one USDC lending pool. The whole spine is
  market-aware: the indexer tags accounts by market, the API exposes them at `/markets`, and the
  keeper routes each account's health read and liquidation to its own credit manager.
- Multi-collateral basket (v1) — a basket market lets one account hold several collaterals at once
  (WETH + LINK) and borrow against their combined value; the credit manager values each by its own
  price, decimals, and haircut and sums them. Seeded, indexed, served by the API, and rendered in the
  position view. Correlation netting (v2 portfolio margin) and a browser open/manage flow are next.
- Frontend — wallet connect, faucet, lender deposit/withdraw, a market selector, and the full
  borrower flow (open/borrow/repay/add/withdraw/lever/close) signing straight to chain.
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
- **Portfolio margin (v2 netting)** — basket accounts ship today as a haircut-adjusted **sum** of
  their collaterals (v1). The next step is correlation netting: letting opposing positions offset so a
  hedged book needs less margin, the way an institutional prime broker prices portfolio risk. The
  per-asset valuation and summing path are already in place.
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
