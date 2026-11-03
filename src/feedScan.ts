/**
 * Persistent on-chain event scanner for the Activity Feed + Protocol Activity chart.
 *
 * - Scans PulseStreamV2 / PulseTaskV2 logs from each contract's deployment block
 *   (never block 0), using adaptive range sizes.
 * - Persists a scan cursor so later page loads only fetch the new blocks.
 * - Resolves real block timestamps so candles land in the correct time bucket.
 * - Caches events in localStorage ('pulserank_feed_events_v1') as an instant fallback.
 */

import type { usePublicClient } from "wagmi";
import contractsJson from "./contracts.json";
import type { FeedEvent } from "./ActivityFeed";

export const STREAM_ADDR = contractsJson.contracts.PulseStreamV2.address as `0x${string}`;
export const TASK_ADDR   = contractsJson.contracts.PulseTaskV2.address   as `0x${string}`;

// Deployment blocks of the current (v2.2) contracts, read from their deploy receipts.
export const STREAM_DEPLOY_BLOCK = 29_210_038n;
export const TASK_DEPLOY_BLOCK   = 29_209_925n;

export const STREAM_EVENTS_ABI = [
  {
    name: "StreamProposed", type: "event",
    inputs: [
      { name: "streamId",     type: "uint256", indexed: true  },
      { name: "funder",       type: "address", indexed: true  },
      { name: "agent",        type: "address", indexed: true  },
      { name: "totalAmount",  type: "uint256", indexed: false },
      { name: "durationSecs", type: "uint256", indexed: false },
      { name: "mode",         type: "uint8",   indexed: false },
      { name: "taskId",       type: "uint256", indexed: false },
    ],
  },
  {
    name: "StreamActivated", type: "event",
    inputs: [
      { name: "streamId",  type: "uint256", indexed: true  },
      { name: "startTime", type: "uint256", indexed: false },
    ],
  },
  {
    name: "HeartbeatSent", type: "event",
    inputs: [
      { name: "streamId",         type: "uint256", indexed: true  },
      { name: "timestamp",        type: "uint256", indexed: false },
      { name: "newEarned",        type: "uint256", indexed: false },
      { name: "missedHeartbeats", type: "uint256", indexed: false },
    ],
  },
  {
    name: "StreamCompleted", type: "event",
    inputs: [
      { name: "streamId", type: "uint256", indexed: true  },
      { name: "earned",   type: "uint256", indexed: false },
      { name: "refund",   type: "uint256", indexed: false },
    ],
  },
  {
    name: "StreamReclaimed", type: "event",
    inputs: [
      { name: "streamId", type: "uint256", indexed: true  },
      { name: "keeper",   type: "address", indexed: true  },
      { name: "earned",   type: "uint256", indexed: false },
      { name: "bounty",   type: "uint256", indexed: false },
      { name: "refund",   type: "uint256", indexed: false },
    ],
  },
] as const;

export const TASK_EVENTS_ABI = [
  {
    name: "TaskCreated", type: "event",
    inputs: [
      { name: "taskId",   type: "uint256", indexed: true  },
      { name: "funder",   type: "address", indexed: true  },
      { name: "agent",    type: "address", indexed: true  },
      { name: "streamId", type: "uint256", indexed: false },
    ],
  },
] as const;

// ── Cache ────────────────────────────────────────────────────────────────────

export const LS_EVENTS_KEY = "pulserank_feed_events_v1";
const LS_CURSOR_KEY = "pulserank_feed_scan_v2";
const MAX_EVENTS = 200;

export function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

/** Only events backed by a tx hash are persisted; optimistic UI events are not. */
function isChainEvent(e: FeedEvent) { return e.id.includes("-0x"); }

/** `a` wins on duplicate ids. Newest first, capped. */
export function mergeEvents(a: FeedEvent[], b: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>();
  const out: FeedEvent[] = [];
  for (const e of [...a, ...b]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  out.sort((x, y) => y.ts - x.ts);
  return out.slice(0, MAX_EVENTS);
}

export function loadCachedEvents(): FeedEvent[] {
  try {
    const raw = localStorage.getItem(LS_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as (Omit<FeedEvent, "blockNumber"> & { blockNumber?: string })[];
    return parsed
      .map(e => ({ ...e, blockNumber: e.blockNumber !== undefined ? BigInt(e.blockNumber) : undefined }))
      .filter(isChainEvent);
  } catch { return []; }
}

/** Always unions with what is already stored, so a save can never drop scanned events. */
export function saveCachedEvents(evs: FeedEvent[]) {
  try {
    const merged = mergeEvents(evs.filter(isChainEvent), loadCachedEvents());
    const plain = merged.map(e => ({ ...e, blockNumber: e.blockNumber?.toString() }));
    localStorage.setItem(LS_EVENTS_KEY, JSON.stringify(plain));
  } catch { /* quota / private mode */ }
}

type Cursor = { stream: string; task: string };
function loadCursor(): Cursor | null {
  try {
    const raw = localStorage.getItem(LS_CURSOR_KEY);
    return raw ? (JSON.parse(raw) as Cursor) : null;
  } catch { return null; }
}
function saveCursor(c: Cursor) {
  try { localStorage.setItem(LS_CURSOR_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

// ── Scanning ─────────────────────────────────────────────────────────────────

const START_SPAN = 20_000n;
const MIN_SPAN   = 500n;

/**
 * Walks [start, latest] in ranges. If the RPC rejects a range, the range is halved.
 * Stops (without skipping) when even the minimum range fails, so the cursor never
 * jumps past blocks that were not actually read.
 */
async function scanRange<L>(
  fetchRange: (from: bigint, to: bigint) => Promise<L[]>,
  start: bigint,
  latest: bigint,
): Promise<{ logs: L[]; scannedTo: bigint }> {
  const logs: L[] = [];
  let from = start;
  let span = START_SPAN;
  let scannedTo = start - 1n;
  let attempts = 0;
  while (from <= latest) {
    const to = from + span - 1n < latest ? from + span - 1n : latest;
    try {
      logs.push(...(await fetchRange(from, to)));
      scannedTo = to;
      from = to + 1n;
      attempts = 0;
    } catch {
      // Back off first (the RPC may be throttling), then shrink the range.
      attempts += 1;
      if (attempts >= 4 && span <= MIN_SPAN) break;
      await new Promise(r => setTimeout(r, 600 * attempts));
      if (attempts % 2 === 0 && span > MIN_SPAN) span = span / 2n;
    }
  }
  return { logs, scannedTo };
}

type ScanClient = NonNullable<ReturnType<typeof usePublicClient>>;

const blockTimeCache = new Map<bigint, number>();
async function resolveBlockTimes(client: ScanClient, blocks: bigint[]) {
  const need = [...new Set(blocks)].filter(b => !blockTimeCache.has(b));
  for (let i = 0; i < need.length; i += 8) {
    await Promise.all(need.slice(i, i + 8).map(async b => {
      try {
        const blk = await client.getBlock({ blockNumber: b });
        blockTimeCache.set(b, Number(blk.timestamp) * 1000);
      } catch { /* leave unresolved */ }
    }));
  }
}

type Raw = {
  name:  string;
  args:  Record<string, unknown>;
  tx:    string;
  idx:   number;
  block: bigint;
};

function big(v: unknown): string { return typeof v === "bigint" ? v.toString() : "?"; }

function toFeedEvent(r: Raw): FeedEvent | null {
  const ts = blockTimeCache.get(r.block) ?? Date.now();
  const base = { blockNumber: r.block, ts };
  const sid = big(r.args.streamId);
  switch (r.name) {
    case "HeartbeatSent":
      return {
        ...base, id: `hb-${r.tx}-${r.idx}`, kind: "heartbeat", positive: true,
        label: `Heartbeat OK — Stream #${sid}`,
        detail: `Missed: ${big(r.args.missedHeartbeats)}`,
        ts: typeof r.args.timestamp === "bigint" ? Number(r.args.timestamp) * 1000 : ts,
      };
    case "StreamActivated":
      return { ...base, id: `sa-${r.tx}-${r.idx}`, kind: "task", positive: true,
        label: `Stream #${sid} Activated`, detail: "Agent accepted stream" };
    case "StreamProposed":
      return { ...base, id: `sp-${r.tx}-${r.idx}`, kind: "task", positive: true,
        label: `Stream #${sid} Proposed`,
        detail: typeof r.args.agent === "string" ? `Agent ${shortAddr(r.args.agent)}` : "New stream" };
    case "StreamCompleted":
      return { ...base, id: `sc-${r.tx}-${r.idx}`, kind: "completed", positive: true,
        label: `Stream #${sid} Completed`, detail: "All funds settled" };
    case "StreamReclaimed":
      return { ...base, id: `sr-${r.tx}-${r.idx}`, kind: "reclaimed", positive: false,
        label: `Stream #${sid} Reclaimed`,
        detail: typeof r.args.keeper === "string" ? `Keeper: ${shortAddr(r.args.keeper)}` : "Reclaimed" };
    case "TaskCreated":
      return { ...base, id: `tc-${r.tx}-${r.idx}`, kind: "task", positive: true,
        label: `Task #${big(r.args.taskId)} Created`,
        detail: typeof r.args.agent === "string" ? `Agent ${shortAddr(r.args.agent)}` : "New task" };
    default:
      return null;
  }
}

async function doScan(client: ScanClient): Promise<FeedEvent[]> {
  const latest = await client.getBlockNumber();
  const cursor = loadCursor();
  const next = (saved: string | undefined, floor: bigint) =>
    saved !== undefined && BigInt(saved) + 1n > floor ? BigInt(saved) + 1n : floor;
  const sFrom = next(cursor?.stream, STREAM_DEPLOY_BLOCK);
  const tFrom = next(cursor?.task,   TASK_DEPLOY_BLOCK);

  const [s, t] = await Promise.all([
    scanRange(
      (fromBlock, toBlock) => client.getLogs({ address: STREAM_ADDR, events: STREAM_EVENTS_ABI, fromBlock, toBlock }),
      sFrom, latest),
    scanRange(
      (fromBlock, toBlock) => client.getLogs({ address: TASK_ADDR, events: TASK_EVENTS_ABI, fromBlock, toBlock }),
      tFrom, latest),
  ]);

  const raws: Raw[] = [...s.logs, ...t.logs].flatMap(l =>
    l.blockNumber === null || l.transactionHash === null || l.logIndex === null
      ? []
      : [{
          name:  l.eventName,
          args:  l.args,
          tx:    l.transactionHash,
          idx:   l.logIndex,
          block: l.blockNumber,
        }],
  );

  await resolveBlockTimes(client, raws.map(r => r.block));
  const events = raws.flatMap(r => { const e = toFeedEvent(r); return e ? [e] : []; });

  // Persist events first, then advance the cursor, so a gap can never appear.
  saveCachedEvents(events);
  saveCursor({
    stream: (s.scannedTo >= sFrom ? s.scannedTo : sFrom - 1n).toString(),
    task:   (t.scannedTo >= tFrom ? t.scannedTo : tFrom - 1n).toString(),
  });
  return events;
}

let inflight: Promise<FeedEvent[]> | null = null;
/** Shared across every ActivityFeed instance so tabs never double-scan. */
export function runFeedScan(client: ScanClient): Promise<FeedEvent[]> {
  if (!inflight) {
    inflight = doScan(client).finally(() => { inflight = null; });
  }
  return inflight;
}
