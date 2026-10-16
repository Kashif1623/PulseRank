import { cn } from '../utils'

interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

export function getBadge(score: number): { label: string; color: string; bg: string; glow: string } {
  if (score > 900) return { label: 'Diamond', color: 'text-cyan-300', bg: 'bg-cyan-400/10 border border-cyan-400/30', glow: 'shadow-cyan-400/20' }
  if (score > 750) return { label: 'Gold', color: 'text-amber-300', bg: 'bg-amber-400/10 border border-amber-400/30', glow: 'shadow-amber-400/20' }
  if (score < 500) return { label: 'At-Risk', color: 'text-red-400', bg: 'bg-red-400/10 border border-red-400/30', glow: 'shadow-red-400/20' }
  return { label: '', color: 'text-slate-300', bg: '', glow: '' }
}

export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const badge = getBadge(score)
  if (!badge.label) return null

  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : size === 'lg' ? 'text-sm px-3 py-1' : 'text-xs px-2 py-0.5'

  return (
    <span className={cn('rounded-full font-semibold tracking-wide uppercase', sizeClass, badge.bg, badge.color)}>
      {badge.label}
    </span>
  )
}

export function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 1000) * 100))
  const badge = getBadge(score)
  const barColor =
    score > 900 ? 'bg-cyan-400' :
    score > 750 ? 'bg-amber-400' :
    score < 500 ? 'bg-red-500' :
    'bg-emerald-400'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', barColor, badge.glow && `shadow-sm ${badge.glow}`)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('text-xs tabular mono font-medium w-10 text-right', badge.color || 'text-slate-300')}>
        {score}
      </span>
    </div>
  )
}
