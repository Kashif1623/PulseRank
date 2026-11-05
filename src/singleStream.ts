/**
 * "1 Funder wallet -> 1 dedicated Agent wallet -> 1 open stream" rules.
 *
 * Frontend-only guard: it reads the live contract state and tells the UI whether a new stream or
 * an accept is allowed. The contracts themselves are untouched and still accept anything, so these
 * rules protect users of pulserank.tech, not the protocol.
 *
 * "Open" means Proposed (0), Active (1) or Paused (2). Completed, Reclaimed and Cancelled streams
 * are finished and no longer count.
 */
import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { hexToString } from "viem";
import contractsJson from "./contracts.json";

const CHAIN_ID = 5042;
const STREAM = contractsJson.contracts.PulseStreamV2.address as `0x${string}`;
const REGISTRY = contractsJson.contracts.PulseRegistryV2.address as `0x${string}`;
const SCAN_LIMIT = 60;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const STATUS_NAMES = ["Proposed", "Active", "Paused", "Completed", "Reclaimed", "Cancelled"] as const;

const STREAM_ABI = [
  { type: "function", name: "nextStreamId", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function", name: "getStream", stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{
      name: "", type: "tuple", components: [
        { name: "funder", type: "address" }, { name: "agent", type: "address" },
        { name: "totalAmount", type: "uint256" }, { name: "durationSecs", type: "uint256" },
        { name: "ratePerSecX18", type: "uint256" }, { name: "startTime", type: "uint256" },
        { name: "lastHeartbeat", type: "uint256" }, { name: "earnedAmount", type: "uint256" },
        { name: "pausedAt", type: "uint256" }, { name: "pausedDuration", type: "uint256" },
        { name: "missedHeartbeats", type: "uint256" }, { name: "lastMissCheckpoint", type: "uint256" },
        { name: "taskId", type: "uint256" }, { name: "mode", type: "uint8" }, { name: "status", type: "uint8" },
      ],
    }],
  },
] as const;

const REGISTRY_ABI = [
  { type: "function", name: "getAgentsByOwner", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256[]" }] },
  {
    type: "function", name: "agents", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "name", type: "bytes32" }, { name: "profileURI", type: "string" }, { name: "minDailyRate", type: "uint256" },
      { name: "registeredAt", type: "uint256" }, { name: "active", type: "bool" }, { name: "owner", type: "address" },
    ],
  },
] as const;

const STREAM_FIELDS = ["funder", "agent", "totalAmount", "durationSecs", "ratePerSecX18", "startTime", "lastHeartbeat",
  "earnedAmount", "pausedAt", "pausedDuration", "missedHeartbeats", "lastMissCheckpoint", "taskId", "mode", "status"] as const;

export interface StreamRef { id: number; funder: string; agent: string; status: number }

/** wagmi caches reads without the ABI in the key, so a stream can arrive as an object or as an array. */
function toStreamRef(id: number, raw: unknown): StreamRef | null {
  if (!raw || typeof raw !== "object") return null;
  const o: Record<string, unknown> = Array.isArray(raw)
    ? Object.fromEntries(STREAM_FIELDS.map((k, i) => [k, raw[i]]))
    : (raw as Record<string, unknown>);
  if (typeof o.funder !== "string" || typeof o.agent !== "string") return null;
  return { id, funder: o.funder.toLowerCase(), agent: o.agent.toLowerCase(), status: Number(o.status) };
}

const isOpen = (s: StreamRef) => s.status === 0 || s.status === 1 || s.status === 2;

/** Latest streams on the current PulseStreamV2 contract. */
export function useRecentStreams() {
  const { data: nextRaw, isLoading: nextLoading } = useReadContract({
    address: STREAM, abi: STREAM_ABI, functionName: "nextStreamId", chainId: CHAIN_ID,
    query: { refetchInterval: 15_000 },
  });
  const total = nextRaw !== undefined ? Math.max(0, Number(nextRaw) - 1) : 0;
  const first = Math.max(1, total - SCAN_LIMIT + 1);
  const ids = useMemo(() => Array.from({ length: total >= first ? total - first + 1 : 0 }, (_, i) => first + i), [first, total]);

  const { data: results, isLoading: streamsLoading } = useReadContracts({
    contracts: ids.map(id => ({ address: STREAM, abi: STREAM_ABI, functionName: "getStream" as const, args: [BigInt(id)] as const, chainId: CHAIN_ID })),
    query: { enabled: ids.length > 0, refetchInterval: 15_000 },
  });

  const streams = useMemo(() => {
    const out: StreamRef[] = [];
    results?.forEach((r, i) => {
      if (r.status !== "success") return;
      const ref = toStreamRef(ids[i], r.result);
      if (ref) out.push(ref);
    });
    return out;
  }, [results, ids]);

  const loading = nextRaw === undefined ? nextLoading : ids.length > 0 && streamsLoading && !results;
  return { streams, loading, hasData: nextRaw !== undefined };
}

/** The agent profile (if any) registered by a wallet: one wallet = one dedicated agent. */
export function useOwnAgentProfile(wallet?: string) {
  const valid = !!wallet && ADDRESS_RE.test(wallet);
  const { data: ids, isLoading: idsLoading } = useReadContract({
    address: REGISTRY, abi: REGISTRY_ABI, functionName: "getAgentsByOwner",
    args: valid ? [wallet as `0x${string}`] : undefined, chainId: CHAIN_ID,
    query: { enabled: valid },
  });
  const firstId = ids && ids.length > 0 ? ids[0] : undefined;
  const { data: profile, isLoading: profileLoading } = useReadContract({
    address: REGISTRY, abi: REGISTRY_ABI, functionName: "agents",
    args: firstId !== undefined ? [firstId] : undefined, chainId: CHAIN_ID,
    query: { enabled: firstId !== undefined },
  });
  let name: string | null = null;
  if (profile) {
    try { name = hexToString(profile[0], { size: 32 }).replace(/\0+$/g, "").trim() || null; } catch { name = null; }
  }
  return {
    loading: valid && (idsLoading || (firstId !== undefined && profileLoading)),
    registered: valid && !!ids && ids.length > 0,
    profileCount: ids?.length ?? 0,
    name,
  };
}

export interface RuleCheck { id: string; ok: boolean; label: string; detail?: string }

/**
 * Rules for creating a stream from `funder` to `agent`:
 *  1. the agent is a different wallet (dedicated agent, no self-streams)
 *  2. the agent is a registered agent
 *  3. the funder has no other open stream
 *  4. the agent has no other open stream
 */
export function useStreamRules(funder?: string, agent?: string) {
  const { streams, loading: streamsLoading, hasData } = useRecentStreams();
  const agentValid = !!agent && ADDRESS_RE.test(agent);
  const agentProfile = useOwnAgentProfile(agentValid ? agent : undefined);

  return useMemo(() => {
    const f = funder?.toLowerCase();
    const a = agentValid ? agent.toLowerCase() : undefined;
    const funderOpen = f ? streams.find(s => s.funder === f && isOpen(s)) : undefined;
    const agentOpen = a ? streams.find(s => s.agent === a && isOpen(s)) : undefined;
    const lastForFunder = f ? [...streams].reverse().find(s => s.funder === f && s.agent !== f) : undefined;

    const checks: RuleCheck[] = [];
    if (agentValid) {
      checks.push(f && a === f
        ? { id: "dedicated", ok: false, label: "Dedicated agent wallet", detail: "The agent must be a different wallet from the funder. Use a separate agent wallet." }
        : { id: "dedicated", ok: true, label: "Dedicated agent wallet" });
      checks.push(agentProfile.loading
        ? { id: "registered", ok: true, label: "Agent is registered", detail: "Checking the registry…" }
        : agentProfile.registered
          ? { id: "registered", ok: true, label: "Agent is registered", detail: agentProfile.name ?? undefined }
          : { id: "registered", ok: false, label: "Agent is registered", detail: "This wallet has no agent profile. The agent must register in the Agent tab first." });
      checks.push(agentOpen
        ? { id: "agent-free", ok: false, label: "Agent has no other open stream", detail: `This agent already has stream #${agentOpen.id} (${STATUS_NAMES[agentOpen.status] ?? "open"}). One agent works for one funder at a time.` }
        : { id: "agent-free", ok: true, label: "Agent has no other open stream" });
    }
    checks.push(funderOpen
      ? { id: "funder-free", ok: false, label: "You have no other open stream", detail: `You already have stream #${funderOpen.id} (${STATUS_NAMES[funderOpen.status] ?? "open"}). Settle or reclaim it before creating another.` }
      : { id: "funder-free", ok: true, label: "You have no other open stream" });

    const firstViolation = checks.find(c => !c.ok)?.detail;
    return {
      checks,
      blocked: checks.some(c => !c.ok),
      firstViolation,
      /** true while the stream list or registry is still loading, so the UI doesn't flash green too early */
      checking: !hasData || streamsLoading || agentProfile.loading,
      funderOpen,
      dedicatedAgent: lastForFunder?.agent,
    };
  }, [funder, agent, agentValid, streams, streamsLoading, hasData, agentProfile.loading, agentProfile.registered, agentProfile.name]);
}

/** Another open (Active or Paused) stream that already occupies this agent wallet, excluding `exceptId`. */
export function useAgentBusyWith(agent: string | undefined, exceptId: number) {
  const { streams } = useRecentStreams();
  return useMemo(() => {
    if (!agent) return undefined;
    const a = agent.toLowerCase();
    return streams.find(s => s.agent === a && s.id !== exceptId && (s.status === 1 || s.status === 2));
  }, [streams, agent, exceptId]);
}
