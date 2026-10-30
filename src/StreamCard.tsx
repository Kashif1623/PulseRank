import { formatUnits } from "viem";

// Stream status enum matches PulseStreamV2.StreamStatus
const STATUS_LABEL: Record<number, string> = {
  0: "Proposed",
  1: "Active",
  2: "Paused",
  3: "Completed",
  4: "Reclaimed",
  5: "Cancelled",
};
const STATUS_COLOR: Record<number, string> = {
  0: "#0ea5e9",
  1: "#22c55e",
  2: "#f59e0b",
  3: "#64748b",
  4: "#ef4444",
  5: "#94a3b8",
};

// Matches the Stream struct tuple from getStream / agentStreams mapping
export interface StreamData {
  streamId:         number;
  funder:           string;
  agent:            string;
  totalAmount:      bigint;
  durationSecs:     bigint;
  ratePerSecX18:    bigint;
  startTime:        bigint;
  lastHeartbeat:    bigint;
  earnedAmount:     bigint;
  pausedAt:         bigint;
  pausedDuration:   bigint;
  missedHeartbeats: bigint;
  lastMissCheckpoint: bigint;
  taskId:           bigint;
  mode:             number;
  status:           number;
}

const MODE_LABEL: Record<number, string> = { 1: "Strict", 2: "Normal", 3: "Relaxed" };

function shortAddr(a: string) { return `${a.slice(0,6)}…${a.slice(-4)}`; }

function fmtUsdc(n: bigint) {
  return `$${Number(formatUnits(n, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDuration(secs: bigint) {
  const s = Number(secs);
  if (s >= 86400) return `${(s / 86400).toFixed(1)}d`;
  if (s >= 3600)  return `${(s / 3600).toFixed(1)}h`;
  return `${s}s`;
}

const T = {
  ink:     "#0f172a",
  muted:   "#334155",
  subtle:  "#64748b",
  border:  "rgba(186,230,253,0.80)",
  accent:  "#0284c7",
  surface: "rgba(255,255,255,0.70)",
};

export function StreamCard({ stream, role }: { stream: StreamData; role: "funder" | "agent" }) {
  const statusLabel = STATUS_LABEL[stream.status] ?? "Unknown";
  const statusColor = STATUS_COLOR[stream.status] ?? "#94a3b8";
  const earnedPct   = stream.totalAmount > 0n
    ? Math.round(Number((stream.earnedAmount * 100n) / stream.totalAmount))
    : 0;
  const counterpart = role === "funder" ? stream.agent : stream.funder;

  return (
    <div className="rounded-2xl p-4 space-y-3"
         style={{ background: T.surface, border: `1px solid ${T.border}` }}>

      {/* Header row */}
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

      {/* Progress bar */}
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
    </div>
  );
}
