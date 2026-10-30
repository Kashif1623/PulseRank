# PulseRank — Autonomous AI Agent Monitoring & Escrow Protocol

Built with [Arc Studio](https://studio.arc.io)

PulseRank is a decentralised reputation and streaming-escrow protocol that lets funders hire AI agents under cryptographically enforced liveness contracts. Agents prove they are alive by sending on-chain heartbeats; missed heartbeats trigger permissionless fund reclamation and automatic score slashing. Every interaction is settled in USDC on Arc Mainnet, where USDC is the native gas token.

---

## Deployed Contracts — Arc Mainnet (Chain ID 5042)

| Contract | Address |
|---|---|
| PulseRegistryV2 | `0x43d74ECe631598746E137CC43a81dFE5C8565aD1` |
| PulseScoreV2 | `0xCBAa6A61A5960Af31A52bcbc32c1EC99a344F1Ed` |
| PulseTaskV2 | `0x4FDF4B96D1d4e3788f33a64dC53e5e2c389Ac1d5` |
| PulseStreamV2 | `0x1C8DB2fD6ED9d9Caea9e04B157DdE031C28e66F8` |

USDC (ERC-20): `0x3600000000000000000000000000000000000000` (6 decimals)

Explorer: https://explorer.arc.io

---

## Key Features

**Streaming Escrow**
Funders lock USDC into a stream directed at a chosen agent. Earnings accrue per second at a fixed rate and are claimable via `claimPayout()` after settlement.

**Live Heartbeat Monitoring**
Three heartbeat modes — Strict (5 min), Normal (30 min), Relaxed (1 h) — with configurable grace periods. Agents call `sendHeartbeat()` to prove liveness and earn reputation points.

**Dead Agent Fund Reclaim**
Any caller can invoke `cancelTimedOutStream()` once an agent misses its heartbeat window. The agent's earned share is preserved; a 5 % penalty on the unearned balance goes to the protocol treasury; the remainder is refunded to the funder. The agent's score is slashed via `recordHardReclaim()`.

**Reputation Scoring**
`PulseScoreV2` tracks a 0–1000 score per agent. Scores increase by 1 per valid heartbeat (when locked balance ≥ 1 USDC), +25 on stream completion, +10 on a won dispute, −100 on hard reclaim, −20 on a lost dispute. Tiers: Bronze < 300, Silver < 600, Gold < 800, Elite ≥ 800.

**Task Milestones**
`PulseTaskV2` lets funders attach milestone-based deliverable proofs (manual, hash, or attester) to a stream. Payout is capped to approved milestone BPS across all settlement paths.

**Event-Driven Candlestick Chart**
The dashboard charts real on-chain events into 2-hour candles: green for heartbeats / completions, red for reclaims / penalties. No mock data — the chart shows a clean empty state until the first real event arrives.

---

## Tech Stack

- **Smart Contracts**: Solidity 0.8.28, OpenZeppelin v5, Foundry (forge, viaIR)
- **Frontend**: React 18, TypeScript, Vite
- **Onchain**: Wagmi v2, Viem v2, ConnectKit
- **Styling**: Tailwind CSS v3, glassmorphism / light blue theme
- **Network**: Arc Mainnet (Chain ID 5042) — USDC as native gas

---

## Local Setup

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Foundry](https://getfoundry.sh) (for contract work)
- Node.js ≥ 18 (for npm/Vercel compatibility)

### Install

```bash
bun install
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `CIRCLE_API_KEY` | Circle Developer API key (mainnet) — required for contract deployment only |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret — required for contract deployment only |

Neither variable is needed to run the frontend locally. The app reads contract addresses from `src/contracts.json` and connects directly to Arc Mainnet via public RPC.

### Run locally

```bash
bun run dev
```

Opens at `http://localhost:5173`.

### Build for production

```bash
npm run build        # outputs to dist/
```

The project is configured for Vercel deployment via `vercel.json` (install command: `npm install --legacy-peer-deps`, output directory: `dist`).

### Run contract tests

```bash
cd contracts && forge test -vv
```

All 40 tests cover `PulseStreamV2`: happy paths, reverts, fuzz (256 runs), and invariants.

---

## Contract Architecture

```
PulseRegistryV2   — agent identity (multi-profile per wallet, unique names)
PulseScoreV2      — reputation 0–1000, tiered (Bronze/Silver/Gold/Elite)
PulseTaskV2       — milestone deliverables, EIP-712 attester signatures
PulseStreamV2     — streaming escrow, heartbeat enforcement, reclaim logic
IPulseV2Interfaces — shared interfaces and VerificationMethod enum
```

`PulseStreamV2` is the hub: it calls `PulseScoreV2.initScore`, `recordHeartbeat`, `recordHardReclaim`, `recordSuccess`, and `PulseTaskV2.approvedBps` on every settlement path. A 2-day timelock governs changes to the dispute contract and treasury address.

---

## Security

- All contracts compiled with `viaIR = true` (stack-depth fix)
- ReentrancyGuard on every state-mutating function
- Pull-payment pattern for all USDC payouts (`pendingPayouts` ledger + `claimPayout()`)
- `triggerReclaim` restricted to stream participants (funder or agent)
- `cancelTimedOutStream` is permissionless but guarded by strict timeout math
- Treasury penalty folds into funder refund when treasury is unset (keepers never blocked)
- Full audit and 40 Foundry tests completed before mainnet deployment
