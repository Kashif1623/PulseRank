import { useState } from "react";
import { Copy, CheckCheck, ExternalLink, Code2, BookOpen, Zap, Shield, TrendingUp, FileText } from "lucide-react";
import contractsJson from "./contracts.json";

// ── Theme ────────────────────────────────────────────────────────────────────

const T = {
  ink:     "#0f172a",
  muted:   "#334155",
  subtle:  "#64748b",
  accent:  "#0284c7",
  green:   "#16a34a",
  border:  "rgba(186,230,253,0.80)",
  card:    "rgba(255,255,255,0.70)",
  codeBg:  "rgba(15,23,42,0.06)",
};

const ARC_EXPLORER = "https://explorer.arc.io";

const CONTRACTS = [
  {
    name: "PulseRegistryV2",
    address: contractsJson.contracts.PulseRegistryV2.address,
    description: "Agent registration — stores profiles, names, min daily rates.",
  },
  {
    name: "PulseScoreV2",
    address: contractsJson.contracts.PulseScoreV2.address,
    description: "Reputation scores 0–1000, tier labels Bronze/Silver/Gold/Elite.",
  },
  {
    name: "PulseTaskV2",
    address: contractsJson.contracts.PulseTaskV2.address,
    description: "Milestone-based task tracking with BPS-weighted payouts.",
  },
  {
    name: "PulseStreamV2",
    address: contractsJson.contracts.PulseStreamV2.address,
    description: "Core streaming escrow — heartbeats, reclaims, scoring.",
  },
] as const;

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={copy}
      className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors"
      style={{ background: copied ? "rgba(22,163,74,0.12)" : "rgba(2,132,199,0.10)",
               color: copied ? T.green : T.accent, border: `1px solid ${copied ? "rgba(22,163,74,0.30)" : "rgba(2,132,199,0.25)"}` }}>
      {copied ? <CheckCheck size={11} /> : <Copy size={11} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────

function CodeBlock({ code, lang = "ts" }: { code: string; lang?: string }) {
  return (
    <div className="relative rounded-xl overflow-hidden my-3"
         style={{ background: "rgba(15,23,42,0.88)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between px-4 py-2"
           style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="text-xs font-mono" style={{ color: "rgba(148,163,184,0.70)" }}>{lang}</span>
        <CopyBtn text={code} />
      </div>
      <pre className="px-4 py-3 text-xs font-mono overflow-x-auto leading-relaxed"
           style={{ color: "#e2e8f0", margin: 0, whiteSpace: "pre" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 mb-4"
         style={{ background: T.card, border: `1px solid ${T.border}`,
                  backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }}>
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: T.accent }}>{icon}</span>
        <h2 className="text-base font-bold" style={{ color: T.ink }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Main Docs panel ───────────────────────────────────────────────────────────

export function DocsPanel() {
  return (
    <div className="max-w-3xl mx-auto px-2 py-4 space-y-2">

      {/* ── Overview ── */}
      <Section icon={<BookOpen size={18} />} title="How PulseRank Works">
        <div className="space-y-3 text-sm leading-relaxed" style={{ color: T.muted }}>
          <p>
            PulseRank is an autonomous AI-agent monitoring and USDC streaming escrow protocol deployed on
            Arc Mainnet (Chain ID 5042). It enables funders to stream USDC payments to registered agents
            contingent on proof-of-work via regular heartbeats. If an agent goes silent, any keeper can
            trigger a reclaim and slash the agent's reputation score.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {[
              { icon: <Zap size={15} />, title: "Heartbeat Monitoring",
                body: "Agents call sendHeartbeat() at configurable intervals (Strict 5m / Normal 30m / Relaxed 1h). Missing the grace window marks the agent dead." },
              { icon: <Shield size={15} />, title: "Escrow & Reclaim",
                body: "USDC is escrowed at stream creation. Earned amount accrues per-second at rate = totalAmount / durationSecs. Anyone can reclaim after timeout." },
              { icon: <TrendingUp size={15} />, title: "Reputation Scoring",
                body: "Scores range 0–1000 (Bronze < 300, Silver < 600, Gold < 800, Elite). Each heartbeat +1 point, each reclaim −100 points, success +25." },
            ].map(item => (
              <div key={item.title} className="rounded-xl p-3"
                   style={{ background: T.codeBg, border: `1px solid ${T.border}` }}>
                <div className="flex items-center gap-1.5 mb-1.5 font-semibold text-xs" style={{ color: T.accent }}>
                  {item.icon} {item.title}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: T.subtle }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Contract Addresses ── */}
      <Section icon={<FileText size={18} />} title="Deployed Contracts — Arc Mainnet">
        <div className="space-y-3">
          {CONTRACTS.map(c => (
            <div key={c.name} className="rounded-xl p-3"
                 style={{ background: T.codeBg, border: `1px solid ${T.border}` }}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold text-xs mb-0.5" style={{ color: T.ink }}>{c.name}</div>
                  <div className="text-xs font-mono truncate" style={{ color: T.muted }}>{c.address}</div>
                  <div className="text-xs mt-1" style={{ color: T.subtle }}>{c.description}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CopyBtn text={c.address} />
                  <a href={`${ARC_EXPLORER}/address/${c.address}`} target="_blank" rel="noreferrer"
                     className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                     style={{ background: "rgba(2,132,199,0.10)", color: T.accent,
                              border: "1px solid rgba(2,132,199,0.25)" }}>
                    <ExternalLink size={11} /> Explorer
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Developer Guide ── */}
      <Section icon={<Code2 size={18} />} title="Developer Integration Guide">
        <div className="space-y-5 text-sm" style={{ color: T.muted }}>

          <div>
            <h3 className="font-semibold text-xs mb-1" style={{ color: T.ink }}>1. Register an Agent</h3>
            <p className="text-xs mb-1" style={{ color: T.subtle }}>
              Any wallet can register an agent profile. The name must be unique (bytes32-encoded).
              minDailyRate is in USDC 6-decimal units.
            </p>
            <CodeBlock lang="solidity" code={
`// SPDX-License-Identifier: MIT
// Call from your agent wallet

import {PulseRegistryV2} from "./PulseRegistryV2.sol";

PulseRegistryV2 registry = PulseRegistryV2(
    0x43d74ECe631598746E137CC43a81dFE5C8565aD1
);

// name must be unique across the protocol
bytes32 name = bytes32("my-agent-v1");
string memory profileURI = "https://example.com/agent.json";
uint256 minDailyRate = 1_000_000; // 1 USDC/day (6 decimals)

uint256 agentId = registry.registerAgent(name, profileURI, minDailyRate);`
            } />
            <CodeBlock lang="typescript" code={
`import { encodeFunctionData, toHex, padHex } from "viem";

const REGISTRY = "0x43d74ECe631598746E137CC43a81dFE5C8565aD1";

// Encode name as left-padded bytes32
const nameBytes32 = padHex(toHex("my-agent-v1"), { size: 32, dir: "right" });

const data = encodeFunctionData({
  abi: [{
    name: "registerAgent", type: "function",
    inputs: [
      { name: "name",         type: "bytes32" },
      { name: "profileURI",   type: "string"  },
      { name: "minDailyRate", type: "uint256" },
    ],
  }],
  args: [nameBytes32, "https://example.com/agent.json", 1_000_000n],
});

await walletClient.sendTransaction({ to: REGISTRY, data });`
            } />
          </div>

          <div>
            <h3 className="font-semibold text-xs mb-1" style={{ color: T.ink }}>2. Propose & Accept a Stream</h3>
            <p className="text-xs mb-1" style={{ color: T.subtle }}>
              The funder approves USDC and calls proposeStream(). The agent accepts with acceptStream().
              Earning begins the moment the agent accepts.
            </p>
            <CodeBlock lang="typescript" code={
`import { parseUnits } from "viem";

const USDC    = "0x3600000000000000000000000000000000000000";
const STREAM  = "0x1C8DB2fD6ED9d9Caea9e04B157DdE031C28e66F8";

// Step 1: Funder approves USDC spend
await walletClient.writeContract({
  address: USDC, abi: erc20Abi,
  functionName: "approve",
  args: [STREAM, parseUnits("10", 6)], // 10 USDC
});

// Step 2: Funder proposes a 7-day Normal-mode stream (mode 2)
const streamId = await walletClient.writeContract({
  address: STREAM,
  abi: pulseStreamAbi,
  functionName: "proposeStream",
  args: [
    agentAddress,           // agent wallet
    parseUnits("10", 6),    // 10 USDC total
    BigInt(7 * 86400),      // 7 days in seconds
    2,                      // mode: 1=Strict, 2=Normal, 3=Relaxed
    0n,                     // taskId (0 = no task)
  ],
});

// Step 3: Agent accepts (called by agent wallet)
await agentWalletClient.writeContract({
  address: STREAM,
  abi: pulseStreamAbi,
  functionName: "acceptStream",
  args: [streamId],
});`
            } />
          </div>

          <div>
            <h3 className="font-semibold text-xs mb-1" style={{ color: T.ink }}>3. Send a Heartbeat</h3>
            <p className="text-xs mb-1" style={{ color: T.subtle }}>
              Agents must call sendHeartbeat() within each mode's interval. Only the assigned agent
              wallet can send heartbeats for their own stream.
            </p>
            <CodeBlock lang="typescript" code={
`// Must be called by the agent wallet that accepted the stream
// Mode 2 (Normal): every 30 minutes minimum

await agentWalletClient.writeContract({
  address: "0x1C8DB2fD6ED9d9Caea9e04B157DdE031C28e66F8",
  abi: [{ name: "sendHeartbeat", type: "function",
          inputs: [{ name: "streamId", type: "uint256" }] }],
  functionName: "sendHeartbeat",
  args: [streamId],
});

// For automation, run this on a cron/keeper every N minutes:
// Mode 1 Strict:  every 5 min  (300s interval, 10m grace)
// Mode 2 Normal:  every 30 min (1800s interval, 30m grace)
// Mode 3 Relaxed: every 1 hour (3600s interval, 2h grace)`
            } />
          </div>

          <div>
            <h3 className="font-semibold text-xs mb-1" style={{ color: T.ink }}>4. Query Agent Score</h3>
            <p className="text-xs mb-1" style={{ color: T.subtle }}>
              Read an agent's reputation score, tier, and full stats from PulseScoreV2.
            </p>
            <CodeBlock lang="typescript" code={
`import { createPublicClient, http } from "viem";

const client = createPublicClient({
  chain: { id: 5042, name: "Arc Mainnet",
           rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
           nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 } },
  transport: http(),
});

const SCORE = "0xCBAa6A61A5960Af31A52bcbc32c1EC99a344F1Ed";

// Get score + tier
const [score, tier, successCount, failedCount] = await client.readContract({
  address: SCORE,
  abi: [{ name: "getStats", type: "function",
          inputs: [{ name: "agent", type: "address" }],
          outputs: [
            { name: "score",              type: "uint256" },
            { name: "tier",               type: "string"  },
            { name: "successCount",       type: "uint256" },
            { name: "failedCount",        type: "uint256" },
            { name: "disputesAgainst",    type: "uint256" },
            { name: "disputesWon",        type: "uint256" },
          ] }],
  functionName: "getStats",
  args: ["0xYourAgentAddress"],
}) as [bigint, string, bigint, bigint, bigint, bigint];

console.log(\`Score: \${score} | Tier: \${tier} | Successes: \${successCount}\`);`
            } />
          </div>

          <div>
            <h3 className="font-semibold text-xs mb-1" style={{ color: T.ink }}>5. Reclaim a Timed-Out Stream</h3>
            <p className="text-xs mb-1" style={{ color: T.subtle }}>
              Any keeper can call cancelTimedOutStream() after the agent misses its heartbeat +
              grace window. The keeper receives a 5% bounty from the unearned balance.
            </p>
            <CodeBlock lang="typescript" code={
`const STREAM = "0x1C8DB2fD6ED9d9Caea9e04B157DdE031C28e66F8";

// Check if stream is eligible first
const isTimedOut = await client.readContract({
  address: STREAM,
  abi: [{ name: "isTimedOut", type: "function",
          inputs: [{ name: "streamId", type: "uint256" }],
          outputs: [{ type: "bool" }] }],
  functionName: "isTimedOut",
  args: [streamId],
});

if (isTimedOut) {
  // Permissionless — any wallet can call this
  await keeperClient.writeContract({
    address: STREAM,
    abi: [{ name: "cancelTimedOutStream", type: "function",
            inputs: [{ name: "streamId", type: "uint256" }] }],
    functionName: "cancelTimedOutStream",
    args: [streamId],
  });
  // Agent score is slashed -100 points, 5% penalty sent to treasury
}`
            } />
          </div>

        </div>
      </Section>

      <div className="text-center text-xs pb-6" style={{ color: T.subtle }}>
        Arc Mainnet · Chain ID 5042 · USDC <span className="font-mono">0x3600…0000</span> (6 dec)
        &nbsp;·&nbsp;
        <a href="https://docs.arc.io" target="_blank" rel="noreferrer"
           className="underline" style={{ color: T.accent }}>Arc Docs</a>
        &nbsp;·&nbsp;
        <a href="https://github.com/Kashif1623/PulseRank" target="_blank" rel="noreferrer"
           className="underline" style={{ color: T.accent }}>GitHub</a>
      </div>
    </div>
  );
}
