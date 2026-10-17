import { useFullLeaderboard } from '../hooks/usePulseData'
import { ScoreBadge, ScoreBar } from './ui/ScoreBadge'
import { NotDeployedBanner } from './ui/NotDeployedBanner'
import { Tooltip, TooltipCard } from './ui/Tooltip'
import { CONTRACTS_DEPLOYED, formatAddress } from '../contracts'
import { cn } from './utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, RefreshCw, Copy } from 'lucide-react'
import { useLang } from '../i18n'
import { copyToast } from '../lib/txToast'

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return (
    <span className="w-8 h-8 rounded-full bg-amber-400/15 border border-amber-400/25 flex items-center justify-center text-amber-300 font-bold display text-sm shrink-0">
      1
    </span>
  )
  if (rank === 2) return (
    <span className="w-8 h-8 rounded-full bg-slate-500/15 border border-slate-400/20 flex items-center justify-center text-slate-300 font-bold display text-sm shrink-0">
      2
    </span>
  )
  if (rank === 3) return (
    <span className="w-8 h-8 rounded-full bg-amber-700/20 border border-amber-600/25 flex items-center justify-center text-amber-600 font-bold display text-sm shrink-0">
      3
    </span>
  )
  return (
    <span className="w-8 flex items-center justify-center text-slate-600 text-xs tabular shrink-0">
      {rank}
    </span>
  )
}

function AgentAvatar({ name, rank }: { name: string; rank: number }) {
  const colors = [
    'from-emerald-400/20 to-cyan-400/20 border-emerald-400/20',
    'from-slate-400/15 to-slate-300/15 border-slate-400/15',
    'from-amber-600/20 to-orange-500/20 border-amber-600/20',
  ]
  const colorCls = rank <= 3 ? colors[rank - 1] : 'from-white/5 to-white/[0.03] border-white/8'
  return (
    <div className={cn(
      'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold bg-gradient-to-br border shrink-0',
      colorCls,
    )}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

export function Leaderboard() {
  const { entries, isLoading } = useFullLeaderboard()
  const { t } = useLang()

  if (!CONTRACTS_DEPLOYED) return <NotDeployedBanner />

  return (
    <div className="max-w-2xl mx-auto px-4 pb-32 sm:pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between mb-5 pt-2"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
            <Trophy size={16} className="text-amber-400" />
          </div>
          <div>
            <h2 className="display font-semibold text-lg text-white leading-none mb-1">
              {t.leaderboard_title}
            </h2>
            <p className="text-xs text-slate-500">
              {isLoading ? t.loading : `${entries.length} ${t.registered_agents}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip
            icon
            content={<TooltipCard title={t.tooltip_score_title} body={t.tooltip_score_body} />}
            maxWidth="280px"
          />
          {isLoading && <RefreshCw size={13} className="text-slate-600 animate-spin" />}
        </div>
      </motion.div>

      {/* Badge legend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="flex flex-wrap gap-3 mb-5 p-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl"
      >
        {[
          { key: 'diamond' as const, score: 950, label: t.badge_diamond, legend: t.badge_legend_diamond },
          { key: 'gold' as const, score: 800, label: t.badge_gold, legend: t.badge_legend_gold },
          { key: 'at_risk' as const, score: 300, label: t.badge_at_risk, legend: t.badge_legend_at_risk },
        ].map(({ key, score, label, legend }) => (
          <div key={key} className="flex items-center gap-2 text-xs text-slate-500">
            <ScoreBadge score={score} size="sm" />
            <span className="text-slate-600">{label}</span>
            <span className="tabular text-slate-700">{legend}</span>
          </div>
        ))}
      </motion.div>

      {/* Table */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div key="skeleton" className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[68px] rounded-2xl bg-white/[0.04] animate-pulse"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ))}
          </motion.div>
        ) : entries.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            {/* Decorative rings */}
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-white/[0.07] animate-spin" style={{ animationDuration: '12s' }} />
              <div className="absolute inset-2 rounded-full border border-white/[0.05]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Trophy size={28} className="text-amber-400/40" />
              </div>
            </div>
            <p className="font-semibold text-slate-300 text-base mb-2">{t.no_agents_title}</p>
            <p className="text-sm text-slate-600 max-w-xs mx-auto leading-relaxed">{t.no_agents_body}</p>
            {/* Step hint */}
            <div className="mt-6 inline-flex flex-col gap-2 text-left">
              {[
                { num: '1', text: 'Go to Agent tab' },
                { num: '2', text: 'Click Register as Agent' },
                { num: '3', text: 'Send heartbeats to earn score' },
              ].map(({ num, text }) => (
                <div key={num} className="flex items-center gap-3 text-xs text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center font-semibold text-slate-500 shrink-0">
                    {num}
                  </span>
                  {text}
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="list" className="space-y-2">
            {entries.map((entry, i) => {
              const isTop3 = i < 3
              const isFirst = i === 0
              return (
                <motion.div
                  key={entry.address}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.035, type: 'spring', stiffness: 400, damping: 30 }}
                  className={cn(
                    'group relative rounded-2xl border transition-all duration-200',
                    isFirst
                      ? 'bg-gradient-to-r from-amber-400/[0.07] via-white/[0.05] to-transparent border-amber-400/20 hover:border-amber-400/30'
                      : isTop3
                      ? 'bg-white/[0.06] border-white/10 hover:bg-white/[0.08]'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]',
                  )}
                >
                  {/* #1 glow strip */}
                  {isFirst && (
                    <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-gradient-to-b from-amber-400/60 via-amber-400/30 to-transparent" />
                  )}

                  <div className="flex items-center gap-3 px-4 py-3.5">
                    {/* Rank */}
                    <RankMedal rank={i + 1} />

                    {/* Avatar */}
                    <AgentAvatar name={entry.name} rank={i + 1} />

                    {/* Name + address */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-semibold text-sm text-white truncate leading-none">
                          {entry.name}
                        </span>
                        <ScoreBadge score={entry.score} size="sm" />
                      </div>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(entry.address)
                          copyToast(t.copied)
                        }}
                        className="group/copy flex items-center gap-1 mono text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
                      >
                        {formatAddress(entry.address)}
                        <Copy size={9} className="opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                      </button>
                    </div>

                    {/* Score bar */}
                    <div className="w-24 sm:w-32 shrink-0">
                      <ScoreBar score={entry.score} />
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
