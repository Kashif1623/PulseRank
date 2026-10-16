import { useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, Wallet, Activity, CheckCircle, Sparkles } from 'lucide-react'

import {
  STREAM_ABI, STREAM_ADDRESS,
  MODE_LABELS, MODE_INTERVALS,
  formatUsdc, formatAddress,
  CONTRACTS_DEPLOYED, getStreamHealth,
} from '../contracts'
import { ARC_MAINNET_ID } from '../config'
import { NotDeployedBanner } from './ui/NotDeployedBanner'
import { StatusPill } from './ui/StatusPill'
import { ScoreBadge, ScoreBar } from './ui/ScoreBadge'
import { TxButton } from './ui/TxButton'
import { Countdown, useNow } from './ui/Countdown'
import { Tooltip, TooltipCard } from './ui/Tooltip'
import { cn } from './utils'
import {
  useAgentStreamIds, useStreams, usePendingPayout, useAgentScore, useAgent,
} from '../hooks/usePulseData'
import { useLang } from '../i18n'
import { txSuccess, txError } from '../lib/txToast'

const CHAIN = ARC_MAINNET_ID

// ─── Heartbeat card ───────────────────────────────────────────────────────────

function HeartbeatCard({ streamId }: { streamId: bigint }) {
  const now = useNow()
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { t } = useLang()

  const { data: streamRaw, refetch } = useStreams([streamId])
  const streamResult = streamRaw?.[0]
  const stream = streamResult?.status === 'success' ? streamResult.result : undefined

  const { writeContract, data: txHash, isPending, error: txErr } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const isWrongChain = chainId !== CHAIN

  const handleHeartbeat = useCallback(() => {
    if (isWrongChain) { switchChain({ chainId: CHAIN }); return }
    writeContract({ address: STREAM_ADDRESS, abi: STREAM_ABI, functionName: 'sendHeartbeat', args: [streamId], chainId: CHAIN })
  }, [isWrongChain, switchChain, writeContract, streamId])

  const handleAccept = useCallback(() => {
    if (isWrongChain) { switchChain({ chainId: CHAIN }); return }
    writeContract({ address: STREAM_ADDRESS, abi: STREAM_ABI, functionName: 'acceptStream', args: [streamId], chainId: CHAIN })
  }, [isWrongChain, switchChain, writeContract, streamId])

  const handleSettle = useCallback(() => {
    if (isWrongChain) { switchChain({ chainId: CHAIN }); return }
    writeContract({ address: STREAM_ADDRESS, abi: STREAM_ABI, functionName: 'settleStream', args: [streamId], chainId: CHAIN })
  }, [isWrongChain, switchChain, writeContract, streamId])

  useEffect(() => { if (isSuccess) void refetch() }, [isSuccess, refetch])
  useEffect(() => {
    if (isSuccess && txHash) {
      // Determine which toast to show based on function — approximate via stream health
      txSuccess(t.toast_heartbeat_sent, txHash)
    }
  }, [isSuccess, txHash, t.toast_heartbeat_sent])
  useEffect(() => { if (txErr) txError(t.toast_tx_error, txErr) }, [txErr, t.toast_tx_error])

  if (!stream) return <div className="h-[100px] rounded-2xl bg-white/[0.04] animate-pulse" />

  const health = getStreamHealth(stream, now)
  const { interval, grace } = MODE_INTERVALS[stream.mode] ?? { interval: 7200, grace: 1800 }
  const nextHbDeadline = Number(stream.lastHeartbeat) + interval
  const sinceLastHb = now - Number(stream.lastHeartbeat)
  const canHeartbeat = health === 'alive' && sinceLastHb >= interval
  const isGrace = health === 'grace'
  const earned = formatUsdc(stream.earnedAmount)
  const total = formatUsdc(stream.totalAmount)
  const progressPct = stream.totalAmount > 0n
    ? Math.min(100, Number((stream.earnedAmount * 100n) / stream.totalAmount))
    : 0
  const isComplete = stream.status === 1 && Number(stream.startTime) > 0 &&
    (now - Number(stream.startTime)) - Number(stream.pausedDuration) >= Number(stream.durationSecs)
  const isBusy = isPending || isConfirming

  return (
    <motion.div
      layout
      className={cn(
        'rounded-2xl border overflow-hidden transition-all duration-300',
        isGrace
          ? 'border-amber-400/30 bg-amber-400/[0.06] shadow-lg shadow-amber-400/10'
          : health === 'dead'
          ? 'border-red-400/25 bg-red-400/[0.05]'
          : health === 'alive'
          ? 'border-emerald-400/15 bg-white/[0.04]'
          : 'border-white/[0.07] bg-white/[0.03]',
      )}
    >
      {/* Progress strip */}
      <div className="h-0.5 bg-white/[0.03]">
        <div
          className={cn(
            'h-full transition-all duration-700',
            health === 'dead' ? 'bg-red-500' :
            isGrace ? 'bg-amber-400' :
            health === 'alive' ? 'bg-emerald-400' :
            'bg-slate-600',
          )}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <StatusPill stream={stream} now={now} />
            <span className="text-[11px] text-slate-600">{MODE_LABELS[stream.mode]} · #{streamId.toString()}</span>
          </div>
          <div className="text-right">
            <p className="tabular text-sm font-semibold text-white leading-tight">
              {earned} <span className="text-slate-500 font-normal">/ {total}</span>
            </p>
            <p className="text-[11px] text-slate-600">{t.earned}</p>
          </div>
        </div>

        {/* From address */}
        <p className="mono text-[11px] text-slate-600 mb-3">
          From: {formatAddress(stream.funder)}
        </p>

        {/* Countdown bar */}
        {(health === 'alive' || isGrace) && (
          <div className={cn(
            'flex items-center justify-between mb-3 rounded-xl px-3 py-2',
            isGrace ? 'bg-amber-400/10 border border-amber-400/15' : 'bg-white/[0.04]',
          )}>
            <span className="text-[11px] text-slate-500">
              {isGrace ? t.countdown_grace_ends : t.countdown_next_hb}
            </span>
            <Countdown
              targetSecs={isGrace ? Number(stream.lastHeartbeat) + interval + grace : nextHbDeadline}
              className={cn('text-xs font-semibold', isGrace ? 'text-amber-300' : 'text-slate-300')}
            />
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {health === 'proposed' && (
            <TxButton onClick={handleAccept} isPending={isBusy} isConfirming={isConfirming} txHash={txHash} fullWidth size="lg" variant="cyan">
              <CheckCircle size={15} /> {t.accept_stream}
            </TxButton>
          )}

          {(health === 'alive' || isGrace) && (
            <div className="relative">
              {/* Heartbeat glow when due */}
              {(canHeartbeat || isGrace) && (
                <div className={cn(
                  'absolute inset-0 rounded-2xl blur-md opacity-30 pointer-events-none',
                  isGrace ? 'bg-amber-400' : 'bg-emerald-400',
                )} />
              )}
              <TxButton
                onClick={handleHeartbeat}
                isPending={isBusy} isConfirming={isConfirming} txHash={txHash}
                disabled={!canHeartbeat && !isGrace}
                fullWidth size="lg"
                variant={isGrace ? 'amber' : 'primary'}
                className={cn(
                  'relative',
                  (canHeartbeat || isGrace) ? 'heartbeat-pulse' : '',
                )}
              >
                <Heart size={16} className={canHeartbeat || isGrace ? 'animate-bounce' : ''} />
                {canHeartbeat || isGrace ? t.send_heartbeat : t.heartbeat_not_due}
              </TxButton>
            </div>
          )}

          {isComplete && health !== 'closed' && (
            <TxButton onClick={handleSettle} isPending={isBusy} isConfirming={isConfirming} txHash={txHash} fullWidth size="lg">
              <Sparkles size={15} /> {t.settle_stream}
            </TxButton>
          )}

          {health === 'dead' && (
            <div className="w-full rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3 py-2.5 text-xs text-red-400 text-center">
              {t.stream_missed_hint}
            </div>
          )}

          {health === 'closed' && (
            <div className="w-full rounded-xl border border-slate-700/50 bg-white/[0.02] px-3 py-2.5 text-xs text-slate-600 text-center">
              {t.stream_closed_hint}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Agent Dashboard ──────────────────────────────────────────────────────────

export function AgentDashboard() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { t } = useLang()

  const { data: streamIds, isLoading } = useAgentStreamIds(address)
  const ids = streamIds ?? []
  const reversedIds = [...ids].reverse()

  const { data: pendingRaw, refetch: refetchPayout } = usePendingPayout(address)
  const pending = pendingRaw ?? 0n

  const { data: scoreRaw } = useAgentScore(address)
  const score = scoreRaw !== undefined ? Number(scoreRaw) : 0

  const { data: agentMeta } = useAgent(address)
  const isRegistered = agentMeta?.registered ?? false

  // Claim payout
  const { writeContract: claimWrite, data: claimHash, isPending: claimPending, error: claimErr } = useWriteContract()
  const { isLoading: claimConfirming, isSuccess: claimSuccess } = useWaitForTransactionReceipt({ hash: claimHash })

  const handleClaim = useCallback(() => {
    if (chainId !== CHAIN) { switchChain({ chainId: CHAIN }); return }
    claimWrite({ address: STREAM_ADDRESS, abi: STREAM_ABI, functionName: 'claimPayout', chainId: CHAIN })
  }, [chainId, switchChain, claimWrite])

  useEffect(() => {
    if (claimSuccess) {
      txSuccess(t.toast_claimed, claimHash)
      void refetchPayout()
    }
  }, [claimSuccess, claimHash, t.toast_claimed, refetchPayout])
  useEffect(() => { if (claimErr) txError(t.toast_tx_error, claimErr) }, [claimErr, t.toast_tx_error])

  if (!CONTRACTS_DEPLOYED) return <NotDeployedBanner />

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-5 pt-2"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center shrink-0">
            <Activity size={16} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="display font-semibold text-lg text-white leading-none mb-1">{t.agent_title}</h2>
            <p className="text-xs text-slate-500">
              {isRegistered ? t.agent_registered : t.agent_not_registered}
            </p>
          </div>
        </div>
        <Tooltip icon content={<TooltipCard title={t.tooltip_heartbeat_title} body={t.tooltip_heartbeat_body} />} maxWidth="280px" />
      </motion.div>

      {!isConnected ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-24 text-slate-500">
          <Activity size={36} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm">{t.connect_to_view}</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {/* Score card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">{t.rep_score}</p>
                <Tooltip icon content={<TooltipCard title={t.tooltip_score_title} body={t.tooltip_score_body} />} maxWidth="280px" />
              </div>
              <ScoreBadge score={score} size="md" />
            </div>

            <p className="display font-bold text-4xl text-white tabular mb-4" style={{ letterSpacing: '-0.04em' }}>
              {score.toLocaleString()}
            </p>

            <ScoreBar score={score} />
            <p className="text-[11px] text-slate-600 mt-2">{t.rep_score_hint}</p>
          </motion.div>

          {/* Claimable card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className={cn(
              'rounded-2xl border p-5 transition-all duration-300',
              pending > 0n
                ? 'border-emerald-400/30 bg-emerald-400/[0.06] shadow-lg shadow-emerald-500/10'
                : 'border-white/[0.07] bg-white/[0.03]',
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">
                  {t.claimable}
                </p>
                <p className={cn(
                  'display font-bold text-3xl tabular transition-colors',
                  pending > 0n ? 'text-emerald-300' : 'text-slate-600',
                )} style={{ letterSpacing: '-0.03em' }}>
                  {formatUsdc(pending)}
                  <span className="text-base font-normal text-slate-500 ml-1.5">USDC</span>
                </p>
              </div>
              <div className={cn(
                'w-11 h-11 rounded-full flex items-center justify-center transition-all',
                pending > 0n
                  ? 'bg-emerald-400/15 border border-emerald-400/30 shadow-lg shadow-emerald-400/20'
                  : 'bg-white/[0.05] border border-white/[0.08]',
              )}>
                <Wallet size={18} className={pending > 0n ? 'text-emerald-400' : 'text-slate-600'} />
              </div>
            </div>

            {pending > 0n && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4"
              >
                <TxButton
                  onClick={handleClaim}
                  isPending={claimPending} isConfirming={claimConfirming} txHash={claimHash}
                  fullWidth size="lg"
                >
                  <Sparkles size={15} />
                  {t.claim_usdc.replace('{amount}', formatUsdc(pending))}
                </TxButton>
              </motion.div>
            )}
          </motion.div>

          {/* Incoming streams */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">
                {t.incoming_streams} ({ids.length})
              </p>
              <Tooltip icon content={<TooltipCard title={t.tooltip_reclaim_title} body={t.tooltip_reclaim_body} />} maxWidth="280px" />
            </div>

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div key="loading" className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-[100px] rounded-2xl bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                  ))}
                </motion.div>
              ) : reversedIds.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-16 text-slate-600"
                >
                  <Heart size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium text-slate-500">{t.no_streams_agent}</p>
                  <p className="text-xs mt-1">{t.no_streams_agent_hint}</p>
                </motion.div>
              ) : (
                <motion.div key="list" className="space-y-3">
                  {reversedIds.map((id, i) => (
                    <motion.div
                      key={id.toString()}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      <HeartbeatCard streamId={id} />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}
