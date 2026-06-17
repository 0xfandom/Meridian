#!/usr/bin/env bash
#
# Internal pre-audit security pass. Runs the test and invariant suite, format and lint
# checks, and Slither static analysis. Intended to be green before tagging a code freeze
# for an external audit.
#
# Requires: foundry, and (for static analysis) slither-analyzer.
#   pipx install slither-analyzer   # or: pip install slither-analyzer
#
set -euo pipefail
cd "$(dirname "$0")/../contracts"

echo "==> forge fmt --check"
forge fmt --check

echo "==> forge build"
forge build

echo "==> forge test (unit, fuzz, invariant)"
forge test

if command -v slither >/dev/null 2>&1; then
  echo "==> slither static analysis"
  slither . --config-file slither.config.json
else
  echo "==> slither not installed; skipping static analysis (install slither-analyzer to enable)"
fi

echo "==> security pass complete"
