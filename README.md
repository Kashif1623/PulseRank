# PulseRank — Autonomous AI Agent Monitoring & Escrow Protocol

Built with [Arc Studio](https://studio.arc.io)

PulseRank is a decentralised reputation and streaming-escrow protocol that lets funders hire AI agents under cryptographically enforced liveness contracts. Agents prove they are alive by sending on-chain heartbeats; missed heartbeats trigger permissionless fund reclamation and automatic score slashing. Every interaction is settled in USDC on Arc Mainnet, where USDC is the native gas token.

---

## Deployed Contracts — Arc Mainnet (Chain ID 5042)

| Contract | Address |
|---|---|
| PulseRegistryV2 | `0x43d74ECe631598746E137CC43a81dFE5C8565aD1` |
| PulseScoreV2 | `0x418FC1385B55Bd1b26B0c5B7094502ed094864Ce` |
| PulseTaskV2 | `0x8f893D6ad7fa39C881468C556c279b56306C193B` |
| PulseStreamV2 | `0x6f617A19Bc676BffAb6ba857062c43d52f669613` |

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

**Stream Lifecycle — Proposal and Agent Acceptance**
Funders propose a stream via `proposeStream()` (minimum 0.20 USDC enforced both on-chain and in the UI). The stream sits in `Proposed` state until the assigned agent calls `acceptStream()`, which starts time accrual. The UI shows an "✅ Accept Stream" button on every Proposed card in the Agent dashboard. Early-exit is available via `triggerReclaim()` (participant-only) or `cancelTimedOutStream()` (permissionless, after timeout).

**Self-Streams, Claim Earnings and Stream Again** (upgraded contract)
When you stream to your own agent wallet, the stream starts Active straight away with no Accept step. When a stream's time is up, the card shows **Claim Earnings** (agent) or **Settle & Reclaim Unspent USDC** (funder), then **Withdraw** to send the USDC to your wallet. A finished stream also offers **Stream Again & Boost Score**, which opens the Funder form pre-filled with the same agent, amount, duration and mode. A stream can only be settled once.

**Manual Heartbeat Trigger**
Each active stream card in the Agent dashboard shows a live heartbeat button. When the heartbeat interval has elapsed, the button lights up as "⚡ Send Manual Heartbeat" and calls `PulseStreamV2.sendHeartbeat(streamId)` via the connected wallet. When the interval has not yet elapsed, the button shows a live countdown ("Next heartbeat in 23m") that ticks every 5 seconds client-side. Mode intervals: Strict = 5 min, Normal = 30 min, Relaxed = 60 min.

**PulseRank AI Assistant — Deep Thinking and Live Wallet Diagnosis**
The floating assistant answers questions about the protocol (streams, heartbeat modes, reputation score, timeouts, escrow settlement, Arc and gas) in English, Roman Urdu or Urdu. Each reply opens with a collapsible "Deep Thinking" box that lists the steps it actually took. Ask "scan my wallet", "why is my agent at risk?" or "kya masla aya hai?" (or paste a 0x address) and it reads Arc Mainnet live for that wallet: registry profile, score, streams, heartbeat logs, pending payout and gas balance. It then states the root cause and the steps to fix it, with buttons that jump to the right tab. It is a rule-based engine, not a hosted language model, so it needs no API key.

**AI Inspector — Client-Side Agent Health Analysis**
Every agent entry surfaces an AI Inspector verdict generated entirely from live contract reads — no external API or model call. `generateVerdict()` scores six dimensions: score health, heartbeat reliability, performance win-rate, dispute history, sample confidence, and trend signal. It produces a status label (TRUSTED / ACTIVE / NEEDS ATTENTION / UNVERIFIED / AT RISK / DEAD), a contextual summary sentence, an actionable recommendation, and a confidence percentage. The inspector appears in three places: expanded rows in the Leaderboard, the Agent tab reputation section, and the Funder tab agent preview.

**Event-Driven Candlestick Chart and Persistent Activity Feed**
The Protocol Activity chart plots real on-chain events into daily candles: green for heartbeats, activations and completions, red for reclaims. The feed reads the contracts' event logs from their deployment blocks (never from block 0), remembers how far it has scanned, and keeps a local copy so a page refresh never empties the chart or the feed. Streams from previously deployed stream contracts stay in the history.

## Upgrading the stream contract

See [docs/UPGRADE_PulseStreamV2.md](docs/UPGRADE_PulseStreamV2.md) for the deploy, relink, verify and `deploy:patch` steps.

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
