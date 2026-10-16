/**
 * Lightweight tooltip using Floating UI–style positioning (pure CSS + framer-motion).
 * No extra deps needed — uses CSS absolute positioning with a Portal escape via body.
 */
import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle } from 'lucide-react'
import { cn } from '../utils'

interface TooltipProps {
  content: ReactNode
  children?: ReactNode
  /** Show a default (?) icon trigger when children omitted */
  icon?: boolean
  className?: string
  maxWidth?: string
}

export function Tooltip({ content, children, icon = false, className, maxWidth = '260px' }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)

  const show = () => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({
      top: r.top + window.scrollY - 8,   // above trigger
      left: r.left + r.width / 2,
    })
    setOpen(true)
  }

  const hide = () => setOpen(false)

  // Close on scroll / resize
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, { passive: true })
    window.addEventListener('resize', close, { passive: true })
    return () => {
      window.removeEventListener('scroll', close)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-label="More info"
        className={cn('inline-flex items-center cursor-pointer select-none outline-none', className)}
      >
        {icon || !children ? (
          <HelpCircle size={13} className="text-slate-500 hover:text-slate-300 transition-colors" />
        ) : (
          children
        )}
      </span>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.14 }}
              style={{
                position: 'absolute',
                top: pos.top,
                left: pos.left,
                transform: 'translate(-50%, -100%)',
                maxWidth,
                zIndex: 9999,
              }}
              className="pointer-events-none"
            >
              <div className="bg-[#1a2235] border border-white/15 rounded-2xl px-4 py-3 shadow-2xl shadow-black/60 text-sm text-slate-200 leading-relaxed">
                {content}
              </div>
              {/* Arrow */}
              <div
                className="mx-auto mt-[-1px]"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid rgba(255,255,255,0.15)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

interface TooltipCardProps {
  title: string
  body: string
}

export function TooltipCard({ title, body }: TooltipCardProps) {
  return (
    <div>
      <p className="font-semibold text-white mb-1">{title}</p>
      <p className="text-slate-400 text-xs leading-relaxed">{body}</p>
    </div>
  )
}
