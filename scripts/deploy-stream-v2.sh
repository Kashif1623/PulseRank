#!/usr/bin/env bash
# Deploys ONLY PulseStreamV2 to Arc Mainnet (chain 5042) from YOUR wallet.
# Run this on your own machine, outside Arc Studio. It never touches Registry, Score or Task.
#
#   export PRIVATE_KEY=0x...        # wallet that pays gas (Arc gas is USDC). Never commit it.
#   export STREAM_OWNER=0x...       # optional: admin of the new stream (defaults to contracts.json deployer)
#   bash scripts/deploy-stream-v2.sh
#
# Prefer a keystore or hardware wallet? Replace `--private-key "$PRIVATE_KEY"` below with
# `--account <name>` (keystore) or `--ledger`, and drop the PRIVATE_KEY requirement.
set -euo pipefail

: "${PRIVATE_KEY:?Set PRIVATE_KEY to the key of the wallet that pays gas}"
RPC="${ARC_RPC_URL:-https://rpc.mainnet.arc.io}"

# Constructor arguments come from src/contracts.json so they cannot drift from the app.
read -r USDC REGISTRY SCORE TASK DEFAULT_OWNER < <(bun -e '
  const j = require("./src/contracts.json");
  console.log([j.usdc, j.contracts.PulseRegistryV2.address, j.contracts.PulseScoreV2.address, j.contracts.PulseTaskV2.address, j.deployer].join(" "));
')
OWNER="${STREAM_OWNER:-$DEFAULT_OWNER}"

CHAIN_ID="$(cast chain-id --rpc-url "$RPC")"
if [ "$CHAIN_ID" != "5042" ]; then
  echo "Refusing to deploy: RPC reports chain id $CHAIN_ID, expected 5042 (Arc Mainnet)." >&2
  exit 1
fi

echo "About to deploy PulseStreamV2 to Arc Mainnet (5042). This spends real funds and cannot be undone."
echo "  USDC     $USDC"
echo "  Registry $REGISTRY"
echo "  Score    $SCORE"
echo "  Task     $TASK"
echo "  Owner    $OWNER"
read -r -p "Type DEPLOY to continue: " CONFIRM
[ "$CONFIRM" = "DEPLOY" ] || { echo "Aborted."; exit 1; }

forge build

OUT="$(forge create contracts/PulseStreamV2.sol:PulseStreamV2 \
  --rpc-url "$RPC" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --constructor-args "$USDC" "$REGISTRY" "$SCORE" "$TASK" "$OWNER")"
echo "$OUT"

ADDR="$(echo "$OUT" | awk '/Deployed to:/ {print $3}')"
TX="$(echo "$OUT" | awk '/Transaction hash:/ {print $3}')"
BLOCK="$(cast receipt "$TX" blockNumber --rpc-url "$RPC")"

cat <<EOF

Deployed PulseStreamV2: $ADDR
Transaction:            $TX
Block:                  $BLOCK

Next (see docs/UPGRADE_PulseStreamV2.md):
  1. bun run scripts/link-stream.ts --stream $ADDR      # relink Score and Task (needs your Circle credentials)
  2. bun run scripts/verify-stream-links.ts --stream $ADDR
  3. bun run deploy:patch --stream $ADDR --stream-tx $TX --stream-block $BLOCK --version v2.3 --notes "Settle guard + self-stream auto-activation"
EOF
