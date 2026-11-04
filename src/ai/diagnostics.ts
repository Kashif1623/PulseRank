import { hexToString, type PublicClient } from "viem";
import contractsJson from "../contracts.json";
import { STREAM_DEPLOY_BLOCK } from "../feedScan";

// Live, read-only scan of one wallet on Arc Mainnet (chain 5042) through the viem public client.
// Every number returned here comes from a contract call or an event log, never from a guess.

const C = contractsJson.contracts;
export const REGISTRY = C.PulseRegistryV2.address as `0x${string}`;
export const SCORE = C.PulseScoreV2.address as `0x${string}`;
export const STREAM = C.PulseStreamV2.address as `0x${string}`;

export type StepStatus = "run" | "ok" | "warn" | "fail";
export interface ThinkStep { label: string; detail?: string; status: StepStatus; ms?: number }

/** Receives each reasoning step as it happens so the UI can show the work live. */
export interface Reporter {
  start(label: string): number;
  finish(i: number, status: Exclude<StepStatus, "run">, detail?: string): void;
}

const ABI = [
  { name: "getAgentsByOwner", type: "function", stateMutability: "view", inputs: [{ name: "o", type: "address" }], outputs: [{ type: "uint256[]" }] },
  { name: "agents", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "bytes32" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" }, { type: "address" }] },
  { name: "getStats", type: "function", stateMutability: "view", inputs: [{ name: "a", type: "address" }],
    outputs: [{ type: "uint256" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
  { name: "agentStreams", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "funderStreams", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "pendingPayouts", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getModeConfig", type: "function", stateMutability: "view", inputs: [{ type: "uint8" }], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { name: "getStream", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "funder", type: "address" }, { name: "agent", type: "address" }, { name: "totalAmount", type: "uint256" },
      { name: "durationSecs", type: "uint256" }, { name: "ratePerSecX18", type: "uint256" }, { name: "startTime", type: "uint256" },
      { name: "lastHeartbeat", type: "uint256" }, { name: "earnedAmount", type: "uint256" }, { name: "pausedAt", type: "uint256" },
      { name: "pausedDuration", type: "uint256" }, { name: "missedHeartbeats", type: "uint256" }, { name: "lastMissCheckpoint", type: "uint256" },
      { name: "taskId", type: "uint256" }, { name: "mode", type: "uint8" }, { name: "status", type: "uint8" }] }] },
] as const;

const HEARTBEAT_EVENT = {
  name: "HeartbeatSent", type: "event",
  inputs: [
    { name: "streamId", type: "uint256", indexed: true },
    { name: "timestamp", type: "uint256", indexed: false },
    { name: "newEarned", type: "uint256", indexed: false },
    { name: "missedHeartbeats", type: "uint256", indexed: false },
  ],
} as const;

const DEFAULT_MODES: Record<number, [number, number]> = { 1: [300, 600], 2: [1800, 1800], 3: [3600, 7200] };

export interface StreamFacts {
  id: number;
  asAgent: boolean;
  asFunder: boolean;
  funder: string;
  agent: string;
  status: number;            // 0 Proposed 1 Active 2 Paused 3 Completed 4 Reclaimed 5 Cancelled
  mode: number;
  total: bigint;
  earned: bigint;
  durationSecs: number;
  startTime: number;
  lastHeartbeat: number;
  pausedDuration: number;
  elapsed: number;           // running time (pauses excluded), capped at duration
  ended: boolean;            // Active and elapsed >= duration
  interval: number;
  grace: number;
  sinceHeartbeat: number;    // seconds since the last heartbeat (0 if not started)
  timedOut: boolean;         // Active and past lastHeartbeat + interval + grace
  heartbeats: number | null; // HeartbeatSent logs counted for this stream
  heartbeatsPartial: boolean;
}

export interface WalletFacts {
  address: `0x${string}`;
  nowSec: number;
  headBlock: bigint;
  registered: boolean;
  profiles: { id: number; name: string; active: boolean }[];
  score: { value: number; tier: string; success: number; failed: number; disputesAgainst: number; disputesWon: number } | null;
  pending: bigint;
  gasBalance: bigint | null; // native USDC (18 decimals)
  streams: StreamFacts[];
  streamsScanned: number;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const isRateLimit = (e: unknown) => /exceeds defined limit|rate limit|429|too many/i.test(e instanceof Error ? e.message : String(e));

/** Retries RPC rate limits with backoff; a contract revert is rethrown immediately. */
async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!isRateLimit(e)) throw e;
      await sleep(900 * (i + 1));
    }
  }
  throw last;
}

function normalizeStream(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const names = ["funder", "agent", "totalAmount", "durationSecs", "ratePerSecX18", "startTime", "lastHeartbeat", "earnedAmount",
    "pausedAt", "pausedDuration", "missedHeartbeats", "lastMissCheckpoint", "taskId", "mode", "status"];
  const o: Record<string, unknown> = Array.isArray(raw) ? Object.fromEntries(names.map((n, i) => [n, raw[i]])) : (raw as Record<string, unknown>);
  if (typeof o.agent !== "string" || typeof o.funder !== "string") return null;
  return o as { funder: string; agent: string; totalAmount: bigint; durationSecs: bigint; startTime: bigint; lastHeartbeat: bigint;
    earnedAmount: bigint; pausedDuration: bigint; mode: number; status: number };
}

/** agentStreams / funderStreams are public arrays: read index 0,1,2... until the call reverts. */
async function listIds(client: PublicClient, fn: "agentStreams" | "funderStreams", who: `0x${string}`): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < 60; i++) {
    try {
      const id = await retry(() => client.readContract({ address: STREAM, abi: ABI, functionName: fn, args: [who, BigInt(i)] }));
      ids.push(Number(id));
    } catch (e) {
      if (isRateLimit(e)) throw e;
      break; // index out of range: that was the last one
    }
  }
  return ids;
}

async function countHeartbeats(client: PublicClient, id: number, startTime: number, head: bigint, nowSec: number) {
  // Look back only as far as this stream has existed (generous 3 blocks/s), in 9,000-block windows.
  const span = BigInt(Math.max(600, (nowSec - startTime + 300) * 3));
  const from = head > span ? head - span : 0n;
  const floor = from > STREAM_DEPLOY_BLOCK ? from : STREAM_DEPLOY_BLOCK;
  let count = 0;
  let partial = false;
  let windows = 0;
  for (let start = floor; start <= head; start += 9_000n) {
    if (windows++ >= 4) { partial = true; break; }
    const end = start + 8_999n < head ? start + 8_999n : head;
    const logs = await retry(() => client.getLogs({
      address: STREAM, event: HEARTBEAT_EVENT, args: { streamId: BigInt(id) }, fromBlock: start, toBlock: end,
    }));
    count += logs.length;
    await sleep(200);
  }
  return { count, partial };
}

export async function scanWallet(client: PublicClient, address: `0x${string}`, report: Reporter): Promise<WalletFacts> {
  const nowSec = Math.floor(Date.now() / 1000);

  let i = report.start("Connecting to Arc Mainnet (chain 5042) over public RPC");
  const headBlock = await retry(() => client.getBlockNumber());
  report.finish(i, "ok", `latest block ${headBlock.toString()}`);

  i = report.start("Reading PulseRegistryV2: is this wallet a registered agent?");
  const profiles: WalletFacts["profiles"] = [];
  try {
    const ids = await retry(() => client.readContract({ address: REGISTRY, abi: ABI, functionName: "getAgentsByOwner", args: [address] }));
    for (const id of ids.slice(0, 5)) {
      const p = await retry(() => client.readContract({ address: REGISTRY, abi: ABI, functionName: "agents", args: [id] }));
      let name = `Agent #${id.toString()}`;
      try { name = hexToString(p[0], { size: 32 }).replace(/\0/g, "").trim() || name; } catch { /* keep default */ }
      profiles.push({ id: Number(id), name, active: p[4] });
    }
    report.finish(i, profiles.length ? "ok" : "warn", profiles.length ? profiles.map(p => p.name).join(", ") : "no agent profile for this wallet");
  } catch {
    report.finish(i, "fail", "registry read failed");
  }

  i = report.start("Reading PulseScoreV2: reputation score and tier");
  let score: WalletFacts["score"] = null;
  try {
    const s = await retry(() => client.readContract({ address: SCORE, abi: ABI, functionName: "getStats", args: [address] }));
    score = { value: Number(s[0]), tier: s[1], success: Number(s[2]), failed: Number(s[3]), disputesAgainst: Number(s[4]), disputesWon: Number(s[5]) };
    report.finish(i, "ok", `${score.value}/1000 (${score.tier})`);
  } catch {
    report.finish(i, "fail", "score read failed");
  }

  i = report.start("Listing streams where this wallet is agent or funder");
  const [agentIds, funderIds] = [await listIds(client, "agentStreams", address), await listIds(client, "funderStreams", address)];
  const allIds = [...new Set([...agentIds, ...funderIds])].sort((a, b) => b - a).slice(0, 12);
  report.finish(i, allIds.length ? "ok" : "warn", `${agentIds.length} as agent, ${funderIds.length} as funder`);

  i = report.start("Reading stream state from PulseStreamV2 storage (getStream)");
  const modeCfg = new Map<number, [number, number]>();
  const streams: StreamFacts[] = [];
  for (const id of allIds) {
    const raw = await retry(() => client.readContract({ address: STREAM, abi: ABI, functionName: "getStream", args: [BigInt(id)] }));
    const s = normalizeStream(raw);
    if (!s) continue;
    const mode = Number(s.mode);
    if (!modeCfg.has(mode)) {
      try {
        const cfg = await retry(() => client.readContract({ address: STREAM, abi: ABI, functionName: "getModeConfig", args: [mode] }));
        modeCfg.set(mode, [Number(cfg[0]), Number(cfg[1])]);
      } catch { modeCfg.set(mode, DEFAULT_MODES[mode] ?? [1800, 1800]); }
    }
    const [interval, grace] = modeCfg.get(mode) ?? [1800, 1800];
    const start = Number(s.startTime);
    const duration = Number(s.durationSecs);
    const status = Number(s.status);
    const last = Number(s.lastHeartbeat);
    const paused = Number(s.pausedDuration);
    const elapsed = start > 0 ? Math.max(0, Math.min(duration, nowSec - start - paused)) : 0;
    streams.push({
      id, asAgent: s.agent.toLowerCase() === address.toLowerCase(), asFunder: s.funder.toLowerCase() === address.toLowerCase(),
      funder: s.funder, agent: s.agent, status, mode, total: s.totalAmount, earned: s.earnedAmount,
      durationSecs: duration, startTime: start, lastHeartbeat: last, pausedDuration: paused, elapsed,
      ended: status === 1 && duration > 0 && elapsed >= duration,
      interval, grace, sinceHeartbeat: last > 0 ? Math.max(0, nowSec - last) : 0,
      timedOut: status === 1 && last > 0 && nowSec > last + interval + grace,
      heartbeats: null, heartbeatsPartial: false,
    });
    await sleep(120);
  }
  report.finish(i, "ok", `${streams.length} stream${streams.length === 1 ? "" : "s"} read`);

  i = report.start("Counting HeartbeatSent event logs for running streams");
  let counted = 0;
  try {
    for (const s of streams.filter(x => x.status === 1 || x.status === 2).slice(0, 3)) {
      const r = await countHeartbeats(client, s.id, s.startTime, headBlock, nowSec);
      s.heartbeats = r.count;
      s.heartbeatsPartial = r.partial;
      counted++;
    }
    report.finish(i, "ok", counted ? `checked ${counted} running stream${counted === 1 ? "" : "s"}` : "no running streams to check");
  } catch {
    report.finish(i, "warn", "RPC rate-limited the log query; heartbeat counts unavailable");
  }

  i = report.start("Reading pending payout balance and gas balance");
  let pending = 0n;
  let gasBalance: bigint | null = null;
  try { pending = await retry(() => client.readContract({ address: STREAM, abi: ABI, functionName: "pendingPayouts", args: [address] })); } catch { /* shown as 0 */ }
  try { gasBalance = await retry(() => client.getBalance({ address })); } catch { /* unknown */ }
  report.finish(i, "ok", `pending ${(Number(pending) / 1e6).toFixed(2)} USDC`);

  return { address, nowSec, headBlock, registered: profiles.length > 0, profiles, score, pending, gasBalance, streams, streamsScanned: allIds.length };
}
