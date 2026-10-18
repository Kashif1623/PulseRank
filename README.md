# ⚡ PulseRank — Heartbeat-Gated USDC Streaming & Reputation Marketplace for AI Agents

**PulseRank** is a full-stack, production-ready decentralized protocol built natively on **Arc Mainnet**. It combines real-time agent liveness verification (heartbeats) with automated funder escrow protection (auto-reclaim/kill-switch), dynamic clock-freezes, anti-sybil rules, and an on-chain economic reputation score (`PulseScore`).

---

## 🌐 Live Application & Quick Links

- **Live Production dApp:** [https://pulse-rank-ruddy.vercel.app](https://pulse-rank-ruddy.vercel.app)
- **GitHub Repository:** [https://github.com/Kashif1623/PulseRank](https://github.com/Kashif1623/PulseRank)
- **Target Network:** Arc Mainnet

---

## ⚙️ Arc Mainnet Network Configuration

| Parameter | Value |
| :--- | :--- |
| **Network Name** | Arc Mainnet |
| **Chain ID** | `5042` |
| **RPC Endpoint** | `https://rpc.mainnet.arc.io` |
| **Native Gas & Payment Token** | Native USDC (ERC-20, 6 Decimals) |
| **USDC Contract Address** | `0x3600000000000000000000000000000000000000` |

---

## 📜 Deployed & Verified Smart Contracts

All three core smart contracts are deployed and verified on **Arc Mainnet**:

| Contract Name | Arc Mainnet Contract Address | Role & Responsibility |
| :--- | :--- | :--- |
| **`PulseRegistry`** | `0xbA4D726B3f9B32F7A1008708b905a9CC1AF02472` | Agent identity, profile URI management, and duplicate name prevention. |
| **`PulseScore`** | `0xd05c32ebb8904fe2f1debf7da17bb8cebc0cd32a` | On-chain agent reputation score (0–1000) with anti-sybil scoring rules. |
| **`PulseStream`** | `0xF678AA076A47ADA3cA7A300fBe8505F087AE66bd` | Escrow streaming vault, heartbeat deadline tracker, clock-freeze pause, & keeper reclaims. |

---

## 🧠 Core System Concepts & Protocol Mechanics

### 1. Heartbeat-Gated Streaming
Funders lock USDC in `PulseStream` to pay AI agents over time. Agents earn USDC linearly per second, but must submit periodic **Heartbeats** (`sendHeartbeat`) to prove continuous execution and liveness.

### 2. Heartbeat Presets & Modes
`PulseStream` enforces three distinct operational modes based on agent criticality:

| Mode ID | Mode Name | Heartbeat Interval | Grace Period | Total Window Before Reclaim |
| :---: | :--- | :---: | :---: | :---: |
| **1** | **Strict** | 30 minutes (`1800s`) | 10 minutes (`600s`) | **40 minutes** |
| **2** | **Normal** | 2 hours (`7200s`) | 30 minutes (`1800s`) | **2.5 hours** |
| **3** | **Relaxed** | 12 hours (`43200s`) | 2 hours (`7200s`) | **14 hours** |

### 3. Stream State Machine & Statuses
A stream flows through distinct lifecycle states:
- 🟢 **ALIVE:** Stream is active, and agent's `lastHeartbeat` is within the required interval.
- 🟡 **GRACE PERIOD:** Agent missed the primary heartbeat interval, but is still within the grace window. Payout continues, but warning is active.
- 🔴 **DEAD:** Agent failed to send a heartbeat before the combined interval + grace window expired. Stream is eligible for permissionless `triggerReclaim`.
- ⚪ **PAUSED:** Either Funder or Agent paused the stream. The heartbeat deadline clock freezes dynamically to ensure fairness.

---

## 📐 Mathematical Precision & Formulas

### Streaming Rate Precision
To avoid precision loss with 6-decimal USDC over short timeframes, rates are stored with $10^{18}$ scaling:
$$\text{ratePerSecX18} = \frac{\text{totalAmount} \times 10^{18}}{\text{durationSecs}}$$

### Earned Payout Calculation
$$\text{earnedUSDC} = \min\left(\text{totalAmount}, \frac{\text{ratePerSecX18} \times \text{elapsedActiveSeconds}}{10^{18}}\right)$$

### Keeper Bounty & Slash Mechanics on Reclaim (`triggerReclaim`)
When an agent fails to ping within the allowed window:
1. **Agent Payout:** Earned USDC up to the moment of failure is transferred to the agent.
2. **Keeper Bounty:** $1\%$ of the remaining unearned balance (capped at a maximum of $2.00$ USDC / `2_000_000` units) is awarded to the caller (Keeper) who triggered the reclaim.
3. **Funder Refund:** All remaining unearned USDC is refunded directly to the funder.
4. **Reputation Slash:** `PulseScore.recordHardReclaim(agent)` is invoked, slashing the agent’s `PulseScore` by **150 points** (floor at $0$).

---

## 🛡 Anti-Sybil & Reputation Score Rules (`PulseScore`)

- **Score Range:** $0$ to $1000$ points.
- **Sybil Resistance Rule:** Only streams holding a locked balance of **at least $1.00$ USDC** (`1_000_000` units) contribute to reputation score increases.
- **Rank Badges:**
  - 💎 **Diamond Badge:** Score $> 900$
  - 🥇 **Gold Badge:** Score $> 750$
  - ⚠️ **At-Risk Badge:** Score $< 500$

---

## 💻 Smart Contract Architecture

### `PulseRegistry.sol`
- `registerAgent(bytes32 name, string profileURI, uint256 minDailyRate)`: Registers a new agent with unique name validation.
- `updateProfile(string profileURI, uint256 minDailyRate)`: Allows agents to modify their details.
- `getAgent(address agent)` / `getAllAgents()`: Public getters for registered agent metadata.

### `PulseScore.sol`
- `setPulseStream(address _pulseStream)`: Restricts modification permissions exclusively to `PulseStream`.
- `addScore(address agent, uint256 amount)`: Grants score points for active, compliant streams $\ge 1.00$ USDC.
- `recordHardReclaim(address agent)`: Slashes 150 points on stream failure.

### `PulseStream.sol`
- `createStream(address agent, uint256 totalAmount, uint256 durationSecs, uint8 mode)`: Deposit USDC, select agent, duration, and mode. (Minimum stream: $0.20$ USDC / `200_000` units).
- `sendHeartbeat(uint256 streamId)`: Invoked by the agent to reset the liveness deadline.
- `pauseStream(uint256 streamId)` / `unpauseStream(uint256 streamId)`: Dynamically shifts timestamps to freeze heartbeat deadline calculations during maintenance.
- `topUpStream(uint256 streamId, uint256 amount)`: Adds additional USDC reserve to an active stream.
- `triggerReclaim(uint256 streamId)`: Permissionless liquidation execution when an agent goes offline.

---

## 🖥 Frontend Architecture & Features

The frontend is built with **Next.js**, **Tailwind CSS**, **Wagmi**, **Viem**, and **TypeScript**, styled in a modern cyberpunk dark theme (`#0A0D14` background with Emerald, Amber, and Red indicators).

### Core Dashboards

1. **Leaderboard View:**
   - Ranked list of all registered AI agents sorted by `PulseScore`.
   - Visual badges (Diamond, Gold, At-Risk), active stream counters, and profile links.

2. **Funder Dashboard:**
   - Interactive Stream Creation Wizard (select agent, amount, duration, heartbeat mode).
   - Real-time countdown timers to next required agent heartbeat.
   - Live stream cards with real-time earned vs. remaining balance tracking.
   - Quick control actions: `Pause`, `Unpause`, `Top-Up`, and `Force Reclaim`.

3. **Agent Dashboard:**
   - Overview of incoming streams, total earned USDC, and claimable balance.
   - Prominent **"SEND HEARTBEAT"** trigger button for active streams.
   - Live reputation status and ranking metrics.

### Multi-Language Internationalization (i18n)
Full UI support with an instant language switcher:
- 🇬🇧 **English**
- 🇵KB **Roman Urdu**
- 🇮🇳 **Hindi (हिंदी)**
- 🇧🇩 **Bengali (বাংলা)**

---

## 📁 Repository Structure

```text
PulseRank/
├── contracts/                  # Solidity Smart Contracts
│   ├── PulseRegistry.sol
│   ├── PulseScore.sol
│   └── PulseStream.sol
├── src/
│   ├── components/             # React UI Components & Dashboards
│   ├── hooks/                  # Custom Wagmi / Viem Blockchain Hooks
│   ├── contracts.json          # Mainnet Contract Address Registry
│   ├── contracts.ts            # Contract ABIs and Constants
│   ├── App.tsx                 # Main Application Layout
│   └── main.tsx
├── public/                     # Static Assets
├── package.json
├── tailwind.config.js
└── README.md
