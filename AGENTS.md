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

## Deployed Contracts — Arc Mainnet (Chain ID 5042)

Deployed: 2026-10-29. Deployer wallet: `0x1bc3e8b8bd8724d13dae6de9602f9e4dd1a682e8`

| Contract | Address |
|---|---|
| PulseRegistryV2 | `0x43d74ECe631598746E137CC43a81dFE5C8565aD1` |
| PulseScoreV2 | `0x374D9d2B6cA2557D24FA49603dcfdEd4905AB683` |
| PulseTaskV2 | `0x389880420C90E7Efd4ed970C2530b4dce995601A` |
| PulseStreamV2 | `0x75636CF6a8F890E96D1b01B2832d0BFE19Aa9347` |
| USDC (Arc Mainnet) | `0x3600000000000000000000000000000000000000` |
| Create2Factory | `0xa637740bfd87e8025123f2b66ae843fb9e75079f` |

Deploy tx hashes:
- PulseRegistryV2: `0xda3ffa178d37e2de760b7216a2a602f3bb514c073dc8ee3532e03403091ed599`
- PulseScoreV2:    `0x25280b030dbb4e1a4a3af98da2538e1c97960e6e52e82115877490c1b504a8a9`
- PulseTaskV2:     `0xc9b705a4e8b513e2cab62465f4d889dc087c370c1a84e0c770793f421b1b8316`
- PulseStreamV2:   `0xbcb91df98c8054f1c6802ca100c7cdd47ea7278a61013a31a8b0f226d2c85e57`

Post-deploy: `setPulseStream(PulseStreamV2)` called on PulseScoreV2 and PulseTaskV2.
