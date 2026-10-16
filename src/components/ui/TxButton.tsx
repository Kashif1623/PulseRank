import { cn } from '../utils'
import type { ReactNode } from 'react'
import { Loader2, CheckCircle2, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'

interface TxButtonProps {
  onClick?: () => void
  disabled?: boolean
  isPending?: boolean
  isConfirming?: boolean
  isSuccess?: boolean
  txHash?: `0x${string}`
  children: ReactNode
  variant?: 'primary' | 'ghost' | 'danger' | 'amber' | 'cyan'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  fullWidth?: boolean
}

const VARIANTS = {
  primary: 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white border border-emerald-400/30 shadow-lg shadow-emerald-500/20',
  ghost:   'bg-white/5 hover:bg-white/10 active:bg-white/15 text-slate-300 border border-white/10',
  danger:  'bg-red-500/15 hover:bg-red-500/25 active:bg-red-500/35 text-red-400 border border-red-400/25',
  amber:   'bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/35 text-amber-300 border border-amber-400/25',
  cyan:    'bg-cyan-500/15 hover:bg-cyan-500/25 active:bg-cyan-500/35 text-cyan-300 border border-cyan-400/25',
}

const SIZES = {
  sm: 'h-8 px-3 text-xs rounded-xl gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-2xl gap-2',
}

export function TxButton({
  onClick, disabled, isPending, isConfirming, isSuccess, txHash,
  children, variant = 'primary', size = 'md', className, fullWidth,
}: TxButtonProps) {
  const busy = isPending || isConfirming
  const done = isSuccess && !busy

  return (
    <motion.button
      whileTap={{ scale: busy || disabled ? 1 : 0.97 }}
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        'relative inline-flex items-center justify-center font-semibold transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        done && 'bg-emerald-600/20 border-emerald-400/30 text-emerald-300',
        className,
      )}
    >
      {busy && <Loader2 size={size === 'sm' ? 12 : 14} className="animate-spin shrink-0" />}
      {done && !busy && <CheckCircle2 size={size === 'sm' ? 12 : 14} className="text-emerald-400 shrink-0" />}

      <span className="truncate">
        {isPending ? 'Confirm in wallet…' : isConfirming ? 'Confirming…' : children}
      </span>

      {done && txHash && (
        <a
          href={`https://explorer.arc.io/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-1 text-emerald-400/70 hover:text-emerald-300 transition-colors shrink-0"
        >
          <ExternalLink size={11} />
        </a>
      )}
    </motion.button>
  )
}
