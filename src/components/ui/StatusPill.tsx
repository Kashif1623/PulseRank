import { cn } from '../utils'
import type { StreamData } from '../../contracts'
import { getStreamHealth } from '../../contracts'
import { useLang } from '../../i18n'

const HEALTH_STYLES = {
  proposed: {
    dot: 'bg-slate-400',
    text: 'text-slate-300',
    bg: 'bg-slate-400/10 border border-slate-400/20',
  },
  alive: {
    dot: 'bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse',
    text: 'text-emerald-400',
    bg: 'bg-emerald-400/10 border border-emerald-400/25',
  },
  grace: {
    dot: 'bg-amber-400 shadow-sm shadow-amber-400/50 animate-pulse',
    text: 'text-amber-400',
    bg: 'bg-amber-400/10 border border-amber-400/25',
  },
  dead: {
    dot: 'bg-red-500',
    text: 'text-red-400',
    bg: 'bg-red-500/10 border border-red-400/25',
  },
  paused: {
    dot: 'bg-slate-500',
    text: 'text-slate-400',
    bg: 'bg-slate-500/10 border border-slate-500/20',
  },
  closed: {
    dot: 'bg-slate-700',
    text: 'text-slate-600',
    bg: 'bg-slate-600/8 border border-slate-600/15',
  },
}

interface StatusPillProps {
  stream: StreamData
  now: number
}

export function StatusPill({ stream, now }: StatusPillProps) {
  const health = getStreamHealth(stream, now)
  const cfg = HEALTH_STYLES[health]
  const { t } = useLang()

  const label = {
    proposed: t.status_proposed,
    alive:    t.status_alive,
    grace:    t.status_grace,
    dead:     t.status_dead,
    paused:   t.status_paused,
    closed:   t.status_closed,
  }[health]

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
      cfg.bg, cfg.text,
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
      {label}
    </span>
  )
}
