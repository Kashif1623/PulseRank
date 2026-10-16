/**
 * Shared onchain data hooks for PulseRank.
 * All reads are scoped to Arc Mainnet (chainId 5042).
 */
import { useReadContract, useReadContracts } from 'wagmi'
import { useMemo } from 'react'
import type { Address } from 'viem'
import {
  REGISTRY_ABI, SCORE_ABI, STREAM_ABI,
  REGISTRY_ADDRESS, SCORE_ADDRESS, STREAM_ADDRESS,
  CONTRACTS_DEPLOYED,
} from '../contracts'
import { ARC_MAINNET_ID } from '../config'

const CHAIN = ARC_MAINNET_ID

// ─── Registered agent list ───────────────────────────────────────────────────

export function useRegisteredCount() {
  return useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'getRegisteredCount',
    chainId: CHAIN,
    query: { enabled: CONTRACTS_DEPLOYED },
  })
}

export function useRegisteredAgents(offset = 0, limit = 50) {
  return useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'getRegisteredAgents',
    args: [BigInt(offset), BigInt(limit)],
    chainId: CHAIN,
    query: { enabled: CONTRACTS_DEPLOYED },
  })
}

// ─── Agent metadata ──────────────────────────────────────────────────────────

export function useAgent(address: Address | undefined) {
  return useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'getAgent',
    args: address ? [address] : undefined,
    chainId: CHAIN,
    query: { enabled: CONTRACTS_DEPLOYED && !!address },
  })
}

// ─── Agent score ─────────────────────────────────────────────────────────────

export function useAgentScore(agent: Address | undefined) {
  return useReadContract({
    address: SCORE_ADDRESS,
    abi: SCORE_ABI,
    functionName: 'getScore',
    args: agent ? [agent] : undefined,
    chainId: CHAIN,
    query: { enabled: CONTRACTS_DEPLOYED && !!agent },
  })
}

// ─── Leaderboard (multiple scores in one multicall) ──────────────────────────

export function useLeaderboard(agents: Address[]) {
  const contracts = useMemo(
    () =>
      agents.map((agent) => ({
        address: SCORE_ADDRESS,
        abi: SCORE_ABI,
        functionName: 'getScore' as const,
        args: [agent] as [Address],
        chainId: CHAIN,
      })),
    [agents],
  )

  return useReadContracts({
    contracts,
    query: { enabled: CONTRACTS_DEPLOYED && agents.length > 0 },
  })
}

// ─── Stream lists ─────────────────────────────────────────────────────────────

export function useAgentStreamIds(agent: Address | undefined) {
  return useReadContract({
    address: STREAM_ADDRESS,
    abi: STREAM_ABI,
    functionName: 'getAgentStreams',
    args: agent ? [agent] : undefined,
    chainId: CHAIN,
    query: { enabled: CONTRACTS_DEPLOYED && !!agent },
  })
}

export function useFunderStreamIds(funder: Address | undefined) {
  return useReadContract({
    address: STREAM_ADDRESS,
    abi: STREAM_ABI,
    functionName: 'getFunderStreams',
    args: funder ? [funder] : undefined,
    chainId: CHAIN,
    query: { enabled: CONTRACTS_DEPLOYED && !!funder },
  })
}

// ─── Batch stream data ────────────────────────────────────────────────────────

export function useStreams(ids: readonly bigint[]) {
  const contracts = useMemo(
    () =>
      ids.map((id) => ({
        address: STREAM_ADDRESS,
        abi: STREAM_ABI,
        functionName: 'getStream' as const,
        args: [id] as [bigint],
        chainId: CHAIN,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids.join(',')],
  )

  return useReadContracts({
    contracts,
    query: { enabled: CONTRACTS_DEPLOYED && ids.length > 0, refetchInterval: 10_000 },
  })
}

// ─── Single stream ────────────────────────────────────────────────────────────

export function useStream(streamId: bigint | undefined) {
  return useReadContract({
    address: STREAM_ADDRESS,
    abi: STREAM_ABI,
    functionName: 'getStream',
    args: streamId !== undefined ? [streamId] : undefined,
    chainId: CHAIN,
    query: { enabled: CONTRACTS_DEPLOYED && streamId !== undefined, refetchInterval: 10_000 },
  })
}

// ─── Pending payout ───────────────────────────────────────────────────────────

export function usePendingPayout(address: Address | undefined) {
  return useReadContract({
    address: STREAM_ADDRESS,
    abi: STREAM_ABI,
    functionName: 'pendingPayouts',
    args: address ? [address] : undefined,
    chainId: CHAIN,
    query: { enabled: CONTRACTS_DEPLOYED && !!address, refetchInterval: 10_000 },
  })
}

// ─── USDC allowance ───────────────────────────────────────────────────────────
import { USDC_ABI, USDC_ADDRESS } from '../contracts'

export function useUsdcAllowance(owner: Address | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: owner ? [owner, STREAM_ADDRESS] : undefined,
    chainId: CHAIN,
    query: { enabled: !!owner, refetchInterval: 8_000 },
  })
}

export function useUsdcBalance(owner: Address | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: owner ? [owner] : undefined,
    chainId: CHAIN,
    query: { enabled: !!owner, refetchInterval: 10_000 },
  })
}

// ─── Computed earned ─────────────────────────────────────────────────────────

export function useComputeEarned(streamId: bigint | undefined) {
  return useReadContract({
    address: STREAM_ADDRESS,
    abi: STREAM_ABI,
    functionName: 'computeEarned',
    args: streamId !== undefined ? [streamId] : undefined,
    chainId: CHAIN,
    query: { enabled: CONTRACTS_DEPLOYED && streamId !== undefined, refetchInterval: 5_000 },
  })
}

// ─── Combined leaderboard hook ────────────────────────────────────────────────

export interface LeaderboardEntry {
  address: Address
  score: number
  name: string
  profileURI: string
}

export function useFullLeaderboard() {
  const { data: agents, isLoading: agentsLoading } = useRegisteredAgents(0, 50)
  const addrs: Address[] = useMemo(() => (agents as Address[] | undefined) ?? [], [agents])

  const { data: scores, isLoading: scoresLoading } = useLeaderboard(addrs)

  // Batch fetch agent names via multicall
  const agentContracts = useMemo(
    () =>
      addrs.map((addr) => ({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: 'getAgent' as const,
        args: [addr] as [Address],
        chainId: CHAIN,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addrs.join(',')],
  )
  const { data: agentMeta, isLoading: metaLoading } = useReadContracts({
    contracts: agentContracts,
    query: { enabled: CONTRACTS_DEPLOYED && addrs.length > 0 },
  })

  const entries = useMemo<LeaderboardEntry[]>(() => {
    if (!addrs.length || !scores || !agentMeta) return []
    return addrs
      .map((addr, i) => {
        const scoreResult = scores[i]
        const metaResult = agentMeta[i]
        const score = scoreResult?.status === 'success' ? Number(scoreResult.result) : 0
        const meta = metaResult?.status === 'success'
          ? (metaResult.result)
          : null
        const nameHex = meta?.name ?? ('0x')
        // Decode bytes32 name
        let name = ''
        const hex = nameHex.slice(2)
        for (let j = 0; j < hex.length; j += 2) {
          const byte = parseInt(hex.slice(j, j + 2), 16)
          if (byte === 0) break
          name += String.fromCharCode(byte)
        }
        return { address: addr, score, name: name || addr.slice(0, 8), profileURI: meta?.profileURI ?? '' }
      })
      .sort((a, b) => b.score - a.score)
  }, [addrs, scores, agentMeta])

  return { entries, isLoading: agentsLoading || scoresLoading || metaLoading }
}

// ─── Stream data with computed health ────────────────────────────────────────

export function useStreamData(streamId: bigint | undefined) {
  const { data, isLoading, refetch } = useStream(streamId)
  const streamData = data
  return { stream: streamData, isLoading, refetch }
}
