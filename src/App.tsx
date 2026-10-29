import { useState, useEffect } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ConnectKitButton } from "connectkit";
import {
  Trophy, Zap, User, Globe, ChevronDown,
  ExternalLink, TrendingUp, Clock, Shield, Activity, Wallet,
} from "lucide-react";
import contractsJson from "./contracts.json";

// ── Chain / contract constants ─────────────────────────────────────────────────

const ARC_MAINNET_ID = 5042;

const CONTRACTS = {
  registry: contractsJson.contracts.PulseRegistryV2.address as `0x${string}`,
  score:    contractsJson.contracts.PulseScoreV2.address    as `0x${string}`,
  stream:   contractsJson.contracts.PulseStreamV2.address   as `0x${string}`,
} as const;

// Minimal ABIs
const REGISTRY_ABI = [
  { name: "agentCount",  type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    name: "agents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "name",         type: "bytes32" },
      { name: "profileURI",   type: "string"  },
      { name: "minDailyRate", type: "uint256" },
      { name: "registeredAt", type: "uint256" },
      { name: "active",       type: "bool"    },
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
      { name: "tier",                 type: "string"  },
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

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab  = "leaderboard" | "funder" | "agent";
type Lang = "EN" | "ZH" | "ES";

interface AgentRow {
  agentId: number;
  name:    string;
  owner:   string;
  score:   number;
  tier:    string;
  success: number;
  failed:  number;
}

// ── Theme tokens (light blue) ──────────────────────────────────────────────────

const T = {
  accent:       "#0284c7",
  accentMid:    "#0ea5e9",
  accentLight:  "#06b6d4",
  accentGrad:   "linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)",
  accentGradHov:"linear-gradient(135deg, #0369a1 0%, #0891b2 100%)",
  ink:          "#0f172a",
  ink2:         "#1e293b",
  muted:        "#334155",
  subtle:       "#64748b",
  placeholder:  "#94a3b8",
  border:       "rgba(186,230,253,0.80)",
  borderStrong: "rgba(125,211,252,0.90)",
  surface:      "rgba(255,255,255,0.70)",
  surfaceHover: "rgba(255,255,255,0.85)",
  headerBg:     "rgba(240,249,255,0.88)",
};

const TIER_COLOR: Record<string, string> = {
  Elite:  "#b45309",   // amber-700
  Gold:   "#d97706",   // amber-600
  Silver: "#475569",   // slate-600
  Bronze: "#c2410c",   // orange-700
};
const TIER_BG: Record<string, string> = {
  Elite:  "rgba(251,191,36,0.15)",
  Gold:   "rgba(251,191,36,0.10)",
  Silver: "rgba(148,163,184,0.12)",
  Bronze: "rgba(251,146,60,0.12)",
};

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "leaderboard", label: "Leaderboard", icon: <Trophy  size={13} /> },
  { id: "funder",      label: "Funder",      icon: <Zap     size={13} /> },
  { id: "agent",       label: "Agent",       icon: <User    size={13} /> },
];

// ── SVG PulseRank logo mark (light-theme version) ──────────────────────────────

function PulseLogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" stroke="url(#lRingOuter)" strokeWidth="2.5" fill="rgba(224,242,254,0.9)" />
      <circle cx="32" cy="32" r="22" stroke="url(#lRingMid)"   strokeWidth="1.5" fill="transparent" opacity="0.7" />
      <circle cx="32" cy="32" r="14" stroke="url(#lRingInner)" strokeWidth="1"   fill="transparent" opacity="0.5" />
      <path
        d="M8 32 L18 32 L21 24 L25 40 L29 26 L33 38 L36 29 L40 35 L44 32 L56 32"
        stroke="url(#lWave)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
      <circle cx="21" cy="24" r="1.8" fill="#0891b2" opacity="0.9" />
      <circle cx="29" cy="26" r="1.5" fill="#0284c7" opacity="0.9" />
      <circle cx="36" cy="29" r="1.5" fill="#06b6d4" opacity="0.9" />
      <circle cx="44" cy="32" r="1.8" fill="#0891b2" opacity="0.9" />
      <defs>
        <linearGradient id="lRingOuter" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0284c7" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id="lRingMid" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0ea5e9" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="lRingInner" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0891b2" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="lWave" x1="8" y1="32" x2="56" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0284c7" />
          <stop offset="50%"  stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Splash screen ──────────────────────────────────────────────────────────────

function SplashScreen({ visible }: { visible: boolean }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(135deg,#e0f2fe 0%,#f0f9ff 50%,#cffafe 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 24,
      transition: "opacity 0.6s ease, visibility 0.6s ease",
      opacity: visible ? 1 : 0,
      visibility: visible ? "visible" : "hidden",
      pointerEvents: visible ? "auto" : "none",
    }}>
      <div style={{ position: "relative", width: 120, height: 120,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          position: "absolute", inset: -16, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(14,165,233,0.22) 0%, transparent 70%)",
          animation: "pulse-glow 2s ease-in-out infinite",
        }} />
        <PulseLogoMark size={112} />
      </div>

      <div style={{ textAlign: "center" }}>
        <div className="display" style={{
          fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em",
          background: "linear-gradient(135deg,#0284c7 0%,#06b6d4 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
        }}>
          PulseRank
        </div>
        <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, letterSpacing: "0.18em",
                      color: "#0284c7", textTransform: "uppercase" }}>
          Agent Protocol
        </div>
      </div>

      <div style={{ width: 200, height: 3, borderRadius: 4,
                    background: "rgba(14,165,233,0.15)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 4,
          background: "linear-gradient(90deg,#0284c7,#06b6d4,#0284c7)",
          backgroundSize: "200% 100%",
          animation: "progress-sweep 1.6s ease-in-out infinite",
        }} />
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%,100% { transform:scale(1);    opacity:0.5; }
          50%      { transform:scale(1.12); opacity:1;   }
        }
        @keyframes progress-sweep {
          0%   { width:0%;   background-position:0%   50%; }
          60%  { width:100%; }
          100% { width:100%; background-position:200% 50%; }
        }
      `}</style>
    </div>
  );
}

// ── Small components ───────────────────────────────────────────────────────────

function PulseLogo() {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <PulseLogoMark size={30} />
      <span className="display font-bold text-base tracking-tight hidden sm:block"
            style={{ color: T.ink }}>
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
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{ color: T.subtle, border: `1px solid ${T.border}`, background: T.surface }}>
        <Globe size={11} />
        <span>{lang}</span>
        <ChevronDown size={9} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-lg"
             style={{ background: "rgba(240,249,255,0.97)", border: `1px solid ${T.borderStrong}`, minWidth: 68 }}>
          {langs.map(l => (
            <button key={l} onClick={() => { setLang(l); setOpen(false); }}
              className="w-full px-3 py-2 text-xs font-medium text-left transition-colors"
              style={{ color: l === lang ? T.accent : T.muted,
                       background: l === lang ? "rgba(14,165,233,0.08)" : "transparent" }}>
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
         style={{ background: "rgba(186,230,253,0.35)", border: `1px solid ${T.border}` }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setActive(t.id)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
          style={active === t.id
            ? { background: T.accentGrad, color: "#fff",
                boxShadow: "0 2px 8px rgba(2,132,199,0.35)" }
            : { color: T.subtle, border: "1px solid transparent" }}>
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Shared input style ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.80)",
  border: `1px solid ${T.border}`,
  color: T.ink,
};

const inputCls = "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-sky-300/60 placeholder-slate-400";

// ── Leaderboard panel ──────────────────────────────────────────────────────────

function LeaderboardPanel({ setTab }: { setTab: (t: Tab) => void }) {
  const { data: agentCountRaw, isLoading: countLoading } = useReadContract({
    address: CONTRACTS.registry, abi: REGISTRY_ABI,
    functionName: "agentCount", chainId: ARC_MAINNET_ID,
  });
  const { data: nextStreamIdRaw } = useReadContract({
    address: CONTRACTS.stream, abi: STREAM_ABI,
    functionName: "nextStreamId", chainId: ARC_MAINNET_ID,
  });

  const agentCount  = agentCountRaw  !== undefined ? Number(agentCountRaw)  : 0;
  const streamCount = nextStreamIdRaw !== undefined ? Math.max(0, Number(nextStreamIdRaw) - 1) : 0;

  const MAX_FETCH = Math.min(agentCount, 20);
  const agentCalls = Array.from({ length: MAX_FETCH }, (_, i) => ({
    address: CONTRACTS.registry, abi: REGISTRY_ABI,
    functionName: "agents" as const,
    args: [BigInt(i + 1)] as [bigint], chainId: ARC_MAINNET_ID,
  }));

  const { data: agentProfiles, isLoading: profilesLoading } = useReadContracts({
    contracts: agentCalls, query: { enabled: MAX_FETCH > 0 },
  });

  const ownerAddresses: `0x${string}`[] = (agentProfiles ?? [])
    .map(r => {
      if (r.status !== "success" || !r.result) return null;
      const t = r.result;
      return t[5];
    })
    .filter((a): a is `0x${string}` => !!a);

  const scoreCalls = ownerAddresses.map(addr => ({
    address: CONTRACTS.score, abi: SCORE_ABI,
    functionName: "getStats" as const,
    args: [addr] as [`0x${string}`], chainId: ARC_MAINNET_ID,
  }));

  const { data: scoreResults, isLoading: scoresLoading } = useReadContracts({
    contracts: scoreCalls, query: { enabled: ownerAddresses.length > 0 },
  });

  const rows: AgentRow[] = [];
  if (agentProfiles && scoreResults) {
    for (let i = 0; i < agentProfiles.length; i++) {
      const p = agentProfiles[i];
      const s = scoreResults[i];
      if (p?.status !== "success" || !p.result) continue;
      const tuple = p.result;
      const [nameBytes, , , , active, owner] = tuple;
      if (!active) continue;
      const nameHex = nameBytes as string;
      const nameStr = nameHex && nameHex !== "0x" + "0".repeat(64)
        ? Buffer.from(nameHex.slice(2).replace(/^(00)*/, ""), "hex")
            .toString("utf8").replace(/\0/g, "").trim() || `Agent #${i + 1}`
        : `Agent #${i + 1}`;
      let score = 0; let tier = "Bronze"; let success = 0; let failed = 0;
      if (s?.status === "success" && s.result) {
        const sr = s.result;
        const [scoreVal, tierVal, successVal, failedVal] = sr;
        score = Number(scoreVal); tier = tierVal;
        success = Number(successVal); failed = Number(failedVal);
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
          { label: "Agents",   value: countLoading ? "—" : agentCount.toLocaleString(), icon: <User     size={13} style={{ color: T.accent }} /> },
          { label: "Streams",  value: streamCount > 0 ? streamCount.toLocaleString() : "0",            icon: <Zap      size={13} style={{ color: T.accentLight }} /> },
          { label: "Protocol", value: "Arc",                                                            icon: <Activity size={13} style={{ color: T.accentMid  }} /> },
        ].map(s => (
          <div key={s.label} className="glass rounded-2xl p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              {s.icon}
              <span className="text-xs uppercase tracking-widest font-medium truncate" style={{ color: T.subtle }}>{s.label}</span>
            </div>
            <div className="display text-base sm:text-2xl font-bold tabular-nums" style={{ color: T.ink }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ borderColor: T.border }}>
          <div className="grid items-center gap-2 text-xs font-semibold uppercase tracking-wider"
               style={{ gridTemplateColumns: "1.5rem minmax(0,1fr) 4rem 4rem", color: T.subtle }}>
            <span>#</span><span>Agent</span><span>Score</span><span>Rate</span>
          </div>
        </div>

        {isLoading && (
          <div className="px-4 py-8 text-center text-sm" style={{ color: T.subtle }}>
            <TrendingUp size={18} className="mx-auto mb-2 animate-pulse" style={{ color: T.accent, opacity: 0.6 }} />
            Loading on-chain data…
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="px-4 py-10 flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div style={{
                position: "absolute", inset: -10, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(14,165,233,0.20) 0%, transparent 70%)",
              }} />
              <Shield size={36} style={{ color: T.accentLight, filter: "drop-shadow(0 0 8px rgba(6,182,212,0.55))" }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: T.ink }}>No agents registered yet</p>
            <p className="text-xs mb-5" style={{ color: T.subtle }}>Be the first to register and top the leaderboard.</p>
            <button onClick={() => setTab("agent")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:brightness-105 active:scale-[0.97]"
              style={{ background: T.accentGrad, color: "#fff",
                       boxShadow: "0 4px 14px rgba(2,132,199,0.30)" }}>
              <User size={14} /> Register Agent Now
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          {rows.map((a, i) => (
            <div key={a.agentId}
              className="grid items-center gap-2 px-4 py-3 transition-colors"
              style={{
                gridTemplateColumns: "1.5rem minmax(0,1fr) 4rem 4rem",
                borderBottom: i < rows.length - 1 ? `1px solid ${T.border}` : undefined,
              }}
              onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(186,230,253,0.25)")}
              onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
              <span className="mono text-xs font-bold tabular-nums"
                    style={{ color: i === 0 ? "#b45309" : i === 1 ? "#64748b" : i === 2 ? "#c2410c" : T.placeholder }}>
                {i + 1}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                     style={{ background: TIER_BG[a.tier] ?? "rgba(14,165,233,0.12)", color: T.accent }}>
                  {a.name[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate" style={{ color: T.ink }}>{a.name}</div>
                  <div className="mono text-xs truncate" style={{ color: T.placeholder }}>{short(a.owner)}</div>
                </div>
                <span className="text-xs font-bold shrink-0 ml-1"
                      style={{ color: TIER_COLOR[a.tier] ?? T.subtle }}>
                  {a.tier}
                </span>
              </div>
              <span className="mono text-sm font-bold tabular-nums" style={{ color: T.ink }}>{a.score}</span>
              <span className="mono text-xs tabular-nums" style={{ color: T.accentMid }}>
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

// ── Duration presets ───────────────────────────────────────────────────────────

const DURATION_PRESETS = [
  { label: "1 Day",  days: 1 },
  { label: "3 Days", days: 3 },
  { label: "5 Days", days: 5 },
  { label: "7 Days", days: 7 },
  { label: "Custom", days: 0 },
] as const;

// ── Funder panel ───────────────────────────────────────────────────────────────

function FunderPanel() {
  const [selectedMode, setSelectedMode]   = useState<1 | 2 | 3>(2);
  const [selectedPreset, setSelectedPreset] = useState<number>(1);
  const [customDays, setCustomDays]       = useState<string>("");
  const isCustom   = selectedPreset === 0;
  const activeDays = isCustom ? (parseFloat(customDays) || 0) : selectedPreset;
  const durationSecs = Math.round(activeDays * 86400);

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 sm:p-6">
        <h2 className="display text-lg font-bold mb-1" style={{ color: T.ink }}>Create a Stream</h2>
        <p className="text-sm mb-5" style={{ color: T.subtle }}>Escrow USDC and stream it to an agent over time.</p>
        <div className="space-y-3">
          {[
            { label: "Agent Address",       placeholder: "0x…" },
            { label: "Total Amount (USDC)", placeholder: "e.g. 100.00" },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                     style={{ color: T.subtle }}>{f.label}</label>
              <input className={inputCls} style={inputStyle} placeholder={f.placeholder} />
            </div>
          ))}

          {/* Duration picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                   style={{ color: T.subtle }}>Stream Duration</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DURATION_PRESETS.map(p => {
                const active = p.days === 0 ? isCustom : selectedPreset === p.days;
                return (
                  <button key={p.label} type="button"
                    onClick={() => { setSelectedPreset(p.days); if (p.days !== 0) setCustomDays(""); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: active ? "rgba(2,132,199,0.12)" : "rgba(255,255,255,0.60)",
                      border: active ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
                      color:  active ? T.accent : T.muted,
                    }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            {isCustom && (
              <input type="number" min="0.01" step="0.5" value={customDays}
                onChange={e => setCustomDays(e.target.value)}
                className={inputCls + " mb-2"} style={inputStyle}
                placeholder="Enter number of days (e.g. 2.5)" />
            )}
            {activeDays > 0 && (
              <p className="text-xs mono mt-1" style={{ color: T.accentLight }}>
                {activeDays === 1 ? "1 Day" : `${activeDays} Days`}
                {" = "}
                <span className="font-semibold" style={{ color: T.ink }}>{durationSecs.toLocaleString()} seconds</span>
                {" on-chain"}
              </p>
            )}
          </div>

          {/* Heartbeat mode */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                   style={{ color: T.subtle }}>Heartbeat Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 1 as const, label: "Strict",  sub: "5 min / 10 min" },
                { id: 2 as const, label: "Normal",  sub: "30 min / 30 min" },
                { id: 3 as const, label: "Relaxed", sub: "1 hr / 2 hr" },
              ] as const).map(m => (
                <button key={m.id} onClick={() => setSelectedMode(m.id)}
                  className="rounded-xl px-3 py-2.5 text-left transition-all"
                  style={{
                    background: selectedMode === m.id ? "rgba(2,132,199,0.10)" : "rgba(255,255,255,0.60)",
                    border: selectedMode === m.id ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
                  }}>
                  <div className="text-sm font-semibold"
                       style={{ color: selectedMode === m.id ? T.accent : T.ink }}>{m.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: T.placeholder }}>{m.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <button className="w-full rounded-xl py-3.5 text-sm font-bold transition-all hover:brightness-105 active:scale-[0.98] mt-1"
            style={{ background: T.accentGrad, color: "#fff",
                     boxShadow: "0 4px 14px rgba(2,132,199,0.28)" }}>
            Propose Stream
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="display text-sm font-bold mb-3 flex items-center gap-2" style={{ color: T.ink }}>
          <Clock size={13} style={{ color: T.accent }} /> Your Active Streams
        </h3>
        <div className="text-sm text-center py-6" style={{ color: T.placeholder }}>
          Connect your wallet to view active streams.
        </div>
      </div>
    </div>
  );
}

// ── Agent panel ────────────────────────────────────────────────────────────────

function AgentPanel() {
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 sm:p-6">
        <h2 className="display text-lg font-bold mb-1" style={{ color: T.ink }}>Register as Agent</h2>
        <p className="text-sm mb-5" style={{ color: T.subtle }}>Create your on-chain identity and start earning.</p>
        <div className="space-y-3">
          {[
            { label: "Agent Name",            placeholder: "e.g. ArcMind" },
            { label: "Profile URI",           placeholder: "https://…" },
            { label: "Min Daily Rate (USDC)", placeholder: "e.g. 10.00" },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                     style={{ color: T.subtle }}>{f.label}</label>
              <input className={inputCls} style={inputStyle} placeholder={f.placeholder} />
            </div>
          ))}
          <button className="w-full rounded-xl py-3.5 text-sm font-bold transition-all hover:brightness-105 active:scale-[0.98]"
            style={{ background: T.accentGrad, color: "#fff",
                     boxShadow: "0 4px 14px rgba(2,132,199,0.28)" }}>
            Register Agent
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="display text-sm font-bold mb-3 flex items-center gap-2" style={{ color: T.ink }}>
          <Shield size={13} style={{ color: T.accentLight }} /> Reputation Score
        </h3>
        <div className="text-sm text-center py-6" style={{ color: T.placeholder }}>
          Connect your wallet to view your score and tier.
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="display text-sm font-bold mb-3 flex items-center gap-2" style={{ color: T.ink }}>
          <Zap size={13} style={{ color: T.accent }} /> Incoming Streams
        </h3>
        <div className="text-sm text-center py-6" style={{ color: T.placeholder }}>
          Connect your wallet to view and accept streams.
        </div>
      </div>
    </div>
  );
}

// ── Contract addresses bar ─────────────────────────────────────────────────────

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
         style={{ borderTop: `1px solid ${T.border}` }}>
      {entries.map(e => (
        <a key={e.label} href={`https://explorer.arc.io/address/${e.addr}`}
           target="_blank" rel="noopener noreferrer"
           className="flex items-center gap-1 text-xs transition-colors"
           style={{ color: T.placeholder }}
           onMouseEnter={ev => (ev.currentTarget.style.color = T.accent)}
           onMouseLeave={ev => (ev.currentTarget.style.color = T.placeholder)}>
          <span style={{ color: T.subtle }}>{e.label}:</span>
          <span className="mono">{short(e.addr)}</span>
          <ExternalLink size={9} />
        </a>
      ))}
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,    setTab]    = useState<Tab>("leaderboard");
  const [lang,   setLang]   = useState<Lang>("EN");
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 2200);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <SplashScreen visible={splash} />

      <div className="min-h-dvh flex flex-col">

        {/* Fixed top header */}
        <header className="sticky top-0 z-40 w-full"
          style={{
            background: T.headerBg,
            borderBottom: `1px solid ${T.border}`,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 1px 12px rgba(14,165,233,0.08)",
          }}>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 max-w-4xl mx-auto w-full">
            <PulseLogo />
            <div className="flex items-center gap-2 shrink-0">
              <LangSelector lang={lang} setLang={setLang} />
              <ConnectKitButton.Custom>
                {({ isConnected, show, address }) => (
                  <button onClick={show}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:brightness-105 active:scale-95 shrink-0 whitespace-nowrap"
                    style={{ background: T.accentGrad, color: "#fff",
                             boxShadow: "0 2px 8px rgba(2,132,199,0.30)" }}>
                    <Wallet size={12} strokeWidth={2.5} />
                    {isConnected && address
                      ? <span>{address.slice(0,6)}…{address.slice(-4)}</span>
                      : <span>Connect</span>}
                  </button>
                )}
              </ConnectKitButton.Custom>
            </div>
          </div>
          <div className="flex items-center justify-center px-4 pb-2.5 max-w-4xl mx-auto w-full">
            <TabBar active={tab} setActive={setTab} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-5 max-w-4xl mx-auto w-full">
          {tab === "leaderboard" && <LeaderboardPanel setTab={setTab} />}
          {tab === "funder"      && <FunderPanel />}
          {tab === "agent"       && <AgentPanel />}
        </main>

        {/* Contract addresses */}
        <ContractBar />

        {/* Arc Studio watermark */}
        <div className="flex justify-center pb-5 pt-1">
          <a href="https://studio.arc.io" target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 text-xs transition-colors"
             style={{ color: T.placeholder }}
             onMouseEnter={ev => (ev.currentTarget.style.color = T.accent)}
             onMouseLeave={ev => (ev.currentTarget.style.color = T.placeholder)}>
            <PulseLogoMark size={13} />
            Built with Arc Studio
          </a>
        </div>

      </div>
    </>
  );
}
