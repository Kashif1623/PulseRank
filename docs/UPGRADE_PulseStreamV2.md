# Upgrading PulseStreamV2 on Arc Mainnet

Only `PulseStreamV2` is redeployed. `PulseRegistryV2`, `PulseScoreV2` and `PulseTaskV2` stay where they are.
You run these steps yourself, from your own machine and wallet. Mainnet transactions use real funds and cannot be undone.

## What changed in the contract

- `settleStream` only works on an `Active` stream, so a stream can never be settled or paid out twice.
- A stream where the funder and the agent are the same wallet starts `Active` immediately. `StreamProposed` and `StreamActivated` are both emitted.
- Admin ownership is two-step (`transferOwnership` then `acceptOwnership`), and `renounceOwnership` is disabled.
- Everything else is unchanged: durations, heartbeat intervals, escrow, payouts and every event name and signature.

## Before you start

1. The old stream (`0x6f617A19…`) has two streams, both finished, and no unclaimed payouts. If you have live streams by the time you read this, finish them first. Relinking Score stops heartbeats and timeouts on the old stream.
2. Have a wallet with USDC for gas, and your Circle API key and entity secret for the relink step.
3. Get an independent audit before relying on this with significant funds.

## Steps

1. Deploy: `bash scripts/deploy-stream-v2.sh` (reads constructor arguments from `src/contracts.json`, asks you to type `DEPLOY`).
2. Relink Score and Task to the new stream: `bun run scripts/link-stream.ts --stream <new address>`.
3. Check the wiring (read-only): `bun run scripts/verify-stream-links.ts --stream <new address>`. Every line must say `PASS`.
4. Update the app in one command (the deploy script prints it with the right values):
   `bun run deploy:patch --stream <address> --stream-tx <tx hash> --stream-block <block> --version v2.3 --notes "..."`
   This rewrites `src/contracts.json`, the Docs page, the README and `AGENTS.md`, and points the event scanner at the new contract. The old stream stays in the feed as a legacy source.
5. `bun run check`, then commit and push. The AI assistant, diagnostics, stream cards and event feed all read the address from `src/contracts.json`.

Do not publish the app against the new address before step 2 is done. Until Score is relinked, activating a stream reverts.
