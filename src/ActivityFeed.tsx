import { useState, useCallback, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import { decodeEventLog } from "viem";
import { usePublicClient, useWatchContractEvent, useReadContract } from "wagmi";
import { Activity, Zap, CheckCircle, AlertTriangle } from "lucide-react";
import contractsJson from "./contracts.json";

const ARC_MAINNET_ID  = 5042;
const DEPLOY_BLOCK    = 28710405n;
const RECENT_BLOCKS   = 10_000n;  // only scan last ~10k blocks on mount (fast)
const CHUNK           = 1000n;    // smaller chunks for reliability
const STREAM_ADDR     = contractsJson.contracts.PulseStreamV2.address as `0x${string}`;
const TASK_ADDR       = contractsJson.contracts.PulseTaskV2.address   as `0x${string}`;
const STREAM_COUNT_ADDR = contractsJson.contracts.PulseStreamV2.address as `0x${string}`;

// ── ABIs ─────────────────────────────────────────────────────────────────────

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
  {
    name: "StreamActivated", type: "event",
    inputs: [
      { name: "streamId",  type: "uint256", indexed: true  },
      { name: "startTime", type: "uint256", indexed: false },
    ],
  },
] as const;

const NEXT_STREAM_ABI = [
  { name: "nextStreamId", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

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

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

function KindIcon({ kind, positive }: { kind: FeedEvent["kind"]; positive: boolean }) {
  const col = positive ? "#22c55e" : "#ef4444";
  if (kind === "heartbeat") return <Zap          size={13} style={{ color: col }} />;
  if (kind === "task")      return <Activity      size={13} style={{ color: "#0ea5e9" }} />;
  if (kind === "completed") return <CheckCircle   size={13} style={{ color: col }} />;
  return                           <AlertTriangle size={13} style={{ color: col }} />;
}

interface Props {
  onEvent?: (ev: FeedEvent) => void;
}

export interface ActivityFeedHandle {
  push: (ev: FeedEvent) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ActivityFeed = forwardRef<ActivityFeedHandle, Props>(function ActivityFeed({ onEvent }, ref) {
  const [events, setEvents]         = useState<FeedEvent[]>([]);
  const [scanDone, setScanDone]     = useState(false);
  // Stable base timestamp for seed events — initialised once, never mutated.
  const [baseTs]                    = useState(() => 1_000_000_000_000); // fixed epoch, not Date.now()
  const fetchedRef                  = useRef(false);
  const client                      = usePublicClient({ chainId: ARC_MAINNET_ID });

  // On-chain fallback: read nextStreamId to seed synthetic events when logs are empty
  const { data: nextStreamIdRaw } = useReadContract({
    address: STREAM_COUNT_ADDR, abi: NEXT_STREAM_ABI,
    functionName: "nextStreamId", chainId: ARC_MAINNET_ID,
    query: { retry: 3, staleTime: 30_000 },
  });

  // Stable push: deduplicates by id, caps at 200, newest first
  const push = useCallback((ev: FeedEvent) => {
    setEvents(prev => {
      if (prev.some(e => e.id === ev.id)) return prev;
      return [ev, ...prev].slice(0, 200);
    });
    onEvent?.(ev);
  }, [onEvent]);

  useImperativeHandle(ref, () => ({ push }), [push]);

  // ── Historical fetch: recent blocks only, 2s hard timeout ─────────────────
  useEffect(() => {
    if (fetchedRef.current || !client) return;
    fetchedRef.current = true;

    // Hard 2-second abort — if RPC is slow, skip and use fallback immediately
    const abortTimer = setTimeout(() => setScanDone(true), 2000);

    void (async () => {
      try {
        const latest = await Promise.race([
          client.getBlockNumber(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("rpc-timeout")), 1500)),
        ]);

        // Only scan last RECENT_BLOCKS — fast, avoids 256k-block timeout
        const fromBlock = latest > DEPLOY_BLOCK + RECENT_BLOCKS
          ? latest - RECENT_BLOCKS
          : DEPLOY_BLOCK;

        const collected: FeedEvent[] = [];

        async function scanAddress(address: `0x${string}`, isStream: boolean) {
          let from = fromBlock;
          while (from <= latest) {
            const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
            try {
              const logs = await client!.getLogs({ address, fromBlock: from, toBlock: to });
              for (const log of logs) {
                try {
                  const decoded = decodeEventLog({
                    abi:    isStream ? STREAM_EVENTS_ABI : TASK_EVENTS_ABI,
                    data:   log.data,
                    topics: log.topics,
                  });
                  const txId = log.transactionHash ?? "x";
                  const bn   = log.blockNumber ?? undefined;
                  const args = decoded.args as Record<string, unknown>;

                  if (decoded.eventName === "HeartbeatSent") {
                    collected.push({
                      id: `hb-${txId}-${log.logIndex}`, kind: "heartbeat", positive: true,
                      label:  `Heartbeat OK — Stream #${(args.streamId as bigint | undefined)?.toString() ?? "?"}`,
                      detail: `Missed: ${(args.missedHeartbeats as bigint | undefined)?.toString() ?? "0"}`,
                      ts:     Number((args.timestamp as bigint | undefined) ?? 0n) * 1000 || Date.now(),
                      blockNumber: bn,
                    });
                  } else if (decoded.eventName === "StreamCompleted") {
                    collected.push({
                      id: `sc-${txId}-${log.logIndex}`, kind: "completed", positive: true,
                      label:  `Stream #${(args.streamId as bigint | undefined)?.toString() ?? "?"} Completed`,
                      detail: "All funds settled", ts: Date.now(), blockNumber: bn,
                    });
                  } else if (decoded.eventName === "StreamReclaimed") {
                    collected.push({
                      id: `sr-${txId}-${log.logIndex}`, kind: "reclaimed", positive: false,
                      label:  `Stream #${(args.streamId as bigint | undefined)?.toString() ?? "?"} Reclaimed`,
                      detail: `Keeper: ${args.keeper ? shortAddr(args.keeper as string) : "?"}`,
                      ts: Date.now(), blockNumber: bn,
                    });
                  } else if (decoded.eventName === "TaskCreated") {
                    collected.push({
                      id: `tc-${txId}-${log.logIndex}`, kind: "task", positive: true,
                      label:  `Task #${(args.taskId as bigint | undefined)?.toString() ?? "?"} Created`,
                      detail: `Agent ${args.agent ? shortAddr(args.agent as string) : "?"}`,
                      ts: Date.now(), blockNumber: bn,
                    });
                  } else if (decoded.eventName === "StreamActivated") {
                    collected.push({
                      id: `sa-${txId}-${log.logIndex}`, kind: "task", positive: true,
                      label:  `Stream #${(args.streamId as bigint | undefined)?.toString() ?? "?"} Activated`,
                      detail: "Agent accepted stream", ts: Date.now(), blockNumber: bn,
                    });
                  }
                } catch { /* unknown topic — skip */ }
              }
            } catch { /* chunk failed — skip and continue */ }
            from = to + 1n;
          }
        }

        await scanAddress(STREAM_ADDR, true);
        await scanAddress(TASK_ADDR,   false);

        if (collected.length > 0) {
          collected.sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)));
          setEvents(prev => {
            const merged = [...collected, ...prev];
            const seen = new Set<string>();
            return merged.filter(e => seen.has(e.id) ? false : (seen.add(e.id), true)).slice(0, 200);
          });
        }
      } catch { /* silently fall through to on-chain fallback */ }

      clearTimeout(abortTimer);
      setScanDone(true);
    })();

    return () => clearTimeout(abortTimer);
  }, [client, push]);

  // ── On-chain fallback: derive seed events from nextStreamId during render ───
  // This is intentionally a derived value (not an effect) so it never triggers
  // cascading renders. Seeds are only visible when logs and live watchers found nothing.
  const streamCount = nextStreamIdRaw !== undefined ? Math.max(0, Number(nextStreamIdRaw) - 1) : 0;
  const seedEvents = useMemo<FeedEvent[]>(() => {
    if (!scanDone || streamCount === 0 || events.length > 0) return [];
    return Array.from({ length: Math.min(streamCount, 5) }, (_, i) => ({
      id:       `seed-stream-${i + 1}`,
      kind:     "task" as const,
      positive: true,
      label:    `Stream #${i + 1} detected on-chain`,
      detail:   "Synthesised from contract state",
      ts:       baseTs - (i + 1) * 60_000,
    }));
  }, [scanDone, streamCount, events.length, baseTs]);

  // ── Live watchers ─────────────────────────────────────────────────────────────

  useWatchContractEvent({
    address: STREAM_ADDR, abi: STREAM_EVENTS_ABI,
    eventName: "HeartbeatSent", chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { streamId, missedHeartbeats, timestamp } = log.args;
        push({
          id:       `hb-${log.transactionHash}-${log.logIndex}`,
          kind:     "heartbeat", positive: true,
          label:    `Heartbeat OK — Stream #${streamId?.toString() ?? "?"}`,
          detail:   `Missed: ${missedHeartbeats?.toString() ?? "0"}`,
          ts:       Number(timestamp ?? 0n) * 1000 || Date.now(),
          blockNumber: log.blockNumber ?? undefined,
        });
      });
    },
  });

  useWatchContractEvent({
    address: STREAM_ADDR, abi: STREAM_EVENTS_ABI,
    eventName: "StreamCompleted", chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { streamId } = log.args;
        push({
          id: `sc-${log.transactionHash}-${log.logIndex}`,
          kind: "completed", positive: true,
          label: `Stream #${streamId?.toString() ?? "?"} Completed`,
          detail: "All funds settled", ts: Date.now(),
          blockNumber: log.blockNumber ?? undefined,
        });
      });
    },
  });

  useWatchContractEvent({
    address: STREAM_ADDR, abi: STREAM_EVENTS_ABI,
    eventName: "StreamReclaimed", chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { streamId, keeper } = log.args;
        push({
          id: `sr-${log.transactionHash}-${log.logIndex}`,
          kind: "reclaimed", positive: false,
          label: `Stream #${streamId?.toString() ?? "?"} Reclaimed`,
          detail: `Keeper: ${keeper ? shortAddr(keeper) : "?"}`,
          ts: Date.now(), blockNumber: log.blockNumber ?? undefined,
        });
      });
    },
  });

  useWatchContractEvent({
    address: TASK_ADDR, abi: TASK_EVENTS_ABI,
    eventName: "TaskCreated", chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { taskId, agent } = log.args;
        push({
          id: `tc-${log.transactionHash}-${log.logIndex}`,
          kind: "task", positive: true,
          label: `Task #${taskId?.toString() ?? "?"} Created`,
          detail: `Agent ${agent ? shortAddr(agent) : "?"}`,
          ts: Date.now(), blockNumber: log.blockNumber ?? undefined,
        });
      });
    },
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  const displayEvents = events.length > 0 ? events : seedEvents;

  if (displayEvents.length === 0) {
    return (
      <div className="text-sm text-center py-6" style={{ color: T.subtle }}>
        <Activity size={18} className="mx-auto mb-2 opacity-40" style={{ color: T.accent }} />
        <p className="font-medium" style={{ color: T.muted }}>
          {!scanDone ? "Scanning recent blocks…" : "Watching for live on-chain events…"}
        </p>
        <p className="text-xs mt-0.5">
          {!scanDone
            ? "Reading Arc Mainnet logs — ready in seconds"
            : "Events appear here as they are confirmed on Arc Mainnet"}
        </p>
      </div>
    );
  }

  return (
    <div>
      {!scanDone && (
        <p className="text-xs text-center mb-2 pb-2 border-b" style={{ color: T.subtle, borderColor: T.border }}>
          Scanning recent blocks…
        </p>
      )}
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {displayEvents.map(ev => (
          <div key={ev.id}
               className="flex items-start gap-2.5 px-3 py-2 rounded-xl transition-colors"
               style={{ background: "rgba(186,230,253,0.15)", border: `1px solid ${T.border}` }}>
            <div className="mt-0.5 shrink-0">
              <KindIcon kind={ev.kind} positive={ev.positive} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate" style={{ color: T.ink }}>{ev.label}</div>
              <div className="text-xs truncate"               style={{ color: T.subtle }}>{ev.detail}</div>
            </div>
            <div className="text-xs shrink-0 tabular-nums" style={{ color: T.subtle }}>
              {new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
