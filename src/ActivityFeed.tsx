import { useState, useCallback, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import { usePublicClient, useWatchContractEvent, useReadContract } from "wagmi";
import { Activity, Zap, CheckCircle, AlertTriangle } from "lucide-react";
import {
  STREAM_ADDR, TASK_ADDR, STREAM_EVENTS_ABI, TASK_EVENTS_ABI,
  loadCachedEvents, saveCachedEvents, mergeEvents, runFeedScan, shortAddr,
} from "./feedScan";

const ARC_MAINNET_ID = 5042;

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
  // Hydrate from localStorage on mount so events survive page refresh
  const [events, setEvents]         = useState<FeedEvent[]>(() => loadCachedEvents());
  const [scanDone, setScanDone]     = useState(false);
  // Stable base timestamp for seed events — initialised once, never mutated.
  const [baseTs]                    = useState(() => 1_000_000_000_000); // fixed epoch, not Date.now()
  const fetchedRef                  = useRef(false);
  const client                      = usePublicClient({ chainId: ARC_MAINNET_ID });

  // On-chain fallback: read nextStreamId to seed synthetic events when logs are empty
  const { data: nextStreamIdRaw } = useReadContract({
    address: STREAM_ADDR, abi: NEXT_STREAM_ABI,
    functionName: "nextStreamId", chainId: ARC_MAINNET_ID,
    query: { retry: 3, staleTime: 30_000 },
  });

  // Stable push: deduplicates by id, caps at 200, newest first, persists to localStorage
  const push = useCallback((ev: FeedEvent) => {
    setEvents(prev => {
      if (prev.some(e => e.id === ev.id)) return prev;
      const next = mergeEvents([ev], prev);
      saveCachedEvents(next);
      return next;
    });
    onEvent?.(ev);
  }, [onEvent]);

  useImperativeHandle(ref, () => ({ push }), [push]);

  // ── Historical fetch ──────────────────────────────────────────────────────
  // 1) Replay cached events to the parent (chart) immediately so a refresh never
  //    shows an empty chart.  2) Scan RPC logs from the deployment block (only the
  //    blocks after the saved cursor), merge, and replay to the chart as well.
  useEffect(() => {
    if (fetchedRef.current || !client) return;
    fetchedRef.current = true;

    void (async () => {
      loadCachedEvents().forEach(ev => onEvent?.(ev));
      try {
        const scanned = await runFeedScan(client);
        if (scanned.length > 0) {
          setEvents(prev => mergeEvents(scanned, prev));
          scanned.forEach(ev => onEvent?.(ev));
        }
      } catch { /* RPC unavailable: cached events stay visible */ }
      setScanDone(true);
    })();
  }, [client, onEvent]);

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

  useWatchContractEvent({
    address: STREAM_ADDR, abi: STREAM_EVENTS_ABI,
    eventName: "StreamActivated", chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        push({
          id: `sa-${log.transactionHash}-${log.logIndex}`,
          kind: "task", positive: true,
          label: `Stream #${log.args.streamId?.toString() ?? "?"} Activated`,
          detail: "Agent accepted stream", ts: Date.now(),
          blockNumber: log.blockNumber ?? undefined,
        });
      });
    },
  });

  useWatchContractEvent({
    address: STREAM_ADDR, abi: STREAM_EVENTS_ABI,
    eventName: "StreamProposed", chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { streamId, agent } = log.args;
        push({
          id: `sp-${log.transactionHash}-${log.logIndex}`,
          kind: "task", positive: true,
          label: `Stream #${streamId?.toString() ?? "?"} Proposed`,
          detail: agent ? `Agent ${shortAddr(agent)}` : "New stream", ts: Date.now(),
          blockNumber: log.blockNumber ?? undefined,
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
