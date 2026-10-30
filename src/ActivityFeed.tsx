import { useState } from "react";
import { useWatchContractEvent } from "wagmi";
import { Activity, Zap, CheckCircle, AlertTriangle } from "lucide-react";
import contractsJson from "./contracts.json";

const ARC_MAINNET_ID = 5042;

const CONTRACTS = {
  task:   contractsJson.contracts.PulseTaskV2.address   as `0x${string}`,
  stream: contractsJson.contracts.PulseStreamV2.address as `0x${string}`,
};

// Minimal event ABIs
const TASK_EVENTS_ABI = [
  {
    name: "TaskCreated",
    type: "event",
    inputs: [
      { name: "taskId",   type: "uint256", indexed: true },
      { name: "funder",   type: "address", indexed: true },
      { name: "agent",    type: "address", indexed: true },
      { name: "streamId", type: "uint256", indexed: false },
    ],
  },
] as const;

const STREAM_EVENTS_ABI = [
  {
    name: "HeartbeatSent",
    type: "event",
    inputs: [
      { name: "streamId",         type: "uint256", indexed: true },
      { name: "timestamp",        type: "uint256", indexed: false },
      { name: "newEarned",        type: "uint256", indexed: false },
      { name: "missedHeartbeats", type: "uint256", indexed: false },
    ],
  },
  {
    name: "StreamCompleted",
    type: "event",
    inputs: [
      { name: "streamId", type: "uint256", indexed: true },
      { name: "earned",   type: "uint256", indexed: false },
      { name: "refund",   type: "uint256", indexed: false },
    ],
  },
  {
    name: "StreamReclaimed",
    type: "event",
    inputs: [
      { name: "streamId", type: "uint256", indexed: true },
      { name: "keeper",   type: "address", indexed: true },
      { name: "earned",   type: "uint256", indexed: false },
      { name: "bounty",   type: "uint256", indexed: false },
      { name: "refund",   type: "uint256", indexed: false },
    ],
  },
] as const;

export type FeedEvent = {
  id:        string;
  kind:      "heartbeat" | "task" | "completed" | "reclaimed";
  label:     string;
  detail:    string;
  ts:        number;
  positive:  boolean;
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
  if (kind === "heartbeat") return <Zap size={13} style={{ color: col }} />;
  if (kind === "task")      return <Activity size={13} style={{ color: "#0ea5e9" }} />;
  if (kind === "completed") return <CheckCircle size={13} style={{ color: col }} />;
  return <AlertTriangle size={13} style={{ color: col }} />;
}

export function ActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);

  function push(ev: FeedEvent) {
    setEvents(prev => [ev, ...prev].slice(0, 50));
  }

  useWatchContractEvent({
    address: CONTRACTS.stream,
    abi: STREAM_EVENTS_ABI,
    eventName: "HeartbeatSent",
    chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { streamId, missedHeartbeats } = log.args;
        push({
          id:       `hb-${log.transactionHash}-${log.logIndex}`,
          kind:     "heartbeat",
          label:    `Heartbeat OK — Stream #${streamId?.toString() ?? "?"}`,
          detail:   `Missed: ${missedHeartbeats?.toString() ?? "0"}`,
          ts:       Date.now(),
          positive: true,
        });
      });
    },
  });

  useWatchContractEvent({
    address: CONTRACTS.task,
    abi: TASK_EVENTS_ABI,
    eventName: "TaskCreated",
    chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { taskId, agent } = log.args;
        push({
          id:       `tc-${log.transactionHash}-${log.logIndex}`,
          kind:     "task",
          label:    `Task #${taskId?.toString() ?? "?"} Created`,
          detail:   `Agent ${agent ? shortAddr(agent) : "?"}`,
          ts:       Date.now(),
          positive: true,
        });
      });
    },
  });

  useWatchContractEvent({
    address: CONTRACTS.stream,
    abi: STREAM_EVENTS_ABI,
    eventName: "StreamCompleted",
    chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { streamId } = log.args;
        push({
          id:       `sc-${log.transactionHash}-${log.logIndex}`,
          kind:     "completed",
          label:    `Stream #${streamId?.toString() ?? "?"} Completed`,
          detail:   "All funds settled",
          ts:       Date.now(),
          positive: true,
        });
      });
    },
  });

  useWatchContractEvent({
    address: CONTRACTS.stream,
    abi: STREAM_EVENTS_ABI,
    eventName: "StreamReclaimed",
    chainId: ARC_MAINNET_ID,
    onLogs(logs) {
      logs.forEach(log => {
        const { streamId } = log.args;
        push({
          id:       `sr-${log.transactionHash}-${log.logIndex}`,
          kind:     "reclaimed",
          label:    `Stream #${streamId?.toString() ?? "?"} Reclaimed`,
          detail:   "Heartbeat timeout — score slashed",
          ts:       Date.now(),
          positive: false,
        });
      });
    },
  });

  if (events.length === 0) {
    return (
      <div className="text-sm text-center py-6" style={{ color: T.subtle }}>
        <Activity size={18} className="mx-auto mb-2 opacity-40" style={{ color: T.accent }} />
        Watching for live on-chain events…
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
      {events.map(ev => (
        <div key={ev.id} className="flex items-start gap-2.5 px-3 py-2 rounded-xl transition-colors"
             style={{ background: "rgba(186,230,253,0.15)", border: `1px solid ${T.border}` }}>
          <div className="mt-0.5 shrink-0">
            <KindIcon kind={ev.kind} positive={ev.positive} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate" style={{ color: T.ink }}>{ev.label}</div>
            <div className="text-xs truncate" style={{ color: T.subtle }}>{ev.detail}</div>
          </div>
          <div className="text-xs mono shrink-0" style={{ color: T.subtle }}>
            {new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      ))}
    </div>
  );
}
