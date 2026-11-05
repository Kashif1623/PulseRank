import { formatUnits } from "viem";
import { useReadContract, useWriteContract, useAccount } from "wagmi";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, Zap, CheckCircle, DollarSign, Clock, Repeat } from "lucide-react";
import { toast } from "sonner";
import contractsJson from "./contracts.json";
import { useStreamAgain } from "./StreamAgainContext";
import { useAgentBusyWith } from "./singleStream";

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

const SETTLE_STREAM_ABI = [
  {
    name: "settleStream",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [],
  },
] as const;

const CLAIM_PAYOUT_ABI = [
  {
    name: "claimPayout",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

const PENDING_PAYOUTS_ABI = [
  {
    name: "pendingPayouts",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
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

const GET_MODE_CONFIG_ABI = [
  {
    name: "getModeConfig",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "mode", type: "uint8" }],
    outputs: [
      { name: "heartbeatInterval", type: "uint256" },
      { name: "gracePeriod",       type: "uint256" },
    ],
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
  streamId, lastHeartbeat, startTime, durationSecs, mode, onSent,
}: {
  streamId: number;
  lastHeartbeat: bigint;
  startTime: bigint;
  durationSecs: bigint;
  mode: number;
  onSent?: () => void;
}) {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(id);
  }, []);

  // The contract accepts a heartbeat only once `heartbeatInterval` seconds have passed since
  // the last one (or since activation). Read the live value instead of trusting a constant.
  const { data: modeCfg } = useReadContract({
    address: STREAM_CONTRACT,
    abi: GET_MODE_CONFIG_ABI,
    functionName: "getModeConfig",
    args: [mode],
    chainId: ARC_MAINNET_ID,
    query: { staleTime: 60_000 },
  });
  const interval = modeCfg ? Number(modeCfg[0]) : (MODE_INTERVAL[mode] ?? 1800);
  const nextAt   = Number(lastHeartbeat) + interval;
  const secsLeft = Math.max(0, nextAt - nowSec);
  const endsAt   = Number(startTime) + Number(durationSecs);
  // True when the stream will already be over by the time the first heartbeat is allowed.
  const tooShort = nextAt >= endsAt;

  const { writeContract, isPending: sending } = useWriteContract();

  function handleHeartbeat() {
    // A call made before the window opens is guaranteed to revert (HeartbeatTooEarly),
    // so explain it instead of sending a transaction that can only fail.
    if (secsLeft > 10) {
      toast.warning(
        tooShort
          ? `This stream ends before the first heartbeat window opens (${fmtCountdown(secsLeft)} from now).`
          : `Heartbeat window opens in ${fmtCountdown(secsLeft)}.`,
      );
      return;
    }
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
    <div>
      <button
        onClick={handleHeartbeat}
        disabled={sending}
        title={secsLeft > 0 ? `Heartbeat window opens in ${fmtCountdown(secsLeft)}` : "Send heartbeat now"}
        className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "linear-gradient(135deg,#0284c7,#06b6d4)",
          color:      "#fff",
          boxShadow:  "0 3px 12px rgba(2,132,199,0.30)",
          border:     "1px solid rgba(186,230,253,0.70)",
          opacity:    secsLeft > 10 ? 0.75 : 1,
        }}
      >
        {sending ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
        {sending
          ? "Waiting for wallet…"
          : secsLeft > 0
            ? `⚡ Send Heartbeat (opens in ${fmtCountdown(secsLeft)})`
            : "⚡ Send Manual Heartbeat"}
      </button>
      {tooShort && (
        <p className="mt-1.5 text-xs leading-snug" style={{ color: "#b45309" }}>
          This stream is shorter than its {MODE_LABEL[mode] ?? ""} heartbeat interval ({fmtCountdown(interval)}).
          The contract only accepts a heartbeat {fmtCountdown(interval)} after activation, so none can be recorded
          before it ends. Use a longer duration to record heartbeats.
        </p>
      )}
    </div>
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

// ── SettleButton ─────────────────────────────────────────────────────────────

/**
 * Settles an expired Active stream via settleStream(streamId).
 * Distributes earned USDC to pendingPayouts[agent] and unearned to pendingPayouts[funder].
 * Both agent and funder can call this — labels are role-specific.
 */
function SettleButton({
  streamId, role, onSettled,
}: {
  streamId: number;
  role: "funder" | "agent";
  onSettled: () => void;
}) {
  const { writeContract, isPending } = useWriteContract();
  // Locks the button the moment a transaction is submitted so it can never be sent twice.
  const [submitted, setSubmitted] = useState(false);

  function handle() {
    if (submitted || isPending) return;
    setSubmitted(true);
    writeContract(
      {
        address: STREAM_CONTRACT,
        abi: SETTLE_STREAM_ABI,
        functionName: "settleStream",
        args: [BigInt(streamId)],
        chainId: ARC_MAINNET_ID,
      },
      {
        onError: (e) => {
          setSubmitted(false); // rejected or failed: allow a retry
          toast.error(`Settle failed: ${e.message.slice(0, 100)}`);
        },
        onSuccess: () => {
          toast.success(
            role === "agent"
              ? `Stream #${streamId} settled. Use Withdraw to send your earnings to your wallet.`
              : `Stream #${streamId} settled. Use Withdraw to send the unearned USDC to your wallet.`
          );
          onSettled();
        },
      }
    );
  }

  const locked = isPending || submitted;

  return (
    <button
      onClick={handle}
      disabled={locked}
      className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: role === "agent"
          ? "linear-gradient(135deg,#16a34a,#22c55e)"
          : "linear-gradient(135deg,#0284c7,#0ea5e9)",
        color:     "#fff",
        boxShadow: role === "agent"
          ? "0 3px 12px rgba(22,163,74,0.30)"
          : "0 3px 12px rgba(2,132,199,0.30)",
      }}
    >
      {locked ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
      {isPending
        ? "Waiting for wallet…"
        : submitted
          ? "Settling…"
          : role === "agent"
            ? "Claim Earnings"
            : "Settle & Reclaim Unspent USDC"}
    </button>
  );
}

// ── StreamAgainButton ────────────────────────────────────────────────────────

/** Reopens the stream form pre-filled with this stream's agent, amount, duration and mode. */
function StreamAgainButton({ stream }: { stream: StreamData }) {
  const streamAgain = useStreamAgain();
  if (!streamAgain) return null;

  function handle() {
    streamAgain?.({
      agent:        stream.agent,
      amount:       formatUnits(stream.totalAmount, 6),
      durationSecs: Number(stream.durationSecs),
      mode:         (stream.mode === 1 || stream.mode === 3 ? stream.mode : 2),
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all hover:brightness-105 active:scale-[0.98]"
      style={{
        background: "rgba(2,132,199,0.10)",
        border:     "1px solid rgba(2,132,199,0.30)",
        color:      "#0284c7",
      }}
    >
      <Repeat size={13} />
      Stream Again &amp; Boost Score
    </button>
  );
}

// ── ClaimPayoutButton ─────────────────────────────────────────────────────────

/**
 * Calls claimPayout() to withdraw accumulated pendingPayouts[caller] to their wallet.
 * Shows only when pendingPayouts > 0 for the connected wallet.
 */
function ClaimPayoutButton({ onClaimed }: { onClaimed?: () => void }) {
  const { address } = useAccount();

  const { data: pending, refetch: refetchPending } = useReadContract({
    address: STREAM_CONTRACT,
    abi: PENDING_PAYOUTS_ABI,
    functionName: "pendingPayouts",
    args: address ? [address] : undefined,
    chainId: ARC_MAINNET_ID,
    query: { enabled: !!address, refetchInterval: 4_000 },
  });

  const { writeContract, isPending } = useWriteContract();

  const hasPending = pending !== undefined && (pending) > 0n;
  if (!hasPending) return null;

  function handle() {
    writeContract(
      {
        address: STREAM_CONTRACT,
        abi: CLAIM_PAYOUT_ABI,
        functionName: "claimPayout",
        args: [],
        chainId: ARC_MAINNET_ID,
      },
      {
        onError: (e) => toast.error(`Claim failed: ${e.message.slice(0, 100)}`),
        onSuccess: () => {
          toast.success(`${fmtUsdc(pending as bigint)} USDC withdrawn to your wallet!`);
          void refetchPending();
          onClaimed?.();
        },
      }
    );
  }

  return (
    <button
      onClick={handle}
      disabled={isPending}
      className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: "linear-gradient(135deg,#7c3aed,#8b5cf6)",
        color:     "#fff",
        boxShadow: "0 3px 12px rgba(124,58,237,0.30)",
      }}
    >
      {isPending ? <Loader2 size={13} className="animate-spin" /> : <DollarSign size={13} />}
      {isPending
        ? "Waiting for wallet…"
        : `Withdraw ${fmtUsdc(pending)} USDC`}
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
  onEvent?: (type: "heartbeat" | "accept" | "reclaim" | "settle" | "claim") => void;
}) {
  // One agent wallet works one open stream at a time (frontend rule)
  const agentBusyWith = useAgentBusyWith(initialStream.agent, initialStream.streamId);

  // Local optimistic state: starts from the prop, can be overridden instantly
  const [optimisticStatus, setOptimisticStatus] = useState<number | null>(null);
  const [optimisticLastHb, setOptimisticLastHb] = useState<bigint | null>(null);

  // Live clock — updates every 5 s so expiry detection stays current
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5_000);
    return () => clearInterval(id);
  }, []);

  // Self-fetch: re-reads the stream from chain to confirm state after any action
  const { data: liveRaw, refetch } = useReadContract({
    address: STREAM_CONTRACT,
    abi: STREAM_GET_ABI,
    functionName: "getStream",
    args: [BigInt(initialStream.streamId)],
    chainId: ARC_MAINNET_ID,
    query: { refetchInterval: 10_000, enabled: true },
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

  const handleSettled = useCallback(() => {
    setOptimisticStatus(3); // Completed
    void refetch();
    onEvent?.("settle");
  }, [refetch, onEvent]);

  // ── Expiry detection ─────────────────────────────────────────────────────────
  // A stream is "expired" when it is still Active on-chain but its wall-clock
  // duration has elapsed: block.timestamp >= startTime + durationSecs.
  // We detect it client-side so the badge flips immediately without waiting for
  // a chain state-change; the contract will enforce the same rule in settleStream().
  const isChainActive  = stream.status === 1;
  const endTimeSec     = Number(stream.startTime) + Number(stream.durationSecs);
  const isExpired      = isChainActive && stream.startTime > 0n && nowSec >= endTimeSec;

  // For display: expired active streams show a distinct "Expired" badge
  const displayStatus = isExpired ? 99 : stream.status;
  const STATUS_LABEL_EX: Record<number, string> = { ...STATUS_LABEL, 99: "Expired" };
  const STATUS_COLOR_EX: Record<number, string> = { ...STATUS_COLOR, 99: "#f59e0b" };

  const statusLabel = STATUS_LABEL_EX[displayStatus] ?? "Unknown";
  const statusColor = STATUS_COLOR_EX[displayStatus] ?? "#94a3b8";

  const earnedPct   = stream.totalAmount > 0n
    ? Math.round(Number((stream.earnedAmount * 100n) / stream.totalAmount))
    : 0;
  const isSelfStream = stream.funder.toLowerCase() === stream.agent.toLowerCase();
  const counterpart  = isSelfStream
    ? `self (stream #${stream.streamId})`
    : role === "funder" ? stream.agent : stream.funder;
  const isActive    = isChainActive && !isExpired; // truly running, not yet expired
  const isProposed  = stream.status === 0;
  const isTerminal  = stream.status >= 3;          // Completed / Reclaimed / Cancelled
  // Self-streams: show both agent actions (heartbeat/accept) and funder actions (reclaim)
  const showAgentActions  = role === "agent"  || isSelfStream;
  const showFunderActions = role === "funder" || isSelfStream;

  return (
    <div className="rounded-2xl p-4 space-y-3"
         style={{ background: T.surface, border: `1px solid ${T.border}` }}>

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="mono text-xs font-bold" style={{ color: T.accent }}>#{stream.streamId}</span>
          <span className="text-xs font-medium truncate mono" style={{ color: T.muted }}>
            {isSelfStream
              ? "Self-stream"
              : role === "funder"
                ? `→ Agent ${shortAddr(counterpart)}`
                : `← Funder ${shortAddr(counterpart)}`}
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

      {/* Time remaining / expiry indicator (Active streams only) */}
      {isChainActive && stream.startTime > 0n && !isTerminal && (
        <div className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5"
          style={{
            background: isExpired
              ? "rgba(245,158,11,0.10)" : "rgba(34,197,94,0.08)",
            color:      isExpired ? "#b45309" : "#16a34a",
            border:     `1px solid ${isExpired ? "rgba(245,158,11,0.25)" : "rgba(34,197,94,0.18)"}`,
          }}>
          <Clock size={11} />
          {isExpired
            ? "Duration elapsed — ready to settle"
            : (() => {
                const rem = endTimeSec - nowSec;
                if (rem < 60)   return `Expires in ${rem}s`;
                if (rem < 3600) return `Expires in ${Math.ceil(rem / 60)}m`;
                if (rem < 86400) return `Expires in ${(rem / 3600).toFixed(1)}h`;
                return `Expires in ${(rem / 86400).toFixed(1)}d`;
              })()
          }
        </div>
      )}

      {/* Agent actions — shown when role===agent OR same wallet is both funder+agent */}
      {showAgentActions && isProposed && (
        agentBusyWith ? (
          <div className="rounded-xl px-3 py-2.5 text-xs"
               style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)", color: "#b45309" }}>
            This agent already has an active stream (#{agentBusyWith.id}). It can accept a new one after #{agentBusyWith.id} is settled or reclaimed.
          </div>
        ) : (
          <AcceptButton streamId={stream.streamId} onAccepted={handleAccepted} />
        )
      )}
      {/* Heartbeat: only while truly running (Active and NOT expired) */}
      {showAgentActions && isActive && (
        <HeartbeatButton
          streamId={stream.streamId}
          lastHeartbeat={stream.lastHeartbeat}
          startTime={stream.startTime}
          durationSecs={stream.durationSecs}
          mode={stream.mode}
          onSent={handleHeartbeatSent}
        />
      )}

      {/* Settle button: appears for BOTH funder and agent when stream has expired */}
      {isExpired && showAgentActions && (
        <SettleButton streamId={stream.streamId} role="agent" onSettled={handleSettled} />
      )}
      {isExpired && showFunderActions && !showAgentActions && (
        <SettleButton streamId={stream.streamId} role="funder" onSettled={handleSettled} />
      )}

      {/* Funder early-reclaim: only while truly running (not expired) */}
      {showFunderActions && isActive && (
        <ReclaimButton streamId={stream.streamId} onReclaimed={handleReclaimed} />
      )}

      {/* Claim payout: shown after any terminal event (settle / reclaim / complete) */}
      {(isTerminal || isExpired) && (
        <ClaimPayoutButton onClaimed={() => onEvent?.("claim")} />
      )}

      {/* Restart: finished streams (expired, completed or reclaimed) can be re-created in one click */}
      {showFunderActions && (isExpired || stream.status === 3 || stream.status === 4) && (
        <StreamAgainButton stream={stream} />
      )}
    </div>
  );
}
