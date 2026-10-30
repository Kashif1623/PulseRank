import { formatUnits } from "viem";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import contractsJson from "./contracts.json";

const ARC_MAINNET_ID = 5042;
const STREAM_CONTRACT = contractsJson.contracts.PulseStreamV2.address as `0x${string}`;

// ── ABIs ─────────────────────────────────────────────────────────────────────

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

// ── Stream status ─────────────────────────────────────────────────────────────

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

// ── Reclaim button (funder-only) ───────────────────────────────────────────────

function ReclaimButton({ streamId }: { streamId: number }) {
  const { data: timedOut, isLoading: checking } = useReadContract({
    address: STREAM_CONTRACT,
    abi: IS_TIMED_OUT_ABI,
    functionName: "isTimedOut",
    args: [BigInt(streamId)],
    chainId: ARC_MAINNET_ID,
    query: { refetchInterval: 15_000 },
  });

  const { writeContract: cancel, data: txHash, isPending: cancelling } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  if (checking) return null;
  if (!timedOut) return null;

  const busy = cancelling || confirming;

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
        onSuccess: () => toast.success("Unspent USDC reclaimed. Payout queued to your wallet."),
      }
    );
  }

  return (
    <button
      onClick={handleReclaim}
      disabled={busy}
      className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)",
        color: "#fff",
        boxShadow: "0 3px 12px rgba(220,38,38,0.30)",
      }}
    >
      {busy ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <AlertTriangle size={13} />
      )}
      {cancelling ? "Waiting for wallet…" : confirming ? "Confirming…" : "Reclaim Unspent USDC"}
    </button>
  );
}

// ── StreamCard ─────────────────────────────────────────────────────────────────

export function StreamCard({ stream, role }: { stream: StreamData; role: "funder" | "agent" }) {
  const statusLabel = STATUS_LABEL[stream.status] ?? "Unknown";
  const statusColor = STATUS_COLOR[stream.status] ?? "#94a3b8";
  const earnedPct   = stream.totalAmount > 0n
    ? Math.round(Number((stream.earnedAmount * 100n) / stream.totalAmount))
    : 0;
  const counterpart = role === "funder" ? stream.agent : stream.funder;
  const isActive    = stream.status === 1; // Active

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

      {/* Reclaim button — only for funders on active streams */}
      {role === "funder" && isActive && (
        <ReclaimButton streamId={stream.streamId} />
      )}
    </div>
  );
}
