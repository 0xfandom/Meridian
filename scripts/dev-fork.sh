#!/usr/bin/env bash
#
# Start a local anvil node forked from Ethereum mainnet for development.
#
# Usage:
#   cp .env.example .env   # then set MAINNET_RPC_URL
#   ./scripts/dev-fork.sh   # extra args are passed through to anvil
#
set -euo pipefail

# Load .env if present.
if [ -f "$(dirname "$0")/../.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$(dirname "$0")/../.env"
  set +a
fi

RPC="${MAINNET_RPC_URL:-}"
if [ -z "$RPC" ]; then
  echo "MAINNET_RPC_URL is not set. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

echo "Starting anvil mainnet fork on http://127.0.0.1:8545 (chain id 31337)..."
exec anvil --fork-url "$RPC" --chain-id 31337 "$@"
