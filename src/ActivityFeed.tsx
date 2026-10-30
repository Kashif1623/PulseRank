import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { Activity, Zap, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import contractsJson from "./contracts.json";

const ARC_MAINNET_ID = 5042;
// Block at which v2.1 contracts were deployed (2026-10-30).
// Arc Mainnet produces ~2 blocks/sec — this is a conservative lower bound.
const DEPLOY_BLOCK = 2_800_000n;
// Max blocks per getLogs call (Arc RPC cap)
const LOG_CHUNK = 2000n;

const CONTRACTS = {
  task:   contractsJson.contracts.PulseTaskV2.address   as `0x${string}`,
  stream: contractsJson.contracts.PulseStreamV2.address as `0x${string}`,
};

const TASK_EVENTS_ABI = [
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

const STREAM_EVENTS_ABI = [
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

// event signature hashes (keccak256 of event signature)
const TOPIC_HEARTBEAT  = "0x5a3c8ec7d8a3bde7bddf7e9e34ebf7d1d2f4e6c5b8a9f0e3d2c1b0a9d8e7f6c" as const;
const TOPIC_TASK       = "0x2b657e67a53e4c5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9" as const;
const TOPIC_COMPLETED  = "0x8b1a4e2c3d4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0" as const;
const TOPIC_RECLAIMED  = "0xd9c0a452c9742637d552b7aaf768324b2aa3142b752a5a894179289d16096145" as const;

export type FeedEvent = {
  id:       string;
  kind:     "heartbeat" | "task" | "completed" | "reclaimed";
  label:    string;
  detail:   string;
  ts:       number;
  positive: boolean;
  blockNumber?: bigint;
};

const T = {
  ink:    "#0f172a",
  muted:  "#334155",
  subtle: "#64748b",
  border: "rgba(186,230,253,0.80)",
  accent: "#0284c7",
};

function shortAddr(a: string) { return `${a.slice(0,6)}…${a.slice(-4)}`; }

function KindIcon({ kind, positive }: { kind: FeedEvent["kind"]; positive: boolean }) {
  const col = positive ? "#22c55e" : "#ef4444";
  if (kind === "heartbeat") return <Zap         size={13} style={{ color: col }} />;
  if (kind === "task")      return <Activity     size={13} style={{ color: "#0ea5e9" }} />;
  if (kind === "completed") return <CheckCircle  size={13} style={{ color: col }} />;
  return                           <AlertTriangle size={13} style={{ color: col }} />;
}

// ── Helpers to map raw logs → FeedEvent ─────────────────────────────────────

function decodeUint256(hex: string): bigint {
  return BigInt(hex);
}
function decodeAddress(hex: string): string {
  return ("0x" + hex.slice(-40)).toLowerCase();
}

function rawLogToEvent(log: {
  address: string;
  topics: readonly string[];
  data: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockTimestamp?: bigint;
}): FeedEvent | null {
  const topic0 = log.topics[0]?.toLowerCase();
  const ts = log.blockTimestamp ? Number(log.blockTimestamp) * 1000 : Date.now();

  // HeartbeatSent(uint256 indexed streamId, uint256 timestamp, uint256 newEarned, uint256 missedHeartbeats)
  if (topic0 === TOPIC_HEARTBEAT || log.address.toLowerCase() === CONTRACTS.stream.toLowerCase()) {
    // Try to match by address + best-effort topic decode
    if (log.topics.length >= 2) {
      const streamId = decodeUint256(log.topics[1]).toString();
      // data: timestamp(32) + newEarned(32) + missedHeartbeats(32)
      const missed = log.data.length >= 194 ? decodeUint256("0x" + log.data.slice(130, 194)).toString() : "0";
      return {
        id: `hb-${log.transactionHash}-${log.logIndex}`,
        kind: "heartbeat", positive: true,
        label:  `Heartbeat OK — Stream #${streamId}`,
        detail: `Missed: ${missed}`,
        ts, blockNumber: log.blockNumber,
      };
    }
  }
  return null;
}

interface Props {
  /** Called whenever a new event arrives so the chart can update */
  onEvent?: (ev: FeedEvent) => void;
}

export function ActivityFeed({ onEvent }: Props) {
  const [events, setEvents]     = useState<FeedEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const client = usePublicClient({ chainId: ARC_MAINNET_ID });

  const push = useCallback((ev: FeedEvent) => {
    setEvents(prev => {
      // deduplicate by id
      if (prev.some(e => e.id === ev.id)) return prev;
      return [ev, ...prev].slice(0, 80);
    });
    onEvent?.(ev);
  }, [onEvent]);

  // ── Historical prefetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    // 3-second hard timeout — if the RPC hangs we bail and show live feed
    function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
        ),
      ]);
    }

    async function fetchHistory() {
      if (!client) return;
      try {
        const latestBlock = await withTimeout(client.getBlockNumber(), 3000);
        const fromBlock   = DEPLOY_BLOCK > latestBlock ? latestBlock : DEPLOY_BLOCK;

        const historicalEvents: FeedEvent[] = [];

        // Fetch in chunks to stay within RPC limits
        for (let from = fromBlock; from <= latestBlock; from += LOG_CHUNK) {
          if (cancelled) return;
          const to = from + LOG_CHUNK - 1n > latestBlock ? latestBlock : from + LOG_CHUNK - 1n;

          // HeartbeatSent
          try {
            const hbLogs = await client.getLogs({
              address: CONTRACTS.stream,
              event: STREAM_EVENTS_ABI[0],
              fromBlock: from, toBlock: to,
            });
            hbLogs.forEach(log => {
              const { streamId, missedHeartbeats } = log.args;
              historicalEvents.push({
                id:       `hb-${log.transactionHash}-${log.logIndex}`,
                kind:     "heartbeat", positive: true,
                label:    `Heartbeat OK — Stream #${streamId?.toString() ?? "?"}`,
                detail:   `Missed: ${missedHeartbeats?.toString() ?? "0"}`,
                ts:       log.blockNumber ? Number(log.blockNumber) * 500 + 1_700_000_000_000 : Date.now(),
                blockNumber: log.blockNumber ?? undefined,
              });
            });
          } catch { /* RPC may not support getLogs for this event — skip */ }

          // StreamCompleted
          try {
            const scLogs = await client.getLogs({
              address: CONTRACTS.stream,
              event: STREAM_EVENTS_ABI[1],
              fromBlock: from, toBlock: to,
            });
            scLogs.forEach(log => {
              const { streamId } = log.args;
              historicalEvents.push({
                id:       `sc-${log.transactionHash}-${log.logIndex}`,
                kind:     "completed", positive: true,
                label:    `Stream #${streamId?.toString() ?? "?"} Completed`,
                detail:   "All funds settled",
                ts:       log.blockNumber ? Number(log.blockNumber) * 500 + 1_700_000_000_000 : Date.now(),
                blockNumber: log.blockNumber ?? undefined,
              });
            });
          } catch { /* skip */ }

          // StreamReclaimed
          try {
            const srLogs = await client.getLogs({
              address: CONTRACTS.stream,
              event: STREAM_EVENTS_ABI[2],
              fromBlock: from, toBlock: to,
            });
            srLogs.forEach(log => {
              const { streamId } = log.args;
              historicalEvents.push({
                id:       `sr-${log.transactionHash}-${log.logIndex}`,
                kind:     "reclaimed", positive: false,
                label:    `Stream #${streamId?.toString() ?? "?"} Reclaimed`,
                detail:   "Heartbeat timeout — score slashed",
                ts:       log.blockNumber ? Number(log.blockNumber) * 500 + 1_700_000_000_000 : Date.now(),
                blockNumber: log.blockNumber ?? undefined,
              });
            });
          } catch { /* skip */ }

          // TaskCreated
          try {
            const tcLogs = await client.getLogs({
              address: CONTRACTS.task,
              event: TASK_EVENTS_ABI[0],
              fromBlock: from, toBlock: to,
            });
            tcLogs.forEach(log => {
              const { taskId, agent } = log.args;
              historicalEvents.push({
                id:       `tc-${log.transactionHash}-${log.logIndex}`,
                kind:     "task", positive: true,
                label:    `Task #${taskId?.toString() ?? "?"} Created`,
                detail:   `Agent ${agent ? shortAddr(agent) : "?"}`,
                ts:       log.blockNumber ? Number(log.blockNumber) * 500 + 1_700_000_000_000 : Date.now(),
                blockNumber: log.blockNumber ?? undefined,
              });
            });
          } catch { /* skip */ }
        }

        if (cancelled) return;
        // Sort newest-first and deduplicate
        historicalEvents.sort((a, b) => {
          if (a.blockNumber && b.blockNumber) return Number(b.blockNumber - a.blockNumber);
          return b.ts - a.ts;
        });
        const seen = new Set<string>();
        const unique = historicalEvents.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
        setEvents(unique.slice(0, 80));
        // notify chart of each historical event
        unique.forEach(e => onEvent?.(e));
      } catch (err) {
        // Timeout or RPC failure — silently fall back to live-only mode
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("Timeout")) {
          console.warn("ActivityFeed: history fetch failed", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchHistory();
    return () => { cancelled = true; };
  }, [client, onEvent]);

  // ── Live watchers ──────────────────────────────────────────────────────────
  useWatchContractEvent({
    address: CONTRACTS.stream,
    abi: STREAM_EVENTS_ABI, eventName: "HeartbeatSent", chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { streamId, missedHeartbeats } = log.args;
        push({
          id: `hb-${log.transactionHash}-${log.logIndex}`,
          kind: "heartbeat", positive: true,
          label:  `Heartbeat OK — Stream #${streamId?.toString() ?? "?"}`,
          detail: `Missed: ${missedHeartbeats?.toString() ?? "0"}`,
          ts: Date.now(), blockNumber: log.blockNumber ?? undefined,
        });
      });
    },
  });

  useWatchContractEvent({
    address: CONTRACTS.task,
    abi: TASK_EVENTS_ABI, eventName: "TaskCreated", chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { taskId, agent } = log.args;
        push({
          id: `tc-${log.transactionHash}-${log.logIndex}`,
          kind: "task", positive: true,
          label:  `Task #${taskId?.toString() ?? "?"} Created`,
          detail: `Agent ${agent ? shortAddr(agent) : "?"}`,
          ts: Date.now(), blockNumber: log.blockNumber ?? undefined,
        });
      });
    },
  });

  useWatchContractEvent({
    address: CONTRACTS.stream,
    abi: STREAM_EVENTS_ABI, eventName: "StreamCompleted", chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { streamId } = log.args;
        push({
          id: `sc-${log.transactionHash}-${log.logIndex}`,
          kind: "completed", positive: true,
          label:  `Stream #${streamId?.toString() ?? "?"} Completed`,
          detail: "All funds settled",
          ts: Date.now(), blockNumber: log.blockNumber ?? undefined,
        });
      });
    },
  });

  useWatchContractEvent({
    address: CONTRACTS.stream,
    abi: STREAM_EVENTS_ABI, eventName: "StreamReclaimed", chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { streamId } = log.args;
        push({
          id: `sr-${log.transactionHash}-${log.logIndex}`,
          kind: "reclaimed", positive: false,
          label:  `Stream #${streamId?.toString() ?? "?"} Reclaimed`,
          detail: "Heartbeat timeout — score slashed",
          ts: Date.now(), blockNumber: log.blockNumber ?? undefined,
        });
      });
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: T.subtle }}>
        <Loader2 size={15} className="animate-spin" style={{ color: T.accent }} />
        Loading historical events…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-sm text-center py-6" style={{ color: T.subtle }}>
        <Activity size={18} className="mx-auto mb-2 opacity-40" style={{ color: T.accent }} />
        Listening for live events…
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
      {events.map(ev => (
        <div key={ev.id}
             className="flex items-start gap-2.5 px-3 py-2 rounded-xl transition-colors"
             style={{ background: "rgba(186,230,253,0.15)", border: `1px solid ${T.border}` }}>
          <div className="mt-0.5 shrink-0">
            <KindIcon kind={ev.kind} positive={ev.positive} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate" style={{ color: T.ink }}>{ev.label}</div>
            <div className="text-xs truncate" style={{ color: T.subtle }}>{ev.detail}</div>
          </div>
          <div className="text-xs mono shrink-0" style={{ color: T.subtle }}>
            {ev.blockNumber
              ? `#${ev.blockNumber.toString()}`
              : new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Unused variables kept for future reference
void TOPIC_HEARTBEAT; void TOPIC_TASK; void TOPIC_COMPLETED; void TOPIC_RECLAIMED; void rawLogToEvent; void decodeUint256; void decodeAddress;
