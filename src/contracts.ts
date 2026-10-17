/**
 * PulseRank contract bindings — addresses + ABIs for Arc Mainnet (5042).
 * Addresses are loaded from src/contracts.json (populated by `bun run contracts:export`).
 */
import type { Abi, Address } from 'viem'

// ─── ABI fragments ──────────────────────────────────────────────────────────

export const REGISTRY_ABI = [
  // Events
  { type: 'event', name: 'AgentRegistered', inputs: [
    { name: 'agent', type: 'address', indexed: true },
    { name: 'name', type: 'bytes32', indexed: true },
    { name: 'profileURI', type: 'string', indexed: false },
    { name: 'minDailyRate', type: 'uint256', indexed: false },
  ]},
  // View functions
  { type: 'function', name: 'agents', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [
      { name: 'name', type: 'bytes32' },
      { name: 'profileURI', type: 'string' },
      { name: 'minDailyRate', type: 'uint256' },
      { name: 'registered', type: 'bool' },
    ]},
  { type: 'function', name: 'getAgent', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: 'agentData', type: 'tuple', components: [
      { name: 'name', type: 'bytes32' },
      { name: 'profileURI', type: 'string' },
      { name: 'minDailyRate', type: 'uint256' },
      { name: 'registered', type: 'bool' },
    ]}]},
  { type: 'function', name: 'getRegisteredCount', stateMutability: 'view',
    inputs: [], outputs: [{ name: 'count', type: 'uint256' }]},
  { type: 'function', name: 'getRegisteredAgents', stateMutability: 'view',
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ name: 'slice', type: 'address[]' }]},
  // Write functions
  { type: 'function', name: 'registerAgent', stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'bytes32' },
      { name: 'profileURI', type: 'string' },
      { name: 'minDailyRate', type: 'uint256' },
    ], outputs: []},
  { type: 'function', name: 'updateProfileURI', stateMutability: 'nonpayable',
    inputs: [{ name: 'newURI', type: 'string' }], outputs: []},
  { type: 'function', name: 'updateMinDailyRate', stateMutability: 'nonpayable',
    inputs: [{ name: 'newRate', type: 'uint256' }], outputs: []},
] as const satisfies Abi

export const SCORE_ABI = [
  { type: 'function', name: 'scores', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]},
  { type: 'function', name: 'getScore', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]},
  { type: 'function', name: 'hasScore', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }]},
] as const satisfies Abi

export const STREAM_ABI = [
  // Events
  { type: 'event', name: 'StreamProposed', inputs: [
    { name: 'streamId', type: 'uint256', indexed: true },
    { name: 'funder', type: 'address', indexed: true },
    { name: 'agent', type: 'address', indexed: true },
    { name: 'totalAmount', type: 'uint256', indexed: false },
    { name: 'durationSecs', type: 'uint256', indexed: false },
    { name: 'mode', type: 'uint8', indexed: false },
  ]},
  { type: 'event', name: 'StreamCreated', inputs: [
    { name: 'streamId', type: 'uint256', indexed: true },
    { name: 'funder', type: 'address', indexed: true },
    { name: 'agent', type: 'address', indexed: true },
    { name: 'totalAmount', type: 'uint256', indexed: false },
    { name: 'durationSecs', type: 'uint256', indexed: false },
    { name: 'mode', type: 'uint8', indexed: false },
  ]},
  { type: 'event', name: 'HeartbeatSent', inputs: [
    { name: 'streamId', type: 'uint256', indexed: true },
    { name: 'agent', type: 'address', indexed: true },
    { name: 'newEarned', type: 'uint256', indexed: false },
    { name: 'timestamp', type: 'uint256', indexed: false },
  ]},
  { type: 'event', name: 'StreamReclaimed', inputs: [
    { name: 'streamId', type: 'uint256', indexed: true },
    { name: 'keeper', type: 'address', indexed: true },
    { name: 'earnedByAgent', type: 'uint256', indexed: false },
    { name: 'keeperBounty', type: 'uint256', indexed: false },
    { name: 'refundToFunder', type: 'uint256', indexed: false },
  ]},
  { type: 'event', name: 'StreamSettled', inputs: [
    { name: 'streamId', type: 'uint256', indexed: true },
    { name: 'agent', type: 'address', indexed: true },
    { name: 'earnedByAgent', type: 'uint256', indexed: false },
    { name: 'refundToFunder', type: 'uint256', indexed: false },
  ]},
  { type: 'event', name: 'StreamPaused', inputs: [
    { name: 'streamId', type: 'uint256', indexed: true },
    { name: 'timestamp', type: 'uint256', indexed: false },
  ]},
  { type: 'event', name: 'StreamUnpaused', inputs: [
    { name: 'streamId', type: 'uint256', indexed: true },
    { name: 'pausedDuration_', type: 'uint256', indexed: false },
  ]},
  { type: 'event', name: 'PayoutClaimed', inputs: [
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ]},
  // Constants
  { type: 'function', name: 'MIN_AMOUNT', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }]},
  { type: 'function', name: 'MAX_KEEPER_BOUNTY', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }]},
  { type: 'function', name: 'MAX_PAUSE_DURATION', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }]},
  // View functions
  { type: 'function', name: 'streams', stateMutability: 'view',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [{ name: '', type: 'tuple', components: [
      { name: 'funder', type: 'address' },
      { name: 'agent', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'durationSecs', type: 'uint256' },
      { name: 'ratePerSecX18', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'lastHeartbeat', type: 'uint256' },
      { name: 'earnedAmount', type: 'uint256' },
      { name: 'pausedAt', type: 'uint256' },
      { name: 'pausedDuration', type: 'uint256' },
      { name: 'mode', type: 'uint8' },
      { name: 'status', type: 'uint8' }, // 0=Proposed, 1=Active, 2=Closed
    ]}]},
  { type: 'function', name: 'getStream', stateMutability: 'view',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [{ name: 'stream', type: 'tuple', components: [
      { name: 'funder', type: 'address' },
      { name: 'agent', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'durationSecs', type: 'uint256' },
      { name: 'ratePerSecX18', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'lastHeartbeat', type: 'uint256' },
      { name: 'earnedAmount', type: 'uint256' },
      { name: 'pausedAt', type: 'uint256' },
      { name: 'pausedDuration', type: 'uint256' },
      { name: 'mode', type: 'uint8' },
      { name: 'status', type: 'uint8' },
    ]}]},
  { type: 'function', name: 'nextStreamId', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }]},
  { type: 'function', name: 'getModeConfig', stateMutability: 'view',
    inputs: [{ name: 'mode', type: 'uint8' }],
    outputs: [{ name: 'config', type: 'tuple', components: [
      { name: 'heartbeatInterval', type: 'uint256' },
      { name: 'gracePeriod', type: 'uint256' },
    ]}]},
  { type: 'function', name: 'computeEarned', stateMutability: 'view',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [{ name: 'earned', type: 'uint256' }]},
  { type: 'function', name: 'agentStreams', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }, { name: 'index', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }]},
  { type: 'function', name: 'funderStreams', stateMutability: 'view',
    inputs: [{ name: 'funder', type: 'address' }, { name: 'index', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }]},
  { type: 'function', name: 'getAgentStreams', stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: 'ids', type: 'uint256[]' }]},
  { type: 'function', name: 'getFunderStreams', stateMutability: 'view',
    inputs: [{ name: 'funder', type: 'address' }],
    outputs: [{ name: 'ids', type: 'uint256[]' }]},
  { type: 'function', name: 'pendingPayouts', stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]},
  // Write functions
  { type: 'function', name: 'proposeStream', stateMutability: 'nonpayable',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'durationSecs', type: 'uint256' },
      { name: 'mode', type: 'uint8' },
    ], outputs: [{ name: 'streamId', type: 'uint256' }]},
  { type: 'function', name: 'acceptStream', stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: []},
  { type: 'function', name: 'cancelProposal', stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: []},
  { type: 'function', name: 'sendHeartbeat', stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: []},
  { type: 'function', name: 'pauseStream', stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: []},
  { type: 'function', name: 'unpauseStream', stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: []},
  { type: 'function', name: 'forceUnpause', stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: []},
  { type: 'function', name: 'triggerReclaim', stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: []},
  { type: 'function', name: 'settleStream', stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: []},
  { type: 'function', name: 'claimPayout', stateMutability: 'nonpayable',
    inputs: [], outputs: []},
] as const satisfies Abi

export const USDC_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }]},
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]},
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]},
] as const satisfies Abi

// ─── Addresses ───────────────────────────────────────────────────────────────

export const USDC_ADDRESS: Address = '0x3600000000000000000000000000000000000000'

// These will be replaced by real addresses after deploy + bun run contracts:export
// For now they point to zero address — the app shows a "Not deployed" banner
export const REGISTRY_ADDRESS: Address = '0xbA4D726B3f9B32F7A1008708b905a9CC1AF02472'
export const SCORE_ADDRESS: Address = '0xd05c32ebb8904fe2f1debf7da17bb8cebc0cd32a'
export const STREAM_ADDRESS: Address = '0x0000000000000000000000000000000000000000'

export const CONTRACTS_DEPLOYED =
  REGISTRY_ADDRESS !== '0x0000000000000000000000000000000000000000'

// ─── Types ────────────────────────────────────────────────────────────────────

export const STREAM_STATUS = {
  Proposed: 0,
  Active: 1,
  Closed: 2,
} as const

export type StreamStatus = typeof STREAM_STATUS[keyof typeof STREAM_STATUS]

export interface StreamData {
  funder: Address
  agent: Address
  totalAmount: bigint
  durationSecs: bigint
  ratePerSecX18: bigint
  startTime: bigint
  lastHeartbeat: bigint
  earnedAmount: bigint
  pausedAt: bigint
  pausedDuration: bigint
  mode: number
  status: number
}

export const MODE_LABELS: Record<number, string> = {
  1: 'Strict',
  2: 'Normal',
  3: 'Relaxed',
}

export const MODE_INTERVALS: Record<number, { interval: number; grace: number }> = {
  1: { interval: 1800, grace: 600 },
  2: { interval: 7200, grace: 1800 },
  3: { interval: 43200, grace: 7200 },
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export const USDC_DECIMALS = 6

export function formatUsdc(raw: bigint, dp = 2): string {
  const n = Number(raw) / 1e6
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export function parseUsdc(amount: string): bigint {
  const n = parseFloat(amount)
  if (isNaN(n)) return 0n
  return BigInt(Math.round(n * 1e6))
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatBytes32Name(b: `0x${string}`): string {
  // Remove trailing null bytes and decode as UTF-8
  const hex = b.slice(2)
  let str = ''
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16)
    if (byte === 0) break
    str += String.fromCharCode(byte)
  }
  return str || b.slice(0, 10) + '…'
}

export function formatCountdown(secs: number): string {
  if (secs <= 0) return '0s'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function getStreamHealth(
  stream: StreamData,
  now: number,
): 'proposed' | 'alive' | 'grace' | 'dead' | 'paused' | 'closed' {
  if (stream.status === STREAM_STATUS.Closed) return 'closed'
  if (stream.status === STREAM_STATUS.Proposed) return 'proposed'
  if (stream.pausedAt > 0n) return 'paused'
  const { interval, grace } = MODE_INTERVALS[stream.mode] ?? { interval: 7200, grace: 1800 }
  const sinceHb = now - Number(stream.lastHeartbeat)
  if (sinceHb < interval) return 'alive'
  if (sinceHb < interval + grace) return 'grace'
  return 'dead'
}
