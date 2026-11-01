import { useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import contractsJson from "./contracts.json";

// ── Constants ───────────────────────────────────────────────────────────────

const ARC_MAINNET_ID = 5042;
const CONTRACTS = {
  score:  contractsJson.contracts.PulseScoreV2.address  as `0x${string}`,
  stream: contractsJson.contracts.PulseStreamV2.address as `0x${string}`,
};

const SCORE_ABI = [
  {
    name: "getStats", type: "function", stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "score",                type: "uint256" },
      { name: "tier",                 type: "string"  },
      { name: "successCount",         type: "uint256" },
      { name: "failedCount",          type: "uint256" },
      { name: "disputesAgainstCount", type: "uint256" },
      { name: "disputesWonCount",     type: "uint256" },
    ],
  },
] as const;

const STREAM_LIST_ABI = [
  {
    name: "agentStreams", type: "function", stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }, { name: "idx", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const STREAM_DETAIL_ABI = [
  {
    name: "getStream", type: "function", stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [
      { name: "funder",              type: "address" },
      { name: "agent",               type: "address" },
      { name: "totalAmount",         type: "uint256" },
      { name: "durationSecs",        type: "uint256" },
      { name: "ratePerSecX18",       type: "uint256" },
      { name: "startTime",           type: "uint256" },
      { name: "lastHeartbeat",       type: "uint256" },
      { name: "earnedAmount",        type: "uint256" },
      { name: "pausedAt",            type: "uint256" },
      { name: "pausedDuration",      type: "uint256" },
      { name: "missedHeartbeats",    type: "uint256" },
      { name: "lastMissCheckpoint",  type: "uint256" },
      { name: "taskId",              type: "uint256" },
      { name: "mode",                type: "uint8"   },
      { name: "status",              type: "uint8"   },
    ],
  },
] as const;

const IS_TIMED_OUT_ABI = [
  {
    name: "isTimedOut", type: "function", stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

// Mode heartbeat+grace in seconds
const MODE_BUFFER: Record<number, number> = { 1: 900, 2: 3600, 3: 10800 };

// ── AI verdict engine (pure client-side) ────────────────────────────────────

export interface AiAnalysis {
  status: string;
  statusColor: "green" | "yellow" | "red";
  summary: string;
  recommendation: string;
  confidence: number; // 0-100
  signals: { label: string; value: string; sentiment: "positive" | "neutral" | "negative" }[];
}

interface EngineInput {
  score: number;
  tier: string;
  success: number;
  failed: number;
  disputesAgainst: number;
  disputesWon: number;
  lastHeartbeatSec: number;  // unix seconds, 0 if unknown
  missedHeartbeats: number;
  isTimedOut: boolean;
  mode: number;              // 0 if no stream
  streamStatus: number;      // 0-5, -1 if no stream
  nowSec: number;
}

function generateVerdict(inp: EngineInput): AiAnalysis {
  const {
    score, tier, success, failed, disputesAgainst, disputesWon,
    lastHeartbeatSec, missedHeartbeats, isTimedOut, mode, streamStatus, nowSec,
  } = inp;

  const total = success + failed;
  const winRate = total > 0 ? success / total : null;
  const hbAge = lastHeartbeatSec > 0 ? nowSec - lastHeartbeatSec : null;
  const buffer = MODE_BUFFER[mode] ?? 3600;
  const hasActiveStream = streamStatus === 1; // Active
  const hasPausedStream = streamStatus === 2; // Paused

  // ── Score health ───────────────────────────────────────────────────────────
  let scoreHealth: "strong" | "moderate" | "weak" | "unproven";
  if (score >= 800)      scoreHealth = "strong";
  else if (score >= 500) scoreHealth = "moderate";
  else if (score > 0)    scoreHealth = "weak";
  else                   scoreHealth = "unproven";

  // ── Heartbeat health ───────────────────────────────────────────────────────
  let hbHealth: "healthy" | "lagging" | "critical" | "dead" | "idle";
  if (isTimedOut)                                     hbHealth = "dead";
  else if (hbAge === null || !hasActiveStream)         hbHealth = "idle";
  else if (hbAge < buffer * 0.5)                      hbHealth = "healthy";
  else if (hbAge < buffer * 0.85)                     hbHealth = "lagging";
  else                                                 hbHealth = "critical";

  // ── Win-rate health ────────────────────────────────────────────────────────
  let perfHealth: "excellent" | "good" | "fair" | "poor" | "unknown";
  if (winRate === null)       perfHealth = "unknown";
  else if (winRate >= 0.90)   perfHealth = "excellent";
  else if (winRate >= 0.75)   perfHealth = "good";
  else if (winRate >= 0.50)   perfHealth = "fair";
  else                        perfHealth = "poor";

  // ── Dispute flag ──────────────────────────────────────────────────────────
  const disputeFlag = disputesAgainst > disputesWon && disputesAgainst > 0;

  // ── Derive overall status ─────────────────────────────────────────────────
  let statusColor: AiAnalysis["statusColor"];
  let status: string;
  if (hbHealth === "dead") {
    statusColor = "red";   status = "DEAD";
  } else if (hbHealth === "critical" || perfHealth === "poor" || disputeFlag) {
    statusColor = "red";   status = "AT RISK";
  } else if (hbHealth === "lagging" || scoreHealth === "weak" || perfHealth === "fair") {
    statusColor = "yellow"; status = "NEEDS ATTENTION";
  } else if (scoreHealth === "unproven" && hbHealth === "idle") {
    statusColor = "yellow"; status = "UNVERIFIED";
  } else if (scoreHealth === "strong" && (hbHealth === "healthy" || hbHealth === "idle") && (winRate === null || winRate >= 0.5)) {
    statusColor = "green";  status = "TRUSTED";
  } else {
    statusColor = "green";  status = "ACTIVE";
  }

  // ── Summary sentence ──────────────────────────────────────────────────────
  const summaries: Record<string, string[]> = {
    dead:     [
      `Agent is unresponsive — heartbeat timed out${missedHeartbeats > 0 ? ` (${missedHeartbeats} missed)` : ""}. Funds are eligible for reclaim.`,
      `No heartbeat signal detected. Stream can be terminated and USDC returned to funder.`,
    ],
    critical: [
      `Heartbeat is ${hbAge ? Math.round(hbAge / 60) + "m" : "?"} overdue. Agent must check in immediately to avoid penalty.`,
      `Score is ${score}/1000 with ${failed} failed streams — reliability is declining.`,
    ],
    lagging:  [
      `Last heartbeat was ${hbAge ? Math.round(hbAge / 60) + " minutes ago" : "recent"}. Activity is present but slowing.`,
      `Agent is ${tier} tier with ${success} completed streams. Monitor for missed intervals.`,
    ],
    atRisk:   [
      `Win rate is ${winRate !== null ? (winRate * 100).toFixed(0) + "%" : "unknown"} across ${total} streams — performance below expectations.`,
      `${disputesAgainst} dispute${disputesAgainst !== 1 ? "s" : ""} resolved against this agent. Caution advised.`,
    ],
    healthy:  [
      `Agent is performing strongly — score ${score}/1000 (${tier}), ${success} successful streams, heartbeat on schedule.`,
      `${tier} tier agent with ${success} completions and a ${winRate !== null ? (winRate * 100).toFixed(0) + "%" : "solid"} success rate. Highly reliable.`,
    ],
    unverified: [
      `No streams completed yet. Agent is registered but awaiting first engagement.`,
      `Newly registered agent — no performance history on-chain. Review profile before funding.`,
    ],
  };

  let summaryKey: keyof typeof summaries;
  if (hbHealth === "dead")              summaryKey = "dead";
  else if (hbHealth === "critical")     summaryKey = "critical";
  else if (hbHealth === "lagging")      summaryKey = "lagging";
  else if (inp.failed > inp.success || disputeFlag) summaryKey = "atRisk";
  else if (scoreHealth === "unproven")  summaryKey = "unverified";
  else                                  summaryKey = "healthy";

  const summaryArr = summaries[summaryKey];
  const summary = summaryArr[Math.abs(score + missedHeartbeats) % summaryArr.length];

  // ── Recommendation ────────────────────────────────────────────────────────
  let recommendation: string;
  if (hbHealth === "dead") {
    recommendation = "Call cancelTimedOutStream() to reclaim unspent USDC and slash the agent's score.";
  } else if (hbHealth === "critical") {
    recommendation = "Agent should send a heartbeat within the next few minutes to avoid a reclaim penalty.";
  } else if (hbHealth === "lagging") {
    recommendation = "Monitor closely. If heartbeat is not sent before the grace period ends, funds can be reclaimed.";
  } else if (perfHealth === "poor") {
    recommendation = `Low win rate (${winRate !== null ? (winRate * 100).toFixed(0) + "%" : "unknown"}) — consider withholding new streams until the agent improves reliability.`;
  } else if (disputeFlag) {
    recommendation = `${disputesAgainst} unresolved dispute(s). Review agent history before committing further USDC.`;
  } else if (hasPausedStream) {
    recommendation = "Stream is paused. Unpause when ready to resume heartbeat tracking and fund accrual.";
  } else if (scoreHealth === "unproven") {
    recommendation = "Start with a small stream to build trust. Increase funding after the first successful completion.";
  } else if (scoreHealth === "moderate") {
    recommendation = `Agent is building reputation (${score}/1000). Completing more streams will advance to the next tier.`;
  } else {
    recommendation = `${tier} tier agent with a strong track record. Safe to engage for new streams.`;
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  let confidence = 50;
  if (total >= 10)       confidence += 20;
  else if (total >= 3)   confidence += 10;
  if (score >= 700)      confidence += 15;
  if (disputesAgainst === 0) confidence += 10;
  if (hbHealth === "healthy") confidence += 10;
  if (hbHealth === "dead" || hbHealth === "critical") confidence = Math.max(confidence, 85);
  confidence = Math.min(100, confidence);

  // ── Signals ───────────────────────────────────────────────────────────────
  const signals: AiAnalysis["signals"] = [
    {
      label: "Reputation Score",
      value: `${score} / 1000 (${tier})`,
      sentiment: scoreHealth === "strong" ? "positive" : scoreHealth === "unproven" ? "neutral" : scoreHealth === "moderate" ? "neutral" : "negative",
    },
    {
      label: "Stream Win Rate",
      value: winRate !== null ? `${(winRate * 100).toFixed(0)}% (${success}W / ${failed}L)` : "No streams yet",
      sentiment: perfHealth === "excellent" || perfHealth === "good" ? "positive" : perfHealth === "unknown" ? "neutral" : "negative",
    },
    {
      label: "Heartbeat Status",
      value: hbHealth === "idle" ? "No active stream"
           : hbHealth === "dead" ? `Timed out (${missedHeartbeats} missed)`
           : hbHealth === "healthy" ? `On schedule (${hbAge ? Math.round(hbAge / 60) + "m ago" : "recent"})`
           : hbHealth === "lagging" ? `Lagging — ${hbAge ? Math.round(hbAge / 60) + "m ago" : "?"}`
           : `Critical — ${hbAge ? Math.round(hbAge / 60) + "m overdue" : "overdue"}`,
      sentiment: hbHealth === "healthy" || hbHealth === "idle" ? "positive"
               : hbHealth === "lagging" ? "neutral"
               : "negative",
    },
    {
      label: "Disputes",
      value: disputesAgainst === 0
        ? "None"
        : `${disputesAgainst} against / ${disputesWon} won`,
      sentiment: disputesAgainst === 0 ? "positive" : disputesWon >= disputesAgainst ? "neutral" : "negative",
    },
  ];

  return { status, statusColor, summary, recommendation, confidence, signals };
}

// ── AiInspector component ─────────────────────────────────────────────────────

interface Props {
  /** Agent wallet address (owner field from PulseRegistryV2) */
  agentOwner: string;
  /** Optional agent display name */
  agentName?: string;
  /** Compact mode for leaderboard rows */
  compact?: boolean;
}

export function AiInspector({ agentOwner, agentName, compact = false }: Props) {
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));

  const { data: statsRaw } = useReadContract({
    address: CONTRACTS.score, abi: SCORE_ABI,
    functionName: "getStats",
    args: [agentOwner as `0x${string}`],
    chainId: ARC_MAINNET_ID,
    query: { enabled: !!agentOwner, refetchInterval: 30_000 },
  });

  const { data: streamId0 } = useReadContract({
    address: CONTRACTS.stream, abi: STREAM_LIST_ABI,
    functionName: "agentStreams",
    args: [agentOwner as `0x${string}`, 0n],
    chainId: ARC_MAINNET_ID,
    query: { enabled: !!agentOwner, refetchInterval: 15_000 },
  });

  const { data: streamRaw } = useReadContract({
    address: CONTRACTS.stream, abi: STREAM_DETAIL_ABI,
    functionName: "getStream",
    args: [streamId0 as bigint ?? 0n],
    chainId: ARC_MAINNET_ID,
    query: { enabled: !!streamId0, refetchInterval: 15_000 },
  });

  const { data: timedOut } = useReadContract({
    address: CONTRACTS.stream, abi: IS_TIMED_OUT_ABI,
    functionName: "isTimedOut",
    args: [streamId0 as bigint ?? 0n],
    chainId: ARC_MAINNET_ID,
    query: { enabled: !!streamId0, refetchInterval: 15_000 },
  });

  const analysis = useMemo<AiAnalysis | null>(() => {
    if (!statsRaw) return null;
    const sr = statsRaw as readonly unknown[];
    const score = Number(sr[0]);
    const tier = sr[1] as string;
    const success = Number(sr[2]);
    const failed  = Number(sr[3]);
    const disputesAgainst = Number(sr[4]);
    const disputesWon     = Number(sr[5]);

    let lastHeartbeatSec = 0;
    let missedHeartbeats = 0;
    let mode = 0;
    let streamStatus = -1;

    if (streamRaw) {
      type SF = { lastHeartbeat: bigint; missedHeartbeats: bigint; mode: number; status: number };
      const s = (streamRaw as unknown) as SF;
      lastHeartbeatSec = Number(s.lastHeartbeat);
      missedHeartbeats = Number(s.missedHeartbeats);
      mode = Number(s.mode);
      streamStatus = Number(s.status);
    }

    return generateVerdict({
      score, tier, success, failed, disputesAgainst, disputesWon,
      lastHeartbeatSec, missedHeartbeats,
      isTimedOut: timedOut === true,
      mode, streamStatus, nowSec,
    });
  }, [statsRaw, streamRaw, timedOut, nowSec]);

  if (!analysis) return null;

  const statusBg = analysis.statusColor === "green"
    ? "rgba(34,197,94,0.12)"
    : analysis.statusColor === "yellow"
    ? "rgba(234,179,8,0.12)"
    : "rgba(239,68,68,0.12)";
  const statusFg = analysis.statusColor === "green" ? "#16a34a"
    : analysis.statusColor === "yellow" ? "#b45309"
    : "#dc2626";
  const borderColor = analysis.statusColor === "green"
    ? "rgba(34,197,94,0.25)"
    : analysis.statusColor === "yellow"
    ? "rgba(234,179,8,0.25)"
    : "rgba(239,68,68,0.25)";

  if (compact) {
    return (
      <div className="mt-2 rounded-xl p-3"
           style={{ background: statusBg, border: `1px solid ${borderColor}` }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold tracking-wider" style={{ color: statusFg }}>
            🤖 AI VERDICT
          </span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: statusBg, color: statusFg, border: `1px solid ${borderColor}` }}>
            {analysis.status}
          </span>
          <span className="ml-auto text-xs" style={{ color: "#64748b" }}>
            {analysis.confidence}% confidence
          </span>
        </div>
        <p className="text-xs font-medium mb-1" style={{ color: "#0f172a" }}>{analysis.summary}</p>
        <p className="text-xs" style={{ color: "#475569" }}>💡 {analysis.recommendation}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-4"
         style={{ background: "rgba(255,255,255,0.70)", backdropFilter: "blur(16px)",
                  border: `1px solid ${borderColor}`, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold tracking-wider" style={{ color: "#0f172a" }}>
          🤖 AI INSPECTOR
        </span>
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: statusBg, color: statusFg, border: `1px solid ${borderColor}` }}>
          {analysis.status}
        </span>
        {agentName && (
          <span className="ml-1 text-xs truncate max-w-[120px]" style={{ color: "#64748b" }}>
            {agentName}
          </span>
        )}
        <span className="ml-auto text-xs mono" style={{ color: "#64748b" }}>
          {analysis.confidence}% confidence
        </span>
      </div>

      {/* Summary + recommendation */}
      <p className="text-sm font-medium mb-1" style={{ color: "#0f172a" }}>{analysis.summary}</p>
      <p className="text-xs mb-3" style={{ color: "#475569" }}>💡 {analysis.recommendation}</p>

      {/* Confidence bar */}
      <div className="h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: "rgba(186,230,253,0.40)" }}>
        <div className="h-full rounded-full transition-all"
             style={{ width: `${analysis.confidence}%`,
                      background: analysis.statusColor === "green" ? "#22c55e"
                                : analysis.statusColor === "yellow" ? "#eab308"
                                : "#ef4444" }} />
      </div>

      {/* Signals grid */}
      <div className="grid grid-cols-2 gap-2">
        {analysis.signals.map(sig => (
          <div key={sig.label} className="rounded-xl px-3 py-2"
               style={{ background: "rgba(186,230,253,0.20)", border: "1px solid rgba(186,230,253,0.60)" }}>
            <div className="text-xs mb-0.5 font-semibold" style={{ color: "#64748b" }}>{sig.label}</div>
            <div className="text-xs font-bold"
                 style={{ color: sig.sentiment === "positive" ? "#16a34a"
                               : sig.sentiment === "negative" ? "#dc2626"
                               : "#0f172a" }}>
              {sig.sentiment === "positive" ? "▲ " : sig.sentiment === "negative" ? "▼ " : ""}
              {sig.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
