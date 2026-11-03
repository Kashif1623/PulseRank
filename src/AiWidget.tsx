import { useState, useRef, useEffect, useCallback } from "react";
import { useReadContracts, useReadContract } from "wagmi";
import { X, Search, GripVertical } from "lucide-react";
import contractsJson from "./contracts.json";
import { PulseChat } from "./ai/PulseChat";

// ── PulseRank brand avatar (inline SVG, no external asset needed) ─────────────
function PulseAvatar({ size = 32 }: { size?: number }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="aw-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0284c7" />
        </radialGradient>
        <linearGradient id="aw-ring1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="aw-ring2" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#0369a1" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {/* Background circle */}
      <circle cx={r} cy={r} r={r} fill="url(#aw-bg)" />
      {/* Outer ring */}
      <circle cx={r} cy={r} r={r * 0.85} stroke="url(#aw-ring1)" strokeWidth="2" fill="none" />
      {/* Middle ring */}
      <circle cx={r} cy={r} r={r * 0.65} stroke="url(#aw-ring2)" strokeWidth="1.5" fill="none" />
      {/* ECG pulse waveform */}
      <polyline
        points={`${r*0.22},${r} ${r*0.45},${r} ${r*0.55},${r*0.48} ${r*0.65},${r*1.35} ${r*0.75},${r*0.55} ${r*0.85},${r} ${r*1.1},${r} ${r*1.22},${r}`}
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.95"
      />
      {/* Center pulse dot */}
      <circle cx={r} cy={r} r={r * 0.1} fill="white" opacity="0.9" />
    </svg>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const ARC_MAINNET_ID = 5042;
const REGISTRY = contractsJson.contracts.PulseRegistryV2.address as `0x${string}`;
const SCORE    = contractsJson.contracts.PulseScoreV2.address    as `0x${string}`;
const STREAM   = contractsJson.contracts.PulseStreamV2.address   as `0x${string}`;

const MODE_BUFFER: Record<number, number> = { 1: 900, 2: 3600, 3: 10800 };

// ── ABIs ─────────────────────────────────────────────────────────────────────

const REGISTRY_AGENT_ABI = [{
  name: "hasRegistered", type: "function", stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }],
  outputs: [{ type: "bool" }],
}, {
  name: "getAgentsByOwner", type: "function", stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }],
  outputs: [{ name: "", type: "uint256[]" }],
}] as const;

const SCORE_STATS_ABI = [{
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
}] as const;

const STREAM_NEXT_ABI = [{
  name: "nextStreamId", type: "function", stateMutability: "view",
  inputs: [], outputs: [{ type: "uint256" }],
}] as const;

const STREAM_GET_ABI = [{
  name: "getStream", type: "function", stateMutability: "view",
  inputs: [{ name: "streamId", type: "uint256" }],
  outputs: [
    { name: "funder",           type: "address" },
    { name: "agent",            type: "address" },
    { name: "totalAmount",      type: "uint256" },
    { name: "durationSecs",     type: "uint256" },
    { name: "ratePerSecX18",    type: "uint256" },
    { name: "startTime",        type: "uint256" },
    { name: "lastHeartbeat",    type: "uint256" },
    { name: "earnedAmount",     type: "uint256" },
    { name: "pausedAt",         type: "uint256" },
    { name: "pausedDuration",   type: "uint256" },
    { name: "missedHeartbeats", type: "uint256" },
    { name: "lastMissCheckpoint", type: "uint256" },
    { name: "taskId",           type: "uint256" },
    { name: "mode",             type: "uint8"   },
    { name: "status",           type: "uint8"   },
  ],
}] as const;

// ── Theme ─────────────────────────────────────────────────────────────────────

const T = {
  bg:     "#f0f9ff",
  surface:"rgba(255,255,255,0.92)",
  border: "rgba(14,165,233,0.20)",
  accent: "#0284c7",
  ink:    "#0f172a",
  muted:  "#475569",
  subtle: "#94a3b8",
  green:  "#16a34a",
  red:    "#dc2626",
};

// ── Types ─────────────────────────────────────────────────────────────────────

// ── AgentInspector ────────────────────────────────────────────────────────────

function AgentInspector() {
  const [addr, setAddr] = useState("");
  const [query, setQuery] = useState<`0x${string}` | null>(null);

  const isValid = /^0x[0-9a-fA-F]{40}$/.test(addr);

  const { data: nextIdRaw } = useReadContract({
    address: STREAM, abi: STREAM_NEXT_ABI,
    functionName: "nextStreamId", chainId: ARC_MAINNET_ID,
    query: { enabled: true, staleTime: 30_000 },
  });
  const nextId = Number(nextIdRaw ?? 1n);

  // Read registry + score in parallel
  const { data: baseData, isFetching: baseFetching } = useReadContracts({
    contracts: query ? [
      { address: REGISTRY, abi: REGISTRY_AGENT_ABI, functionName: "hasRegistered", args: [query], chainId: ARC_MAINNET_ID },
      { address: SCORE,    abi: SCORE_STATS_ABI,    functionName: "getStats",       args: [query], chainId: ARC_MAINNET_ID },
    ] : [],
    query: { enabled: !!query, staleTime: 20_000 },
  });

  // Read up to 10 most recent streams to find agent's active ones
  const streamCount = Math.min(nextId - 1, 20);
  const streamIds = Array.from({ length: streamCount }, (_, i) => nextId - 1 - i).filter(n => n > 0);
  const { data: streamsRaw, isFetching: streamsFetching } = useReadContracts({
    contracts: streamIds.map(id => ({
      address: STREAM, abi: STREAM_GET_ABI, functionName: "getStream",
      args: [BigInt(id)], chainId: ARC_MAINNET_ID,
    })),
    query: { enabled: !!query && streamCount > 0, staleTime: 20_000 },
  });

  const handleLookup = () => {
    if (isValid) setQuery(addr as `0x${string}`);
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const hasRegistered = baseData?.[0]?.result;
  const statsRaw = baseData?.[1]?.result as readonly unknown[] | undefined;
  const score       = statsRaw ? Number(statsRaw[0]) : null;
  const tier        = statsRaw ? (statsRaw[1] as string) : null;
  const successCount = statsRaw ? Number(statsRaw[2]) : 0;
  const failedCount  = statsRaw ? Number(statsRaw[3]) : 0;
  const totalStreams  = successCount + failedCount;
  const winRate      = totalStreams > 0 ? Math.round((successCount / totalStreams) * 100) : null;

  interface AgentStream {
    streamId: number; lastHeartbeat: number; status: number;
    mode: number; totalAmount: bigint; earnedAmount: bigint;
  }

  const agentStreams: AgentStream[] = (streamsRaw ?? []).flatMap((r, i) => {
    const d = r?.result as readonly unknown[] | undefined;
    if (!d) return [];
    const a = d[1] as string | undefined;
    if (!a || a.toLowerCase() !== query?.toLowerCase()) return [];
    return [{
      streamId:     streamIds[i],
      lastHeartbeat: Number(d[6]),
      status:       Number(d[14]),
      mode:         Number(d[13]),
      totalAmount:  d[2] as bigint,
      earnedAmount: d[7] as bigint,
    }];
  });

  const activeStreams: AgentStream[] = agentStreams.filter(s => s.status === 1);
  const [nowSec] = useState<number>(() => Math.floor(Date.now() / 1000));

  const isAlive: boolean = activeStreams.some((s: AgentStream) => {
    const buf = MODE_BUFFER[s.mode] ?? 3600;
    return nowSec - s.lastHeartbeat < buf;
  });
  const hasActiveStreams = activeStreams.length > 0;

  const totalEarned: bigint = agentStreams.reduce(
    (acc: bigint, s: AgentStream) => acc + s.earnedAmount, 0n
  );
  const fmtUsdc = (v: bigint) => (Number(v) / 1e6).toFixed(2);

  const isLoading = baseFetching || streamsFetching;

  const tierColor: Record<string, string> = {
    Elite: "#7c3aed", Gold: "#d97706", Silver: "#475569", Bronze: "#92400e",
  };

  return (
    <div className="space-y-3">
      {/* Address input */}
      <div className="flex gap-2">
        <input
          value={addr}
          onChange={e => setAddr(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLookup()}
          placeholder="0x... wallet address"
          className="flex-1 text-xs rounded-xl px-3 py-2 outline-none border"
          style={{
            background: "rgba(240,249,255,0.8)",
            border: `1px solid ${T.border}`,
            color: T.ink,
          }}
        />
        <button
          onClick={handleLookup}
          disabled={!isValid}
          className="px-3 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-1 transition-opacity disabled:opacity-40"
          style={{ background: `linear-gradient(135deg,${T.accent},#0ea5e9)` }}
        >
          <Search size={12} /> Lookup
        </button>
      </div>

      {/* Results */}
      {isLoading && (
        <div className="text-center py-4 text-xs" style={{ color: T.subtle }}>
          Fetching on-chain data…
        </div>
      )}

      {query && !isLoading && (
        <div className="rounded-xl p-3 space-y-3 border"
          style={{ background: "rgba(240,249,255,0.7)", borderColor: T.border }}>

          {/* Registration status */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: T.muted }}>REGISTRATION</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${hasRegistered ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {hasRegistered === undefined ? "—" : hasRegistered ? "✅ Registered" : "❌ Not Registered"}
            </span>
          </div>

          {/* Alive/Dead status */}
          {hasRegistered && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: T.muted }}>STATUS</span>
              {!hasActiveStreams ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">⚪ No Active Stream</span>
              ) : isAlive ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">🟢 ONLINE (Active)</span>
              ) : (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">🔴 DEAD / Timed Out</span>
              )}
            </div>
          )}

          {/* Score + Tier */}
          {score !== null && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: T.muted }}>SCORE</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tabular-nums" style={{ color: T.ink }}>{score}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${tierColor[tier ?? ""] ?? T.accent}18`, color: tierColor[tier ?? ""] ?? T.accent }}>
                  {tier}
                </span>
              </div>
            </div>
          )}

          {/* Stats grid */}
          {totalStreams > 0 && (
            <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t" style={{ borderColor: T.border }}>
              <div>
                <div className="text-sm font-bold tabular-nums" style={{ color: T.ink }}>{activeStreams.length}</div>
                <div className="text-xs" style={{ color: T.subtle }}>Active</div>
              </div>
              <div>
                <div className="text-sm font-bold tabular-nums" style={{ color: winRate !== null && winRate >= 50 ? T.green : T.red }}>
                  {winRate !== null ? `${winRate}%` : "—"}
                </div>
                <div className="text-xs" style={{ color: T.subtle }}>Win Rate</div>
              </div>
              <div>
                <div className="text-sm font-bold tabular-nums" style={{ color: T.ink }}>{fmtUsdc(totalEarned)}</div>
                <div className="text-xs" style={{ color: T.subtle }}>Earned</div>
              </div>
            </div>
          )}

          {/* Address */}
          <div className="text-xs mono truncate pt-1 border-t" style={{ borderColor: T.border, color: T.subtle }}>
            {query}
          </div>
        </div>
      )}

      {!query && (
        <div className="text-center py-6 text-xs" style={{ color: T.subtle }}>
          Paste any wallet address to inspect their agent profile, live score, heartbeat status, and earnings.
        </div>
      )}
    </div>
  );
}

// ── AiWidget (main export) ────────────────────────────────────────────────────

export function AiWidget() {
  const [open, setOpen]   = useState(false);
  const [tab, setTab]     = useState<"chat" | "inspector">("chat");

  // Responsive: track whether we're on a mobile-width screen
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Drag state (desktop only — disabled on mobile)
  const [pos, setPos]         = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragging              = useRef(false);
  const dragStart             = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const btnRef            = useRef<HTMLButtonElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    setIsDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
  }, []);

  const defaultRight  = 20;
  const defaultBottom = 96; // above "Built with Arc Studio" badge (~bottom-24)

  return (
    <>
      {/* Floating button */}
      <button
        ref={btnRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => setOpen(o => !o)}
        className="fixed w-14 h-14 rounded-full shadow-2xl flex items-center justify-center select-none"
        style={{
          right:     defaultRight - pos.x,
          bottom:    defaultBottom - pos.y,
          zIndex:    9999,
          background: "linear-gradient(135deg,#0284c7,#0ea5e9,#06b6d4)",
          touchAction: "none",
          cursor: isDragging ? "grabbing" : "grab",
          boxShadow: "0 0 0 4px rgba(14,165,233,0.25), 0 8px 30px rgba(2,132,199,0.50)",
        }}
        aria-label="Open AI assistant"
      >
        {/* Glowing pulse ring */}
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: "rgba(14,165,233,0.35)", animationDuration: "2s" }}
        />
        <PulseAvatar size={38} />
        {/* Live status dot */}
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white" />
      </button>

      {/* Modal */}
      {open && (
        <>
          {/* Mobile backdrop */}
          {isMobile && (
            <div
              className="fixed inset-0"
              style={{ zIndex: 9998, background: "rgba(0,0,0,0.40)", backdropFilter: "blur(4px)" }}
              onClick={() => setOpen(false)}
            />
          )}
          <div
            className="fixed rounded-2xl shadow-2xl flex flex-col"
            style={isMobile ? {
              // Mobile: centered horizontally, anchored near bottom above button
              left: "50%",
              bottom: defaultBottom + 64,
              transform: "translateX(-50%)",
              width: "calc(100vw - 32px)",
              maxWidth: 400,
              maxHeight: "70vh",
              zIndex: 9999,
              background: T.surface,
              border: `1px solid ${T.border}`,
              backdropFilter: "blur(20px)",
            } : {
              // Desktop: bottom-right above button
              right:  defaultRight - pos.x + 64,
              bottom: defaultBottom - pos.y,
              zIndex: 9999,
              width:  360,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "80vh",
              background: T.surface,
              border: `1px solid ${T.border}`,
              backdropFilter: "blur(20px)",
            }}
          >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: T.border }}>
            <div className="flex items-center gap-2">
              <PulseAvatar size={28} />
              <span className="text-sm font-bold" style={{ color: T.ink }}>PulseRank AI</span>
            </div>
            <div className="flex items-center gap-2">
              <GripVertical size={14} style={{ color: T.subtle, cursor: "grab" }} />
              <button onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-sky-100 transition-colors">
                <X size={14} style={{ color: T.muted }} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: T.border }}>
            {(["chat", "inspector"] as const).map(t => (
              <button key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2 text-xs font-semibold transition-colors"
                style={{
                  color: tab === t ? T.accent : T.subtle,
                  borderBottom: tab === t ? `2px solid ${T.accent}` : "2px solid transparent",
                  background: "transparent",
                }}>
                {t === "chat" ? "⚡ Web3 Assistant" : "🔍 Agent Inspector"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "chat"      && <PulseChat onNavigate={() => { if (isMobile) setOpen(false); }} />}
            {tab === "inspector" && <AgentInspector />}
          </div>
          </div>
        </>
      )}
    </>
  );
}
