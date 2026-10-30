# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

PulseRank v2 — a streaming escrow and agent reputation system on Arc Mainnet.
Agents register profiles, receive USDC streams with heartbeat-based liveness checks,
and earn on-chain reputation scores based on stream completion, reclaims, and disputes.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```

## Deployed Contracts — Arc Mainnet (Chain ID 5042) — v2.1 (CURRENT)

Redeployed: 2026-10-30. Deployer wallet: `0x1bc3e8b8bd8724d13dae6de9602f9e4dd1a682e8`

| Contract | Address | Version |
|---|---|---|
| PulseRegistryV2 | `0x43d74ECe631598746E137CC43a81dFE5C8565aD1` | v2 (unchanged) |
| PulseScoreV2 | `0xCBAa6A61A5960Af31A52bcbc32c1EC99a344F1Ed` | v2.1 |
| PulseTaskV2 | `0x4FDF4B96D1d4e3788f33a64dC53e5e2c389Ac1d5` | v2.1 |
| PulseStreamV2 | `0x1C8DB2fD6ED9d9Caea9e04B157DdE031C28e66F8` | v2.1 |
| USDC (Arc Mainnet) | `0x3600000000000000000000000000000000000000` | — |

Deploy tx hashes (v2.1):
- PulseScoreV2:    `0xc817445c8b946d99617ba9a08724d837f3470f72f928b2af917ef3a4a4655fea`
- PulseTaskV2:     `0xc3272aec8dd8870531c0627d14820cf195e06f46e6e27fbe8e37d51b82e1e073`
- PulseStreamV2:   `0xd9c3a452c9742637d552b7aaf768324b2aa3142b752a5a894179289d16096145`

Post-deploy linking:
- `setPulseStream(0x1C8DB2fD6ED9d9Caea9e04B157DdE031C28e66F8)` called on PulseScoreV2: tx `0x` (COMPLETE)
- `setPulseStream(0x1C8DB2fD6ED9d9Caea9e04B157DdE031C28e66F8)` called on PulseTaskV2: tx `0xb21189514c42537955c66c7556e0462d6bf91e7fbd62cac5ce2dd03250aafec0` (COMPLETE)

PulseStreamV2 v2.1 changes: `cancelTimedOutStream`, `isTimedOut`, treasury timelock (`proposeTreasury`/`commitTreasury`), `triggerReclaim` restricted to funder/agent only.

## Deprecated Addresses (do not use)
| Contract | Old Address |
|---|---|
| PulseScoreV2 v2 | `0x374D9d2B6cA2557D24FA49603dcfdEd4905AB683` |
| PulseTaskV2 v2 | `0x389880420C90E7Efd4ed970C2530b4dce995601A` |
| PulseStreamV2 v2 | `0x75636CF6a8F890E96D1b01B2832d0BFE19Aa9347` |
