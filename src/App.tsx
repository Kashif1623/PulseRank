import { useState, useEffect } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ConnectKitButton } from "connectkit";
import {
  Trophy, Zap, User, Globe, ChevronDown,
  ExternalLink, TrendingUp, Clock, Shield, Activity,
} from "lucide-react";
import contractsJson from "./contracts.json";

// ── Chain / contract constants ────────────────────────────────────────────────

const ARC_MAINNET_ID = 5042;

const CONTRACTS = {
  registry: contractsJson.contracts.PulseRegistryV2.address as `0x${string}`,
  score:    contractsJson.contracts.PulseScoreV2.address    as `0x${string}`,
  stream:   contractsJson.contracts.PulseStreamV2.address   as `0x${string}`,
} as const;

// Minimal ABIs — only what we read
const REGISTRY_ABI = [
  { name: "agentCount",  type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "nextStreamId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    name: "agents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "name",         type: "bytes32" },
      { name: "profileURI",   type: "string" },
      { name: "minDailyRate", type: "uint256" },
      { name: "registeredAt", type: "uint256" },
      { name: "active",       type: "bool" },
      { name: "owner",        type: "address" },
    ],
  },
] as const;

const SCORE_ABI = [
  {
    name: "getStats",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "score",                type: "uint256" },
      { name: "tier",                 type: "string" },
      { name: "successCount",         type: "uint256" },
      { name: "failedCount",          type: "uint256" },
      { name: "disputesAgainstCount", type: "uint256" },
      { name: "disputesWonCount",     type: "uint256" },
    ],
  },
] as const;

const STREAM_ABI = [
  { name: "nextStreamId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab  = "leaderboard" | "funder" | "agent";
type Lang = "EN" | "ZH" | "ES";

interface AgentRow {
  agentId:  number;
  name:     string;
  owner:    string;
  score:    number;
  tier:     string;
  success:  number;
  failed:   number;
}

const TIER_COLOR: Record<string, string> = {
  Elite:  "text-yellow-400",
  Gold:   "text-amber-400",
  Silver: "text-slate-300",
  Bronze: "text-orange-400",
};
const TIER_BG: Record<string, string> = {
  Elite:  "rgba(250,204,21,0.12)",
  Gold:   "rgba(251,191,36,0.10)",
  Silver: "rgba(203,213,225,0.10)",
  Bronze: "rgba(251,146,60,0.10)",
};

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "leaderboard", label: "Leaderboard", icon: <Trophy size={13} /> },
  { id: "funder",      label: "Funder",      icon: <Zap size={13} /> },
  { id: "agent",       label: "Agent",       icon: <User size={13} /> },
];

// ── SVG PulseRank logo mark ───────────────────────────────────────────────────
// Concentric dark circles + cyan/green ECG waveform + circuit nodes

function PulseLogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer ring */}
      <circle cx="32" cy="32" r="30" stroke="url(#ringOuter)" strokeWidth="2" fill="rgba(11,15,23,0.9)" />
      {/* Mid ring */}
      <circle cx="32" cy="32" r="22" stroke="url(#ringMid)" strokeWidth="1.5" fill="transparent" opacity="0.7" />
      {/* Inner ring */}
      <circle cx="32" cy="32" r="14" stroke="url(#ringInner)" strokeWidth="1" fill="transparent" opacity="0.5" />
      {/* ECG waveform path */}
      <path
        d="M8 32 L18 32 L21 24 L25 40 L29 26 L33 38 L36 29 L40 35 L44 32 L56 32"
        stroke="url(#wave)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
      {/* Circuit nodes */}
      <circle cx="21" cy="24" r="1.8" fill="#4ade80" opacity="0.9" />
      <circle cx="29" cy="26" r="1.5" fill="#60a5fa" opacity="0.9" />
      <circle cx="36" cy="29" r="1.5" fill="#38bdf8" opacity="0.9" />
      <circle cx="44" cy="32" r="1.8" fill="#4ade80" opacity="0.9" />
      {/* Gradient defs */}
      <defs>
        <linearGradient id="ringOuter" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id="ringMid" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="ringInner" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="wave" x1="8" y1="32" x2="56" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#4ade80" />
          <stop offset="50%"  stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Splash screen ─────────────────────────────────────────────────────────────

function SplashScreen({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#0B0F17",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 24,
        transition: "opacity 0.6s ease, visibility 0.6s ease",
        opacity: visible ? 1 : 0,
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Glow ring behind logo */}
      <div style={{
        position: "relative",
        width: 120, height: 120,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          position: "absolute", inset: -16,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(56,189,248,0.18) 0%, transparent 70%)",
          animation: "pulse-glow 2s ease-in-out infinite",
        }} />
        <PulseLogoMark size={112} />
      </div>

      {/* Wordmark */}
      <div style={{ textAlign: "center" }}>
        <div className="display" style={{
          fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em",
          background: "linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          PulseRank
        </div>
        <div style={{
          marginTop: 4, fontSize: 11, fontWeight: 600, letterSpacing: "0.18em",
          color: "#38bdf8", textTransform: "uppercase",
        }}>
          Agent Protocol
        </div>
      </div>

      {/* Animated progress bar */}
      <div style={{
        width: 200, height: 3, borderRadius: 4,
        background: "rgba(255,255,255,0.08)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 4,
          background: "linear-gradient(90deg, #4ade80, #38bdf8, #4ade80)",
          backgroundSize: "200% 100%",
          animation: "progress-sweep 1.6s ease-in-out infinite",
        }} />
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50%       { transform: scale(1.12); opacity: 1; }
        }
        @keyframes progress-sweep {
          0%   { width: 0%; backgroundPosition: 0% 50%; }
          60%  { width: 100%; }
          100% { width: 100%; backgroundPosition: 200% 50%; }
        }
      `}</style>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function PulseLogo() {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <PulseLogoMark size={30} />
      <span className="display font-bold text-white text-base tracking-tight hidden sm:block">
        PulseRank
      </span>
    </div>
  );
}

function LangSelector({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const langs: Lang[] = ["EN", "ZH", "ES"];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{ color: "#94A3B8", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        <Globe size={11} />
        <span>{lang}</span>
        <ChevronDown size={9} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-2xl"
             style={{ background: "#141c2e", border: "1px solid rgba(255,255,255,0.12)", minWidth: 68 }}>
          {langs.map(l => (
            <button key={l} onClick={() => { setLang(l); setOpen(false); }}
              className={`w-full px-3 py-2 text-xs font-medium text-left hover:bg-white/10 transition-colors
                ${l === lang ? "text-blue-400" : "text-slate-300"}`}>
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TabBar({ active, setActive }: { active: Tab; setActive: (t: Tab) => void }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-xl"
         style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setActive(t.id)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
            ${active === t.id ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
          style={active === t.id
            ? { background: "linear-gradient(135deg,rgba(96,165,250,.22) 0%,rgba(56,189,248,.14) 100%)",
                border: "1px solid rgba(96,165,250,.35)" }
            : { border: "1px solid transparent" }}>
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Leaderboard panel ─────────────────────────────────────────────────────────

function LeaderboardPanel() {
  // Fetch total agent count
  const { data: agentCountRaw, isLoading: countLoading } = useReadContract({
    address: CONTRACTS.registry,
    abi: REGISTRY_ABI,
    functionName: "agentCount",
    chainId: ARC_MAINNET_ID,
  });

  // Fetch total streams
  const { data: nextStreamIdRaw } = useReadContract({
    address: CONTRACTS.stream,
    abi: STREAM_ABI,
    functionName: "nextStreamId",
    chainId: ARC_MAINNET_ID,
  });

  const agentCount  = agentCountRaw  !== undefined ? Number(agentCountRaw)  : 0;
  const streamCount = nextStreamIdRaw !== undefined ? Math.max(0, Number(nextStreamIdRaw) - 1) : 0;

  // Fetch first N agent profiles (up to 20)
  const MAX_FETCH = Math.min(agentCount, 20);
  const agentCalls = Array.from({ length: MAX_FETCH }, (_, i) => ({
    address: CONTRACTS.registry,
    abi: REGISTRY_ABI,
    functionName: "agents" as const,
    args: [BigInt(i + 1)] as [bigint],
    chainId: ARC_MAINNET_ID,
  }));

  const { data: agentProfiles, isLoading: profilesLoading } = useReadContracts({
    contracts: agentCalls,
    query: { enabled: MAX_FETCH > 0 },
  });

  // Fetch scores for those agents
  const ownerAddresses: `0x${string}`[] = (agentProfiles ?? [])
    .map(r => {
      if (r.status !== "success" || !r.result) return null;
      const t = r.result;
      return t[5]; // owner is index 5
    })
    .filter((a): a is `0x${string}` => !!a);

  const scoreCalls = ownerAddresses.map(addr => ({
    address: CONTRACTS.score,
    abi: SCORE_ABI,
    functionName: "getStats" as const,
    args: [addr] as [`0x${string}`],
    chainId: ARC_MAINNET_ID,
  }));

  const { data: scoreResults, isLoading: scoresLoading } = useReadContracts({
    contracts: scoreCalls,
    query: { enabled: ownerAddresses.length > 0 },
  });

  // Assemble rows
  const rows: AgentRow[] = [];
  if (agentProfiles && scoreResults) {
    for (let i = 0; i < agentProfiles.length; i++) {
      const p = agentProfiles[i];
      const s = scoreResults[i];
      if (p?.status !== "success" || !p.result) continue;
      // Tuple result: [name, profileURI, minDailyRate, registeredAt, active, owner]
      const tuple = p.result;
      const [nameBytes, , , , active, owner] = tuple;
      if (!active) continue;
      const nameHex = nameBytes as string;
      const nameStr = nameHex && nameHex !== "0x" + "0".repeat(64)
        ? Buffer.from(nameHex.slice(2).replace(/^(00)*/, ""), "hex")
            .toString("utf8")
            .replace(/\0/g, "")
            .trim() || `Agent #${i + 1}`
        : `Agent #${i + 1}`;

      let score = 0; let tier = "Bronze"; let success = 0; let failed = 0;
      if (s?.status === "success" && s.result) {
        const sr = s.result;
        // tuple: [score, tier, successCount, failedCount, disputesAgainst, disputesWon]
        const [scoreVal, tierVal, successVal, failedVal] = sr;
        score   = Number(scoreVal);
        tier    = tierVal;
        success = Number(successVal);
        failed  = Number(failedVal);
      }
      rows.push({ agentId: i + 1, name: nameStr, owner, score, tier, success, failed });
    }
    rows.sort((a, b) => b.score - a.score);
  }

  const isLoading = countLoading || profilesLoading || scoresLoading;
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: "Agents",   value: countLoading ? "—" : agentCount.toLocaleString(),  icon: <User      size={13} className="text-blue-400" /> },
          { label: "Streams",  value: streamCount > 0 ? streamCount.toLocaleString() : "0",                  icon: <Zap       size={13} className="text-cyan-400" /> },
          { label: "Protocol", value: "Arc",                                                                  icon: <Activity  size={13} className="text-green-400" /> },
        ].map(s => (
          <div key={s.label} className="glass rounded-2xl p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              {s.icon}
              <span className="text-xs text-slate-400 uppercase tracking-widest font-medium truncate">{s.label}</span>
            </div>
            <div className="display text-base sm:text-2xl font-bold text-white tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="grid items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider"
               style={{ gridTemplateColumns: "1.5rem minmax(0,1fr) 4rem 4rem" }}>
            <span>#</span><span>Agent</span><span>Score</span><span>Rate</span>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            <TrendingUp size={18} className="mx-auto mb-2 opacity-40 animate-pulse" />
            Loading on-chain data…
          </div>
        )}

        {/* Empty state */}
        {!isLoading && rows.length === 0 && (
          <div className="px-4 py-10 text-center">
            <Shield size={28} className="mx-auto mb-3 text-slate-600" />
            <p className="text-sm font-semibold text-slate-400 mb-1">No agents registered yet</p>
            <p className="text-xs text-slate-600">Be the first to register and top the leaderboard.</p>
          </div>
        )}

        {/* Rows */}
        <div className="overflow-x-auto">
          {rows.map((a, i) => (
            <div key={a.agentId}
              className="grid items-center gap-2 px-4 py-3 transition-colors hover:bg-white/[0.03]"
              style={{
                gridTemplateColumns: "1.5rem minmax(0,1fr) 4rem 4rem",
                borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : undefined,
              }}>
              {/* Rank */}
              <span className={`mono text-xs font-bold tabular-nums
                ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-500" : "text-slate-500"}`}>
                {i + 1}
              </span>
              {/* Agent name + avatar */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                     style={{ background: TIER_BG[a.tier] ?? "rgba(96,165,250,0.12)", color: "#60a5fa" }}>
                  {a.name[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white truncate">{a.name}</div>
                  <div className="mono text-xs text-slate-500 truncate">{short(a.owner)}</div>
                </div>
                <span className={`text-xs font-bold shrink-0 ml-1 ${TIER_COLOR[a.tier] ?? "text-slate-400"}`}>
                  {a.tier}
                </span>
              </div>
              {/* Score */}
              <span className="mono text-sm font-bold text-white tabular-nums">{a.score}</span>
              {/* Success rate */}
              <span className="mono text-xs tabular-nums text-green-400">
                {a.success + a.failed > 0
                  ? `${((a.success / (a.success + a.failed)) * 100).toFixed(0)}%`
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Funder panel ──────────────────────────────────────────────────────────────

// Duration presets in days (0 = Custom)
const DURATION_PRESETS = [
  { label: "1 Day",  days: 1 },
  { label: "3 Days", days: 3 },
  { label: "5 Days", days: 5 },
  { label: "7 Days", days: 7 },
  { label: "Custom", days: 0 },
] as const;

function FunderPanel() {
  const [selectedMode, setSelectedMode] = useState<1 | 2 | 3>(2);
  // Duration state: selectedPreset = days (0 = custom), customDays = raw input string
  const [selectedPreset, setSelectedPreset] = useState<number>(1); // default 1 day
  const [customDays, setCustomDays]         = useState<string>("");
  const isCustom = selectedPreset === 0;
  const activeDays = isCustom ? (parseFloat(customDays) || 0) : selectedPreset;
  const durationSecs = Math.round(activeDays * 86400);

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 sm:p-6">
        <h2 className="display text-lg font-bold text-white mb-1">Create a Stream</h2>
        <p className="text-sm mb-5" style={{ color: "#94A3B8" }}>Escrow USDC and stream it to an agent over time.</p>
        <div className="space-y-3">
          {[
            { label: "Agent Address", placeholder: "0x…" },
            { label: "Total Amount (USDC)", placeholder: "e.g. 100.00" },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#94A3B8" }}>
                {f.label}
              </label>
              <input className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
                placeholder={f.placeholder} />
            </div>
          ))}

          {/* Duration picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#94A3B8" }}>
              Stream Duration
            </label>
            {/* Preset buttons */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DURATION_PRESETS.map(p => {
                const active = p.days === 0 ? isCustom : selectedPreset === p.days;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setSelectedPreset(p.days); if (p.days !== 0) setCustomDays(""); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: active ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.05)",
                      border:     active ? "1px solid rgba(96,165,250,0.45)" : "1px solid rgba(255,255,255,0.10)",
                      color:      active ? "#93c5fd" : "#94a3b8",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {/* Custom days input — only shown when Custom is selected */}
            {isCustom && (
              <input
                type="number"
                min="0.01"
                step="0.5"
                value={customDays}
                onChange={e => setCustomDays(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none mb-2"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
                placeholder="Enter number of days (e.g. 2.5)"
              />
            )}
            {/* Helper text: seconds conversion */}
            {activeDays > 0 && (
              <p className="text-xs mono mt-1" style={{ color: "#38bdf8" }}>
                {activeDays === 1 ? "1 Day" : `${activeDays} Days`}
                {" = "}
                <span className="font-semibold text-white">{durationSecs.toLocaleString()} seconds</span>
                {" on-chain"}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#94A3B8" }}>
              Heartbeat Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 1 as const, label: "Strict",  sub: "5 min / 10 min" },
                { id: 2 as const, label: "Normal",  sub: "30 min / 30 min" },
                { id: 3 as const, label: "Relaxed", sub: "1 hr / 2 hr" },
              ] as const).map(m => (
                <button key={m.id} onClick={() => setSelectedMode(m.id)}
                  className="rounded-xl px-3 py-2.5 text-left transition-all"
                  style={{
                    background: selectedMode === m.id ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.05)",
                    border: selectedMode === m.id ? "1px solid rgba(96,165,250,0.40)" : "1px solid rgba(255,255,255,0.10)",
                  }}>
                  <div className={`text-sm font-semibold ${selectedMode === m.id ? "text-blue-300" : "text-white"}`}>{m.label}</div>
                  <div className="text-xs mt-0.5 text-slate-500">{m.sub}</div>
                </button>
              ))}
            </div>
          </div>
          <button className="w-full rounded-xl py-3.5 text-sm font-bold transition-all hover:brightness-110 active:scale-[0.98] mt-1"
            style={{ background: "linear-gradient(135deg,#60a5fa 0%,#38bdf8 100%)", color: "#0B0F17" }}>
            Propose Stream
          </button>
        </div>
      </div>
      <div className="glass rounded-2xl p-5">
        <h3 className="display text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Clock size={13} className="text-blue-400" /> Your Active Streams
        </h3>
        <div className="text-sm text-center py-6" style={{ color: "#64748b" }}>
          Connect your wallet to view active streams.
        </div>
      </div>
    </div>
  );
}

// ── Agent panel ───────────────────────────────────────────────────────────────

function AgentPanel() {
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 sm:p-6">
        <h2 className="display text-lg font-bold text-white mb-1">Register as Agent</h2>
        <p className="text-sm mb-5" style={{ color: "#94A3B8" }}>Create your on-chain identity and start earning.</p>
        <div className="space-y-3">
          {[
            { label: "Agent Name", placeholder: "e.g. ArcMind" },
            { label: "Profile URI", placeholder: "https://…" },
            { label: "Min Daily Rate (USDC)", placeholder: "e.g. 10.00" },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#94A3B8" }}>
                {f.label}
              </label>
              <input className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
                placeholder={f.placeholder} />
            </div>
          ))}
          <button className="w-full rounded-xl py-3.5 text-sm font-bold transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg,#60a5fa 0%,#38bdf8 100%)", color: "#0B0F17" }}>
            Register Agent
          </button>
        </div>
      </div>
      <div className="glass rounded-2xl p-5">
        <h3 className="display text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Shield size={13} className="text-cyan-400" /> Reputation Score
        </h3>
        <div className="text-sm text-center py-6" style={{ color: "#64748b" }}>
          Connect your wallet to view your score and tier.
        </div>
      </div>
      <div className="glass rounded-2xl p-5">
        <h3 className="display text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Zap size={13} className="text-blue-400" /> Incoming Streams
        </h3>
        <div className="text-sm text-center py-6" style={{ color: "#64748b" }}>
          Connect your wallet to view and accept streams.
        </div>
      </div>
    </div>
  );
}

// ── Contract addresses bar ────────────────────────────────────────────────────

function ContractBar() {
  const entries = [
    { label: "Registry", addr: CONTRACTS.registry },
    { label: "Score",    addr: contractsJson.contracts.PulseScoreV2.address },
    { label: "Task",     addr: contractsJson.contracts.PulseTaskV2.address },
    { label: "Stream",   addr: CONTRACTS.stream },
  ];
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 px-4 py-3"
         style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      {entries.map(e => (
        <a key={e.label} href={`https://explorer.arc.io/address/${e.addr}`}
           target="_blank" rel="noopener noreferrer"
           className="flex items-center gap-1 text-xs transition-colors"
           style={{ color: "#475569" }}
           onMouseEnter={ev => (ev.currentTarget.style.color = "#94a3b8")}
           onMouseLeave={ev => (ev.currentTarget.style.color = "#475569")}>
          <span style={{ color: "#334155" }}>{e.label}:</span>
          <span className="mono">{short(e.addr)}</span>
          <ExternalLink size={9} />
        </a>
      ))}
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,     setTab]     = useState<Tab>("leaderboard");
  const [lang,    setLang]    = useState<Lang>("EN");
  const [splash,  setSplash]  = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 2200);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <SplashScreen visible={splash} />

      <div className="min-h-dvh flex flex-col" style={{ background: "var(--bg)" }}>

        {/* Fixed top header */}
        <header className="sticky top-0 z-40 w-full"
          style={{
            background: "rgba(11,15,23,0.88)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 max-w-4xl mx-auto w-full">
            <PulseLogo />
            <div className="flex items-center gap-2 shrink-0">
              <LangSelector lang={lang} setLang={setLang} />
              {/* ConnectKit wallet button */}
              <ConnectKitButton.Custom>
                {({ isConnected, show, address }) => (
                  <button onClick={show}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:brightness-110 active:scale-95 shrink-0"
                    style={{ background: "linear-gradient(135deg,#60a5fa 0%,#38bdf8 100%)", color: "#0B0F17" }}>
                    {isConnected && address
                      ? <><span className="hidden sm:inline">{address.slice(0,6)}…{address.slice(-4)}</span><span className="sm:hidden">●</span></>
                      : <><span className="hidden sm:inline">Connect Wallet</span><span className="sm:hidden">Connect</span></>}
                  </button>
                )}
              </ConnectKitButton.Custom>
            </div>
          </div>
          {/* Tab bar — always in header, all screen sizes */}
          <div className="flex items-center justify-center px-4 pb-2.5 max-w-4xl mx-auto w-full">
            <TabBar active={tab} setActive={setTab} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-5 max-w-4xl mx-auto w-full">
          {tab === "leaderboard" && <LeaderboardPanel />}
          {tab === "funder"      && <FunderPanel />}
          {tab === "agent"       && <AgentPanel />}
        </main>

        {/* Contract addresses */}
        <ContractBar />

        {/* Arc Studio watermark row — consistent on mobile */}
        <div className="flex justify-center pb-5 pt-1">
          <a href="https://studio.arc.io" target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 text-xs transition-colors"
             style={{ color: "#334155" }}
             onMouseEnter={ev => (ev.currentTarget.style.color = "#64748b")}
             onMouseLeave={ev => (ev.currentTarget.style.color = "#334155")}>
            <PulseLogoMark size={13} />
            Built with Arc Studio
          </a>
        </div>

      </div>
    </>
  );
}
