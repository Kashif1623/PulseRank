import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Languages } from 'lucide-react'
import { useLang, LANG_LABELS, LANG_FLAGS, type Lang } from '../../i18n'
import { cn } from '../utils'

const LANGS: Lang[] = ['en', 'ur', 'hi', 'bn']

export function LanguageSwitcher() {
  const { lang, setLang } = useLang()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Change language"
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all',
          open
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
            : 'border-white/10 bg-white/5 text-slate-400 hover:text-slate-200 hover:border-white/20',
        )}
      >
        <Languages size={12} />
        <span className="hidden sm:inline">{LANG_FLAGS[lang]}</span>
        <span className="hidden sm:inline text-[11px]">{LANG_LABELS[lang].split(' ')[0]}</span>
        <span className="sm:hidden">{LANG_FLAGS[lang]}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full mt-2 z-50 min-w-[148px] bg-[#141c2e] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
          >
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => { setLang(l); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left',
                  l === lang
                    ? 'bg-emerald-400/10 text-emerald-300'
                    : 'text-slate-300 hover:bg-white/[0.06]',
                )}
              >
                <span className="text-base leading-none">{LANG_FLAGS[l]}</span>
                <span>{LANG_LABELS[l]}</span>
                {l === lang && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
