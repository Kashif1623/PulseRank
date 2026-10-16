import { useState, useEffect } from 'react'
import { formatCountdown } from '../../contracts'
import { cn } from '../utils'

interface CountdownProps {
  targetSecs: number   // unix timestamp of deadline (or seconds-remaining via prop)
  mode?: 'deadline' | 'elapsed' // deadline = counts down to 0, elapsed = counts up from 0
  className?: string
}

export function Countdown({ targetSecs, mode = 'deadline', className }: CountdownProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = mode === 'deadline' ? Math.max(0, targetSecs - now) : now - targetSecs
  const isUrgent = mode === 'deadline' && remaining < 300 && remaining > 0
  const isExpired = mode === 'deadline' && remaining === 0

  return (
    <span className={cn(
      'tabular mono text-sm',
      isExpired ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-slate-300',
      className,
    )}>
      {isExpired ? 'Expired' : formatCountdown(remaining)}
    </span>
  )
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
