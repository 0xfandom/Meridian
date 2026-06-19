#!/usr/bin/env bash
#
# Bring the entire Meridian stack up locally with a single command:
#   anvil (clean local node) -> deploy contracts -> launch all five services.
#
# This is the primary local-first workflow. Where scripts/dev-fork.sh forks mainnet, this starts a
# clean local chain; the deploy script's local profile supplies its own mock USDC, WETH, and price
# oracle, so the stack is fully self-contained. Contract addresses flow from the deployment manifest
# into the services via MERIDIAN_DEPLOYMENT, so nothing is wired by hand.
#
# Usage:
#   ./scripts/dev-up.sh
#
# Stop with Ctrl-C; every process started here is torn down on exit.
set -euo pipefail
# Job control so each background service runs in its own process group; cleanup then kills the whole
# group, reaping grandchildren (e.g. `go run` -> compiled binary, the venv python) that a bare kill
# of the wrapping subshell would leave behind.
set -m

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# --- Flags -----------------------------------------------------------------------------
SEED=false
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    *) echo "unknown flag: $arg (supported: --seed)" >&2; exit 1 ;;
  esac
done

# Load .env for overrides if present (same idiom as scripts/dev-fork.sh).
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

# --- Local defaults (export any of these before running to override) -------------------
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
CHAIN_ID="${CHAIN_ID:-31337}"
# Well-known deterministic anvil dev accounts. These keys are public and only ever have value on a
# local node; never reuse them anywhere real.
DEPLOYER_KEY="${DEPLOYER_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
KEEPER_KEY="${KEEPER_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"

MANIFEST="$ROOT/contracts/deployments/local.json"
DEV_DIR="$ROOT/.dev"
SNAPSHOT="$DEV_DIR/indexer-state.json"
ANVIL_LOG="$DEV_DIR/anvil.log"

mkdir -p "$DEV_DIR"
rm -f "$SNAPSHOT"

PIDS=()

cleanup() {
  echo
  echo "Shutting down Meridian dev stack..."
  for pid in "${PIDS[@]:-}"; do
    [ -n "${pid:-}" ] || continue
    # Negative pid targets the whole process group; fall back to the lone pid if that fails.
    kill -TERM -- -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required tool: $1" >&2
    exit 1
  }
}
require anvil
require cast
require forge
require pnpm
require go

# The margin engine needs Python >= 3.11; a bare `python3` is often older (e.g. macOS ships 3.9).
# Prefer $PYTHON, then the newest versioned interpreter on PATH that satisfies the floor.
PYTHON_BIN="${PYTHON:-}"
if [ -z "$PYTHON_BIN" ]; then
  for cand in python3.13 python3.12 python3.11 python3; do
    command -v "$cand" >/dev/null 2>&1 || continue
    ver="$("$cand" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo "0.0")"
    if [ "${ver%%.*}" -eq 3 ] && [ "${ver#*.}" -ge 11 ]; then
      PYTHON_BIN="$cand"
      break
    fi
  done
fi
if [ -z "$PYTHON_BIN" ]; then
  echo "no Python >= 3.11 found (the margin engine requires it); set PYTHON to a 3.11+ interpreter" >&2
  exit 1
fi

# --- 1. Local chain --------------------------------------------------------------------
echo "[1/4] starting anvil ($RPC_URL, chain id $CHAIN_ID)..."
anvil --chain-id "$CHAIN_ID" >"$ANVIL_LOG" 2>&1 &
PIDS+=("$!")

for _ in $(seq 1 50); do
  if cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1 || {
  echo "anvil did not come up; see $ANVIL_LOG" >&2
  exit 1
}

# --- 2. Deploy and write the manifest --------------------------------------------------
echo "[2/4] deploying contracts and writing the address manifest..."
(
  cd "$ROOT/contracts" &&
    forge script script/Deploy.s.sol:DeployScript \
      --rpc-url "$RPC_URL" --broadcast --private-key "$DEPLOYER_KEY" >"$DEV_DIR/deploy.log" 2>&1
) || {
  echo "deploy failed; see $DEV_DIR/deploy.log" >&2
  exit 1
}
test -f "$MANIFEST" || {
  echo "manifest was not written at $MANIFEST" >&2
  exit 1
}
echo "       manifest: $MANIFEST"

# --- 2b. Optionally seed a demo book ---------------------------------------------------
if [ "$SEED" = true ]; then
  echo "[2b] seeding a demo book (LP liquidity + healthy/warning/margin-call accounts)..."
  (
    cd "$ROOT/contracts" &&
      forge script script/Seed.s.sol:SeedScript --rpc-url "$RPC_URL" --broadcast >"$DEV_DIR/seed.log" 2>&1
  ) || {
    echo "seed failed; see $DEV_DIR/seed.log" >&2
    exit 1
  }
  echo "       seeded; details in $DEV_DIR/seed.log"
fi

# --- 3. Shared service environment (addresses come from the manifest) ------------------
export MERIDIAN_DEPLOYMENT="$MANIFEST"
export INDEXER_RPC_URL="$RPC_URL"
export KEEPER_RPC_URL="$RPC_URL"
export KEEPER_PRIVATE_KEY="$KEEPER_KEY"
export KEEPER_DRY_RUN="${KEEPER_DRY_RUN:-true}"
export INDEXER_SNAPSHOT_PATH="$SNAPSHOT"
export API_SIWE_CHAIN_ID="$CHAIN_ID"

# --- 4. Services -----------------------------------------------------------------------
if [ ! -d "$ROOT/node_modules" ]; then
  echo "       installing node dependencies..."
  pnpm install --frozen-lockfile
fi

VENV="$ROOT/backend/margin-engine/.venv"
if [ ! -d "$VENV" ]; then
  echo "[3/4] preparing the margin engine virtualenv ($PYTHON_BIN)..."
  "$PYTHON_BIN" -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -e "$ROOT/backend/margin-engine"
else
  echo "[3/4] margin engine virtualenv ready."
fi

echo "[4/4] launching services (indexer, api, margin engine, keeper, alerts)..."
pnpm --filter @meridian/indexer start >"$DEV_DIR/indexer.log" 2>&1 &
PIDS+=("$!")
pnpm --filter @meridian/api start >"$DEV_DIR/api.log" 2>&1 &
PIDS+=("$!")
pnpm --filter @meridian/alerts start >"$DEV_DIR/alerts.log" 2>&1 &
PIDS+=("$!")
(cd "$ROOT/backend/margin-engine" && "$VENV/bin/python" -m margin_engine.main >"$DEV_DIR/margin-engine.log" 2>&1) &
PIDS+=("$!")
(cd "$ROOT/backend/keeper" && go run ./cmd/keeper >"$DEV_DIR/keeper.log" 2>&1) &
PIDS+=("$!")

cat <<EOF

Meridian dev stack is up.
  anvil          $RPC_URL (chain id $CHAIN_ID)
  API            http://127.0.0.1:3001
  alerts         http://127.0.0.1:3002  (/health /alerts /metrics)
  margin engine  http://127.0.0.1:8000  (/health /parameters)
  keeper         dry-run=$KEEPER_DRY_RUN
  manifest       $MANIFEST
  logs           $DEV_DIR/*.log

Press Ctrl-C to tear everything down.
EOF

if [ "$SEED" = true ]; then
  cat <<EOF
Demo book seeded. Inspect it:
  curl -s http://127.0.0.1:3001/pools | jq
  curl -s http://127.0.0.1:3001/accounts | jq
  curl -s http://127.0.0.1:3002/alerts | jq
Drive a liquidation cascade (the keeper acts on it when started with KEEPER_DRY_RUN=false):
  (cd contracts && forge script script/Seed.s.sol:SeedScript --sig "crash()" --rpc-url $RPC_URL --broadcast)
EOF
fi

wait
