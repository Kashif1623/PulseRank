import { useState, useCallback, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, PauseCircle, PlayCircle, AlertTriangle,
  ChevronDown, Coins, X, Zap, ChevronUp, Search, Check,
} from 'lucide-react'

import {
  STREAM_ABI, STREAM_ADDRESS, USDC_ABI, USDC_ADDRESS,
  MODE_LABELS, MODE_INTERVALS,
  formatUsdc, parseUsdc, formatAddress,
  CONTRACTS_DEPLOYED, type StreamData, getStreamHealth,
} from '../contracts'
import { ARC_MAINNET_ID } from '../config'
import { NotDeployedBanner } from './ui/NotDeployedBanner'
import { StatusPill } from './ui/StatusPill'
import { TxButton } from './ui/TxButton'
import { Countdown, useNow } from './ui/Countdown'
import { Tooltip, TooltipCard } from './ui/Tooltip'
import { cn } from './utils'
import {
  useFunderStreamIds, useStreams, useUsdcAllowance, useUsdcBalance,
} from '../hooks/usePulseData'
import { useLang } from '../i18n'
import { txSuccess, txError } from '../lib/txToast'

const CHAIN = ARC_MAINNET_ID

// ─── Featured demo agents ──────────────────────────────────────────────────────
// Replace these with real registered agents once deployed
const FEATURED_AGENTS = [
  { address: '0x1111000000000000000000000000000000000001' as `0x${string}`, name: 'alpha-bot',    score: 920 },
  { address: '0x2222000000000000000000000000000000000002' as `0x${string}`, name: 'beta-sentinel', score: 810 },
  { address: '0x3333000000000000000000000000000000000003' as `0x${string}`, name: 'gamma-watch',  score: 650 },
  { address: '0x4444000000000000000000000000000000000004' as `0x${string}`, name: 'delta-guard',  score: 490 },
]

// ─── Agent selector sub-component ─────────────────────────────────────────────

function AgentSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = FEATURED_AGENTS.find((a) => a.address === value)
  const isCustom = !!value && !selected

  const displayLabel = custom || isCustom
    ? t.custom_address
    : selected ? selected.name : t.select_agent

  function pickFeatured(addr: `0x${string}`) {
    onChange(addr)
    setCustom(false)
    setOpen(false)
  }

  function pickCustom() {
    setCustom(true)
    onChange('')
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <label className="text-[11px] text-slate-500 uppercase tracking-widest font-medium block">
        {t.agent_address}
      </label>

      {/* Dropdown trigger */}
      <div ref={dropRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all',
            'bg-white/[0.05] border-white/[0.09] hover:bg-white/[0.08] focus:outline-none focus:border-emerald-400/50',
            open && 'border-emerald-400/40 bg-white/[0.07]',
          )}
        >
          <span className={cn('truncate', selected || custom || isCustom ? 'text-slate-200' : 'text-slate-600')}>
            {displayLabel}
          </span>
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={14} className="text-slate-500 shrink-0 ml-2" />
          </motion.div>
        </button>

        {/* Dropdown panel */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute z-20 mt-1 w-full bg-[#0f1a2e] border border-white/[0.12] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
            >
              {/* Featured section */}
              <div className="px-3 pt-3 pb-1">
                <p className="text-[10px] text-slate-600 uppercase tracking-widest font-medium mb-1.5">
                  {t.featured_agents}
                </p>
              </div>
              {FEATURED_AGENTS.map((agent) => {
                const isActive = value === agent.address
                return (
                  <button
                    key={agent.address}
                    type="button"
                    onClick={() => pickFeatured(agent.address)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      isActive ? 'bg-emerald-400/10' : 'hover:bg-white/[0.05]',
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center text-xs font-semibold text-slate-300 shrink-0">
                      {agent.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', isActive ? 'text-emerald-300' : 'text-slate-200')}>
                        {agent.name}
                      </p>
                      <p className="mono text-[10px] text-slate-600 truncate">{formatAddress(agent.address)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs tabular text-slate-500">{agent.score}</span>
                      {isActive && <Check size={13} className="text-emerald-400" />}
                    </div>
                  </button>
                )
              })}

              {/* Divider + custom option */}
              <div className="border-t border-white/[0.07] mt-1">
                <button
                  type="button"
                  onClick={pickCustom}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    (custom || isCustom) ? 'bg-emerald-400/10' : 'hover:bg-white/[0.05]',
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0">
                    <Search size={12} className="text-slate-500" />
                  </div>
                  <span className={cn('text-sm', (custom || isCustom) ? 'text-emerald-300' : 'text-slate-400')}>
                    {t.enter_custom_address}
                  </span>
                  {(custom || isCustom) && <Check size={13} className="text-emerald-400 ml-auto" />}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Custom address input — shown when custom is selected */}
      <AnimatePresence>
        {(custom || isCustom) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t.agent_address_placeholder}
              spellCheck={false}
              autoFocus
              className="w-full bg-white/[0.05] border border-white/[0.09] rounded-xl px-3 py-2.5 text-sm mono text-slate-200 placeholder-slate-700 focus:outline-none focus:border-emerald-400/50 focus:bg-white/[0.07] transition-all"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Stream creation modal ────────────────────────────────────────────────────

function ProposeStreamModal({ onClose }: { onClose: () => void }) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { t } = useLang()
  const [agentAddr, setAgentAddr] = useState('')
  const [amount, setAmount] = useState('')
  const [durationDays, setDurationDays] = useState('7')
  const [mode, setMode] = useState<1 | 2 | 3>(2)

  const parsedAmount = parseUsdc(amount)
  const durationSecs = BigInt(Math.max(1, Math.round(parseFloat(durationDays || '0') * 86400)))

  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address)
  const { data: balance } = useUsdcBalance(address)

  const needsApproval = allowance !== undefined && parsedAmount > 0n && allowance < parsedAmount
  const isWrongChain = chainId !== CHAIN

  const { writeContract: approve, data: appHash, isPending: appPending, error: appError } = useWriteContract()
  const { isLoading: appConfirming, isSuccess: appSuccess } = useWaitForTransactionReceipt({ hash: appHash })

  const { writeContract: propose, data: propHash, isPending: propPending, error: propError } = useWriteContract()
  const { isLoading: propConfirming, isSuccess: propSuccess } = useWaitForTransactionReceipt({ hash: propHash })

  useEffect(() => {
    if (appSuccess) { txSuccess(t.toast_approved, appHash); void refetchAllowance() }
  }, [appSuccess, appHash, t.toast_approved, refetchAllowance])
  useEffect(() => { if (appError) txError(t.toast_tx_error, appError) }, [appError, t.toast_tx_error])
  useEffect(() => { if (propError) txError(t.toast_tx_error, propError) }, [propError, t.toast_tx_error])
  useEffect(() => {
    if (propSuccess) { txSuccess(t.toast_proposed, propHash); onClose() }
  }, [propSuccess, propHash, t.toast_proposed, onClose])

  const handleApprove = useCallback(() => {
    if (isWrongChain) { switchChain({ chainId: CHAIN }); return }
    approve({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve', args: [STREAM_ADDRESS, parsedAmount], chainId: CHAIN })
  }, [isWrongChain, switchChain, approve, parsedAmount])

  const handlePropose = useCallback(() => {
    if (isWrongChain) { switchChain({ chainId: CHAIN }); return }
    if (!/^0x[0-9a-fA-F]{40}$/.test(agentAddr)) { toast.error('Invalid agent address'); return }
    propose({
      address: STREAM_ADDRESS, abi: STREAM_ABI, functionName: 'proposeStream',
      args: [agentAddr as `0x${string}`, parsedAmount, durationSecs, mode],
      chainId: CHAIN,
    })
  }, [isWrongChain, switchChain, propose, agentAddr, parsedAmount, durationSecs, mode])

  const balanceUsdc = balance ? formatUsdc(balance) : '—'
  const amountNum = parseFloat(amount || '0')
  const daysNum = parseFloat(durationDays || '0')
  const canPropose = !!agentAddr && /^0x[0-9a-fA-F]{40}$/.test(agentAddr) && amountNum >= 0.2 && daysNum >= 1
  const ratePerDay = amountNum > 0 && daysNum > 0 ? (amountNum / daysNum).toFixed(4) : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        className="w-full sm:max-w-md bg-[#101624] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/60"
        style={{ maxHeight: '90dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 pt-6 pb-4 bg-[#101624] border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
              <Zap size={14} className="text-emerald-400" />
            </div>
            <h3 className="display font-semibold text-base text-white">{t.new_stream}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/[0.07] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-4">
          {/* Agent selector */}
          <AgentSelector value={agentAddr} onChange={setAgentAddr} />

          {/* Amount */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">{t.amount_usdc}</label>
              <span className="text-xs text-slate-600">
                {t.balance}: <span className="tabular text-slate-400">{balanceUsdc}</span>
              </span>
            </div>
            <div className="relative">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                type="number"
                min="0.20"
                step="0.01"
                className="w-full bg-white/[0.05] border border-white/[0.09] rounded-xl px-3 py-2.5 text-sm tabular text-slate-200 placeholder-slate-700 focus:outline-none focus:border-emerald-400/50 pr-16 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">USDC</span>
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {['1', '5', '10', '50', '100'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(v)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-lg border transition-all',
                    amount === v
                      ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300'
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-500 hover:bg-white/[0.07] hover:text-slate-300',
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-[11px] text-slate-500 uppercase tracking-widest mb-1.5 block font-medium">
              {t.duration_days}
            </label>
            <div className="relative">
              <input
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                type="number" min="1" step="1"
                className="w-full bg-white/[0.05] border border-white/[0.09] rounded-xl px-3 py-2.5 text-sm tabular text-slate-200 focus:outline-none focus:border-emerald-400/50 pr-10 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">d</span>
            </div>
            <div className="flex gap-1.5 mt-2">
              {[7, 14, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationDays(String(d))}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-lg border transition-all',
                    durationDays === String(d)
                      ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300'
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-500 hover:bg-white/[0.07] hover:text-slate-300',
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <label className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">
                {t.heartbeat_mode}
              </label>
              <Tooltip
                icon
                content={<TooltipCard title={t.tooltip_mode_title} body={t.tooltip_mode_body} />}
                maxWidth="280px"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((m) => {
                const { interval, grace } = MODE_INTERVALS[m]
                const fmt = (s: number) => s >= 3600 ? `${s / 3600}h` : `${s / 60}m`
                const label = m === 1 ? t.mode_strict : m === 2 ? t.mode_normal : t.mode_relaxed
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      'rounded-xl border p-2.5 text-left transition-all',
                      mode === m
                        ? 'bg-emerald-400/10 border-emerald-400/35 ring-1 ring-emerald-400/20'
                        : 'bg-white/[0.04] border-white/[0.09] hover:bg-white/[0.07]',
                    )}
                  >
                    <p className={cn('font-semibold text-xs', mode === m ? 'text-emerald-300' : 'text-slate-300')}>
                      {label}
                    </p>
                    <p className="text-[10px] mt-0.5 text-slate-600">
                      {fmt(interval)} / {fmt(grace)}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Rate preview */}
          {ratePerDay && (
            <div className="flex items-center justify-between py-2.5 px-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-xs">
              <span className="text-slate-500">{t.rate_per_day}</span>
              <span className="tabular text-slate-300 font-medium">{ratePerDay} USDC</span>
            </div>
          )}

          {/* CTA */}
          {isWrongChain ? (
            <TxButton onClick={() => switchChain({ chainId: CHAIN })} fullWidth variant="amber" size="lg">
              {t.switch_to_arc}
            </TxButton>
          ) : needsApproval ? (
            <TxButton onClick={handleApprove} isPending={appPending} isConfirming={appConfirming} txHash={appHash} fullWidth size="lg">
              {t.approve_usdc}
            </TxButton>
          ) : (
            <TxButton
              onClick={handlePropose}
              isPending={propPending} isConfirming={propConfirming} txHash={propHash}
              disabled={!canPropose}
              fullWidth size="lg"
            >
              {t.propose_stream}
            </TxButton>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Stream card ───────────────────────────────────────────────────────────────

function StreamCard({ streamId }: { streamId: bigint }) {
  const now = useNow()
  const [expanded, setExpanded] = useState(false)
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { t } = useLang()

  const { data: streamRaw, refetch } = useStreams([streamId])
  const streamResult = streamRaw?.[0]
  const streamUnknown = streamResult?.status === 'success' ? streamResult.result : undefined
  const stream: StreamData | undefined = streamUnknown

  const { writeContract, data: txHash, isPending, error: txErr } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: txSuccess2 } = useWaitForTransactionReceipt({ hash: txHash })

  const doTx = useCallback((fn: Parameters<typeof writeContract>[0]) => {
    if (chainId !== CHAIN) { switchChain({ chainId: CHAIN }); return }
    writeContract(fn)
  }, [chainId, switchChain, writeContract])

  useEffect(() => { if (txSuccess2) void refetch() }, [txSuccess2, refetch])
  useEffect(() => { if (txErr) txError(t.toast_tx_error, txErr) }, [txErr, t.toast_tx_error])

  if (!stream) return (
    <div className="h-[72px] rounded-2xl bg-white/[0.04] skeleton" />
  )

  const health = getStreamHealth(stream, now)
  const { interval, grace } = MODE_INTERVALS[stream.mode] ?? { interval: 7200, grace: 1800 }
  const deadlineTs = Number(stream.lastHeartbeat) + interval + grace
  const earned = formatUsdc(stream.earnedAmount)
  const total = formatUsdc(stream.totalAmount)
  const progressPct = stream.totalAmount > 0n
    ? Math.min(100, Number((stream.earnedAmount * 100n) / stream.totalAmount))
    : 0
  const isBusy = isPending || isConfirming
  const canForceUnpause = health === 'paused' && stream.pausedAt > 0n && (now - Number(stream.pausedAt)) >= 7 * 86400
  const fmt = (s: number) => s >= 3600 ? `${s / 3600}h` : `${s / 60}m`

  return (
    <div className={cn(
      'rounded-2xl border transition-all duration-200 overflow-hidden',
      health === 'dead'   ? 'border-red-400/20 bg-red-400/[0.04]' :
      health === 'grace'  ? 'border-amber-400/20 bg-amber-400/[0.04]' :
      health === 'alive'  ? 'border-emerald-400/15 bg-white/[0.04]' :
      'border-white/[0.07] bg-white/[0.03]',
    )}>
      {/* Progress bar */}
      <div className="h-0.5 bg-white/[0.04]">
        <div
          className={cn('h-full transition-all duration-700',
            health === 'dead' ? 'bg-red-500' :
            health === 'grace' ? 'bg-amber-400' :
            health === 'alive' ? 'bg-emerald-400' : 'bg-slate-600')}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Main row */}
      <div className="px-4 py-3.5 flex items-center gap-3">
        <StatusPill stream={stream} now={now} />

        <div className="flex-1 min-w-0">
          <p className="mono text-xs text-slate-400 truncate">{formatAddress(stream.agent)}</p>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {MODE_LABELS[stream.mode]} · {t.stream_id} #{streamId.toString()}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="tabular text-sm font-semibold text-white leading-tight">
            {earned} <span className="text-slate-500 font-normal">/ {total}</span>
          </p>
          {health === 'alive' && (
            <Countdown targetSecs={Number(stream.lastHeartbeat) + interval} className="text-[11px] text-slate-500" />
          )}
          {health === 'grace' && (
            <Countdown targetSecs={deadlineTs} className="text-[11px] text-amber-400" />
          )}
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-400 hover:bg-white/[0.06] transition-colors ml-0.5 shrink-0"
        >
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={14} />
          </motion.div>
        </button>
      </div>

      {/* Expanded */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-white/[0.06]">
              <div className="grid grid-cols-3 gap-2 mb-3 mt-2">
                <div className="bg-white/[0.03] rounded-xl p-2.5">
                  <p className="text-[10px] text-slate-600 mb-0.5">{t.duration}</p>
                  <p className="tabular text-xs text-slate-300 font-medium">{(Number(stream.durationSecs) / 86400).toFixed(1)}d</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-2.5">
                  <p className="text-[10px] text-slate-600 mb-0.5">{t.rate_per_day}</p>
                  <p className="tabular text-xs text-slate-300 font-medium">
                    {stream.durationSecs > 0n ? formatUsdc((stream.totalAmount * 86400n) / stream.durationSecs) : '0'} USDC
                  </p>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-2.5">
                  <p className="text-[10px] text-slate-600 mb-0.5">{t.hb_interval}</p>
                  <p className="tabular text-xs text-slate-300 font-medium">{fmt(interval)} / {fmt(grace)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(health === 'alive' || health === 'grace') && (
                  <TxButton size="sm" variant="ghost" isPending={isBusy}
                    onClick={() => doTx({ address: STREAM_ADDRESS, abi: STREAM_ABI, functionName: 'pauseStream', args: [streamId], chainId: CHAIN })}>
                    <PauseCircle size={12} /> {t.pause}
                  </TxButton>
                )}
                {health === 'paused' && !canForceUnpause && (
                  <TxButton size="sm" variant="ghost" isPending={isBusy}
                    onClick={() => doTx({ address: STREAM_ADDRESS, abi: STREAM_ABI, functionName: 'unpauseStream', args: [streamId], chainId: CHAIN })}>
                    <PlayCircle size={12} /> {t.unpause}
                  </TxButton>
                )}
                {health === 'proposed' && (
                  <TxButton size="sm" variant="danger" isPending={isBusy}
                    onClick={() => doTx({ address: STREAM_ADDRESS, abi: STREAM_ABI, functionName: 'cancelProposal', args: [streamId], chainId: CHAIN })}>
                    <X size={12} /> {t.cancel_proposal}
                  </TxButton>
                )}
                {health === 'dead' && (
                  <TxButton size="sm" variant="danger" isPending={isBusy}
                    onClick={() => doTx({ address: STREAM_ADDRESS, abi: STREAM_ABI, functionName: 'triggerReclaim', args: [streamId], chainId: CHAIN })}>
                    <AlertTriangle size={12} /> {t.force_reclaim}
                  </TxButton>
                )}
                {canForceUnpause && (
                  <TxButton size="sm" variant="amber" isPending={isBusy}
                    onClick={() => doTx({ address: STREAM_ADDRESS, abi: STREAM_ABI, functionName: 'forceUnpause', args: [streamId], chainId: CHAIN })}>
                    <ChevronUp size={12} /> {t.force_unpause}
                  </TxButton>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function FunderDashboard() {
  const { address, isConnected } = useAccount()
  const [showForm, setShowForm] = useState(false)
  const { t } = useLang()

  const { data: streamIds, isLoading } = useFunderStreamIds(address)
  const ids = streamIds ?? []
  const reversedIds = [...ids].reverse()

  if (!CONTRACTS_DEPLOYED) return <NotDeployedBanner />

  return (
    <div className="max-w-2xl mx-auto px-4 pb-32 sm:pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-5 pt-2"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center shrink-0">
            <Coins size={16} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="display font-semibold text-lg text-white leading-none mb-1">{t.funder_title}</h2>
            <p className="text-xs text-slate-500">
              {ids.length} {t.funder_subtitle}{ids.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {isConnected && (
          <TxButton size="sm" onClick={() => setShowForm(true)}>
            <Plus size={12} /> {t.new_stream}
          </TxButton>
        )}
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {!isConnected ? (
          <motion.div key="disconnected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-24 text-slate-500">
            <Coins size={36} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm">{t.connect_to_view}</p>
          </motion.div>
        ) : isLoading ? (
          <motion.div key="loading" className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[72px] rounded-2xl skeleton" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </motion.div>
        ) : reversedIds.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-24 text-slate-500">
            <Coins size={36} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium text-slate-400 mb-1">{t.no_streams_title}</p>
            <p className="text-sm mb-6">{t.no_streams_body}</p>
            <TxButton onClick={() => setShowForm(true)}>
              <Plus size={13} /> {t.new_stream}
            </TxButton>
          </motion.div>
        ) : (
          <motion.div key="list" className="space-y-2">
            {reversedIds.map((id, i) => (
              <motion.div
                key={id.toString()}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <StreamCard streamId={id} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && <ProposeStreamModal onClose={() => setShowForm(false)} />}
      </AnimatePresence>
    </div>
  )
}
