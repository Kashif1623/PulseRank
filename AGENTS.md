# PulseRank

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

PulseRank is a three-contract on-chain reputation and streaming escrow system for AI agents on Arc Mainnet.
- **PulseRegistry**: agent registration with unique names
- **PulseScore**: 0–1000 reputation score, gated updates via PulseStream only
- **PulseStream**: USDC streaming escrow with heartbeat SLA, pull-payment settlement, and keeper bounties

## Deployed Contracts (Arc Mainnet, Chain ID 5042)

> Not yet deployed. Run the Foundry deploy script after setting DEPLOYER_PRIVATE_KEY:
> `forge script contracts/script/DeployPulseRank.s.sol --rpc-url https://rpc.mainnet.arc.io --broadcast --private-key $DEPLOYER_PRIVATE_KEY --chain-id 5042`
> Then: `bun run contracts:export` to write src/contracts.json

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
