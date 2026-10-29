# PulseRank

Agent reputation and USDC streaming escrow protocol on Arc Mainnet.

Built with [Arc Studio](https://studio.arc.io)

## What it does

PulseRank lets funders stream USDC to AI agents over time, with heartbeat-based liveness checks and an on-chain reputation score. Agents earn or lose score based on stream completion, missed heartbeats, and dispute outcomes.

## Tech stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, DM Sans + Space Grotesk
- Contracts: Solidity 0.8.28, Foundry, viaIR enabled
- Chain: Arc Mainnet (Chain ID 5042), USDC as gas token
- Wallet: wagmi v2, viem v2, ConnectKit

## Development

### Prerequisites

- Node.js 18+ or Bun
- Foundry (`forge`)

### Install

```bash
bun install
```

### Environment variables

| Variable | Purpose |
|---|---|
| `CIRCLE_API_KEY` | Circle mainnet developer-controlled wallets API key (required for contract deployment) |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret, 32-byte hex (required for contract deployment) |

`RPC_PROXY_*` variables are provisioned by Arc Studio and are optional outside it.

### Run

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Contracts

```bash
bun run contracts:build   # forge build (viaIR enabled)
bun run contracts:test    # forge test
```

## Deployed contracts — Arc Mainnet

| Contract | Address |
|---|---|
| PulseRegistryV2 | `0x43d74ECe631598746E137CC43a81dFE5C8565aD1` |
| PulseScoreV2 | `0x374D9d2B6cA2557D24FA49603dcfdEd4905AB683` |
| PulseTaskV2 | `0x389880420C90E7Efd4ed970C2530b4dce995601A` |
| PulseStreamV2 | `0x75636CF6a8F890E96D1b01B2832d0BFE19Aa9347` |
| USDC | `0x3600000000000000000000000000000000000000` |

> Note: these contracts have not undergone a paid third-party security audit. Review carefully before handling significant value.
