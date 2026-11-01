import { formatUnits } from "viem";
import { useReadContract, useWriteContract } from "wagmi";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, Zap } from "lucide-react";
import { toast } from "sonner";
import contractsJson from "./contracts.json";

const ARC_MAINNET_ID = 5042;
const STREAM_CONTRACT = contractsJson.contracts.PulseStreamV2.address as `0x${string}`;

// ── ABIs ─────────────────────────────────────────────────────────────────────

const STREAM_GET_ABI = [
  {
    name: "getStream",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [
      { name: "funder",             type: "address" },
      { name: "agent",              type: "address" },
      { name: "totalAmount",        type: "uint256" },
      { name: "durationSecs",       type: "uint256" },
      { name: "ratePerSecX18",      type: "uint256" },
      { name: "startTime",          type: "uint256" },
      { name: "lastHeartbeat",      type: "uint256" },
      { name: "earnedAmount",       type: "uint256" },
      { name: "pausedAt",           type: "uint256" },
      { name: "pausedDuration",     type: "uint256" },
      { name: "missedHeartbeats",   type: "uint256" },
      { name: "lastMissCheckpoint", type: "uint256" },
      { name: "taskId",             type: "uint256" },
      { name: "mode",               type: "uint8"   },
      { name: "status",             type: "uint8"   },
    ],
  },
] as const;

const IS_TIMED_OUT_ABI = [
  {
    name: "isTimedOut",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const CANCEL_TIMED_OUT_ABI = [
  {
    name: "cancelTimedOutStream",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [],
  },
] as const;

const ACCEPT_STREAM_ABI = [
  {
    name: "acceptStream",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [],
  },
] as const;

const SEND_HEARTBEAT_ABI = [
  {
    name: "sendHeartbeat",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [],
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<number, string> = {
  0: "Proposed", 1: "Active", 2: "Paused",
  3: "Completed", 4: "Reclaimed", 5: "Cancelled",
};
const STATUS_COLOR: Record<number, string> = {
  0: "#0ea5e9", 1: "#22c55e", 2: "#f59e0b",
  3: "#64748b", 4: "#ef4444", 5: "#94a3b8",
};
const MODE_LABEL: Record<number, string> = { 1: "Strict", 2: "Normal", 3: "Relaxed" };
// heartbeatInterval per mode (seconds) — mirrors PulseStreamV2 constructor defaults
const MODE_INTERVAL: Record<number, number> = { 1: 300, 2: 1800, 3: 3600 };

export interface StreamData {
  streamId:           number;
  funder:             string;
  agent:              string;
  totalAmount:        bigint;
  durationSecs:       bigint;
  ratePerSecX18:      bigint;
  startTime:          bigint;
  lastHeartbeat:      bigint;
  earnedAmount:       bigint;
  pausedAt:           bigint;
  pausedDuration:     bigint;
  missedHeartbeats:   bigint;
  lastMissCheckpoint: bigint;
  taskId:             bigint;
  mode:               number;
  status:             number;
}

const T = {
  ink:     "#0f172a",
  muted:   "#334155",
  subtle:  "#64748b",
  border:  "rgba(186,230,253,0.80)",
  accent:  "#0284c7",
  surface: "rgba(255,255,255,0.70)",
};

function shortAddr(a: string | undefined) {
  if (!a || a.length < 10) return a ?? "0x???";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function fmtUsdc(n: bigint) {
  return `$${Number(formatUnits(n, 6)).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}
function fmtDuration(secs: bigint) {
  const s = Number(secs);
  if (s >= 86400) return `${(s / 86400).toFixed(1)}d`;
  if (s >= 3600)  return `${(s / 3600).toFixed(1)}h`;
  return `${s}s`;
}
function fmtCountdown(secs: number): string {
  if (secs <= 0) return "";
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.ceil(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}

// ── HeartbeatButton ───────────────────────────────────────────────────────────

function HeartbeatButton({
  streamId, lastHeartbeat, mode, onSent,
}: {
  streamId: number;
  lastHeartbeat: bigint;
  mode: number;
  onSent?: () => void;
}) {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5_000);
    return () => clearInterval(id);
  }, []);

  const interval = MODE_INTERVAL[mode] ?? 1800;
  const nextAt   = Number(lastHeartbeat) + interval;
  const secsLeft = Math.max(0, nextAt - nowSec);
  // Always show active button — contract enforces HeartbeatTooEarly on-chain.
  // Show countdown as a secondary hint only; never disable the button for timing.

  const { writeContract, isPending: sending } = useWriteContract();

  function handleHeartbeat() {
    writeContract(
      {
        address: STREAM_CONTRACT,
        abi: SEND_HEARTBEAT_ABI,
        functionName: "sendHeartbeat",
        args: [BigInt(streamId)],
        chainId: ARC_MAINNET_ID,
      },
      {
        onError: (e) => {
          const msg = e.message.includes("HeartbeatTooEarly")
            ? `Too early — next heartbeat in ${fmtCountdown(secsLeft)}.`
            : `Heartbeat failed: ${e.message.slice(0, 100)}`;
          toast.error(msg);
        },
        onSuccess: () => {
          toast.success(`⚡ Heartbeat sent for stream #${streamId}!`);
          onSent?.();
        },
      }
    );
  }

  return (
    <button
      onClick={handleHeartbeat}
      disabled={sending}
      title={secsLeft > 0 ? `Next interval in ${fmtCountdown(secsLeft)} — contract will enforce` : "Send heartbeat now"}
      className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: "linear-gradient(135deg,#0284c7,#06b6d4)",
        color:      "#fff",
        boxShadow:  "0 3px 12px rgba(2,132,199,0.30)",
        border:     "1px solid rgba(186,230,253,0.70)",
      }}
    >
      {sending ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
      {sending
        ? "Waiting for wallet…"
        : secsLeft > 0
          ? `⚡ Send Heartbeat (next in ${fmtCountdown(secsLeft)})`
          : "⚡ Send Manual Heartbeat"}
    </button>
  );
}

// ── AcceptButton ──────────────────────────────────────────────────────────────

function AcceptButton({ streamId, onAccepted }: { streamId: number; onAccepted: () => void }) {
  const { writeContract, isPending: accepting } = useWriteContract();

  function handle() {
    writeContract(
      {
        address: STREAM_CONTRACT,
        abi: ACCEPT_STREAM_ABI,
        functionName: "acceptStream",
        args: [BigInt(streamId)],
        chainId: ARC_MAINNET_ID,
      },
      {
        onError: (e) => toast.error(`Accept failed: ${e.message.slice(0, 100)}`),
        onSuccess: () => {
          toast.success(`Stream #${streamId} accepted — now Active!`);
          onAccepted(); // fire immediately on wallet sign — no receipt wait
        },
      }
    );
  }

  return (
    <button
      onClick={handle}
      disabled={accepting}
      className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: "linear-gradient(135deg,#0284c7,#06b6d4)",
        color: "#fff",
        boxShadow: "0 3px 12px rgba(2,132,199,0.30)",
      }}
    >
      {accepting ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
      {accepting ? "Waiting for wallet…" : "✅ Accept Stream"}
    </button>
  );
}

// ── ReclaimButton ─────────────────────────────────────────────────────────────

function ReclaimButton({ streamId, onReclaimed }: { streamId: number; onReclaimed: () => void }) {
  const { data: timedOut, isLoading: checking } = useReadContract({
    address: STREAM_CONTRACT,
    abi: IS_TIMED_OUT_ABI,
    functionName: "isTimedOut",
    args: [BigInt(streamId)],
    chainId: ARC_MAINNET_ID,
    query: { refetchInterval: 15_000 },
  });

  const { writeContract: cancel, isPending: cancelling } = useWriteContract();

  if (checking || !timedOut) return null;

  function handleReclaim() {
    cancel(
      {
        address: STREAM_CONTRACT,
        abi: CANCEL_TIMED_OUT_ABI,
        functionName: "cancelTimedOutStream",
        args: [BigInt(streamId)],
        chainId: ARC_MAINNET_ID,
      },
      {
        onError: (e) => toast.error(`Reclaim failed: ${e.message.slice(0, 100)}`),
        onSuccess: () => {
          toast.success("Unspent USDC reclaimed. Payout queued to your wallet.");
          onReclaimed(); // fire immediately on wallet sign
        },
      }
    );
  }

  return (
    <button
      onClick={handleReclaim}
      disabled={cancelling}
      className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: "linear-gradient(135deg,#dc2626,#ef4444)",
        color: "#fff",
        boxShadow: "0 3px 12px rgba(220,38,38,0.30)",
      }}
    >
      {cancelling ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
      {cancelling ? "Waiting for wallet…" : "Reclaim Unspent USDC"}
    </button>
  );
}

// ── StreamCard ─────────────────────────────────────────────────────────────────

export function StreamCard({
  stream: initialStream,
  role,
  onEvent,
}: {
  stream: StreamData;
  role: "funder" | "agent";
  onEvent?: (type: "heartbeat" | "accept" | "reclaim") => void;
}) {
  // Local optimistic state: starts from the prop, can be overridden instantly
  const [optimisticStatus, setOptimisticStatus] = useState<number | null>(null);
  const [optimisticLastHb, setOptimisticLastHb] = useState<bigint | null>(null);

  // Self-fetch: re-reads the stream from chain to confirm state after any action
  const { data: liveRaw, refetch } = useReadContract({
    address: STREAM_CONTRACT,
    abi: STREAM_GET_ABI,
    functionName: "getStream",
    args: [BigInt(initialStream.streamId)],
    chainId: ARC_MAINNET_ID,
    query: { refetchInterval: 30_000, enabled: true },
  });

  // Merge live data over initial props, then apply optimistic overrides.
  // viem may return either a named object or a positional tuple depending on
  // wagmi version / ABI shape — handle both by trying named fields first,
  // then falling back to array indices, then falling back to initialStream.
  const liveStream: StreamData = (() => {
    if (!liveRaw) return initialStream;
    // Try named-field access (wagmi v2 with named ABI outputs)
    const r = liveRaw as unknown as Record<string, unknown>;
    const funder  = (r.funder  as string | undefined) ?? (liveRaw as unknown as readonly unknown[])[0] as string | undefined;
    const agent   = (r.agent   as string | undefined) ?? (liveRaw as unknown as readonly unknown[])[1] as string | undefined;
    // If addresses are still missing or malformed, bail to initialStream
    if (!funder || !agent || typeof funder !== "string" || funder.length < 10) return initialStream;
    return {
      streamId:           initialStream.streamId,
      funder,
      agent,
      totalAmount:        (r.totalAmount        ?? (liveRaw as unknown as readonly unknown[])[2])  as bigint,
      durationSecs:       (r.durationSecs       ?? (liveRaw as unknown as readonly unknown[])[3])  as bigint,
      ratePerSecX18:      (r.ratePerSecX18      ?? (liveRaw as unknown as readonly unknown[])[4])  as bigint,
      startTime:          (r.startTime          ?? (liveRaw as unknown as readonly unknown[])[5])  as bigint,
      lastHeartbeat:      (r.lastHeartbeat      ?? (liveRaw as unknown as readonly unknown[])[6])  as bigint,
      earnedAmount:       (r.earnedAmount       ?? (liveRaw as unknown as readonly unknown[])[7])  as bigint,
      pausedAt:           (r.pausedAt           ?? (liveRaw as unknown as readonly unknown[])[8])  as bigint,
      pausedDuration:     (r.pausedDuration     ?? (liveRaw as unknown as readonly unknown[])[9])  as bigint,
      missedHeartbeats:   (r.missedHeartbeats   ?? (liveRaw as unknown as readonly unknown[])[10]) as bigint,
      lastMissCheckpoint: (r.lastMissCheckpoint ?? (liveRaw as unknown as readonly unknown[])[11]) as bigint,
      taskId:             (r.taskId             ?? (liveRaw as unknown as readonly unknown[])[12]) as bigint,
      mode:               Number(r.mode   ?? (liveRaw as unknown as readonly unknown[])[13]),
      status:             Number(r.status ?? (liveRaw as unknown as readonly unknown[])[14]),
    };
  })();

  const stream: StreamData = {
    ...liveStream,
    status:        optimisticStatus     ?? liveStream.status,
    lastHeartbeat: optimisticLastHb     ?? liveStream.lastHeartbeat,
  };

  // Callbacks passed to child buttons
  const handleAccepted = useCallback(() => {
    setOptimisticStatus(1); // Active
    setOptimisticLastHb(BigInt(Math.floor(Date.now() / 1000)));
    void refetch();
    onEvent?.("accept");
  }, [refetch, onEvent]);

  const handleHeartbeatSent = useCallback(() => {
    setOptimisticLastHb(BigInt(Math.floor(Date.now() / 1000)));
    void refetch();
    onEvent?.("heartbeat");
  }, [refetch, onEvent]);

  const handleReclaimed = useCallback(() => {
    setOptimisticStatus(4); // Reclaimed
    void refetch();
    onEvent?.("reclaim");
  }, [refetch, onEvent]);

  const statusLabel = STATUS_LABEL[stream.status] ?? "Unknown";
  const statusColor = STATUS_COLOR[stream.status] ?? "#94a3b8";
  const earnedPct   = stream.totalAmount > 0n
    ? Math.round(Number((stream.earnedAmount * 100n) / stream.totalAmount))
    : 0;
  const counterpart = role === "funder" ? stream.agent : stream.funder;
  const isActive    = stream.status === 1;
  const isProposed  = stream.status === 0;

  return (
    <div className="rounded-2xl p-4 space-y-3"
         style={{ background: T.surface, border: `1px solid ${T.border}` }}>

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="mono text-xs font-bold" style={{ color: T.accent }}>#{stream.streamId}</span>
          <span className="text-xs font-medium truncate mono" style={{ color: T.muted }}>
            {role === "funder" ? "→ Agent" : "← Funder"} {shortAddr(counterpart)}
          </span>
        </div>
        <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${statusColor}18`, color: statusColor }}>
          {statusLabel}
        </span>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-sm font-bold tabular-nums" style={{ color: T.ink }}>{fmtUsdc(stream.totalAmount)}</div>
          <div className="text-xs" style={{ color: T.subtle }}>Total</div>
        </div>
        <div>
          <div className="text-sm font-bold tabular-nums" style={{ color: "#22c55e" }}>{fmtUsdc(stream.earnedAmount)}</div>
          <div className="text-xs" style={{ color: T.subtle }}>Earned</div>
        </div>
        <div>
          <div className="text-sm font-bold tabular-nums" style={{ color: T.muted }}>{fmtDuration(stream.durationSecs)}</div>
          <div className="text-xs" style={{ color: T.subtle }}>Duration</div>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs mb-1" style={{ color: T.subtle }}>
          <span>Earned</span>
          <span className="font-semibold">{earnedPct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(186,230,253,0.40)" }}>
          <div className="h-full rounded-full transition-all"
               style={{ width: `${earnedPct}%`, background: "linear-gradient(90deg,#22c55e,#16a34a)" }} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs" style={{ color: T.subtle }}>
        <span>Mode: <span className="font-semibold" style={{ color: T.accent }}>{MODE_LABEL[stream.mode] ?? stream.mode}</span></span>
        <span>Missed: <span className="font-semibold" style={{ color: stream.missedHeartbeats > 0n ? "#ef4444" : T.muted }}>{stream.missedHeartbeats.toString()}</span></span>
      </div>

      {/* Agent actions */}
      {role === "agent" && isProposed && (
        <AcceptButton streamId={stream.streamId} onAccepted={handleAccepted} />
      )}
      {role === "agent" && isActive && (
        <HeartbeatButton
          streamId={stream.streamId}
          lastHeartbeat={stream.lastHeartbeat}
          mode={stream.mode}
          onSent={handleHeartbeatSent}
        />
      )}

      {/* Funder actions */}
      {role === "funder" && isActive && (
        <ReclaimButton streamId={stream.streamId} onReclaimed={handleReclaimed} />
      )}
    </div>
  );
}
