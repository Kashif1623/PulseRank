import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Trophy, Coins } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'

import { Leaderboard } from './components/Leaderboard'
import { FunderDashboard } from './components/FunderDashboard'
import { AgentDashboard } from './components/AgentDashboard'
import { LanguageSwitcher } from './components/ui/LanguageSwitcher'
import { cn } from './components/utils'
import { ARC_MAINNET_ID } from './config'
import {
  LangContext, TRANSLATIONS, type Lang,
} from './i18n'

type Tab = 'leaderboard' | 'funder' | 'agent'

function NetworkBadge() {
  const { chainId, isConnected } = useAccount()
  if (!isConnected) return null
  const isArc = chainId === ARC_MAINNET_ID
  return (
    <div className={cn(
      'hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
      isArc
        ? 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-400'
        : 'border-amber-400/25 bg-amber-400/[0.08] text-amber-400',
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', isArc ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse')} />
      {isArc ? 'Arc Mainnet' : 'Wrong Network'}
    </div>
  )
}

// Ambient glow orbs behind the content
function AmbientBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute -top-64 left-1/4 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.04] blur-3xl" />
      <div className="absolute top-1/3 -right-64 w-[500px] h-[500px] rounded-full bg-cyan-500/[0.03] blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-amber-500/[0.03] blur-3xl" />
    </div>
  )
}

const TABS: { id: Tab; labelKey: keyof ReturnType<typeof TRANSLATIONS['en'] extends infer T ? () => T : never>; icon: typeof Trophy }[] = [
  { id: 'leaderboard', labelKey: 'nav_leaderboard', icon: Trophy },
  { id: 'funder',      labelKey: 'nav_funder',      icon: Coins },
  { id: 'agent',       labelKey: 'nav_agent',        icon: Activity },
] as const

export default function App() {
  const [tab, setTab] = useState<Tab>('leaderboard')
  const [lang, setLang] = useState<Lang>('en')
  const t = TRANSLATIONS[lang]

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-gradient)' }}>
        <AmbientBackground />

        {/* ── Top navbar ─────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-black/25 backdrop-blur-xl">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
            {/* Wordmark */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-400/15 border border-emerald-400/25 flex items-center justify-center">
                <TokenUSDC size={14} variant="branded" />
              </div>
              <span className="display font-semibold text-white text-[15px] tracking-tight">PulseRank</span>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2">
              <NetworkBadge />
              <LanguageSwitcher />
              <ConnectKitButton
                customTheme={{
                  '--ck-font-family': "'DM Sans', sans-serif",
                  '--ck-primary-button-background': '#10b981',
                  '--ck-primary-button-hover-background': '#34d399',
                  '--ck-primary-button-color': '#fff',
                  '--ck-body-background': '#0f172a',
                  '--ck-body-color': '#f0f4ff',
                  '--ck-border-radius': '18px',
                  '--ck-connectbutton-border-radius': '14px',
                  '--ck-connectbutton-background': 'rgba(255,255,255,0.06)',
                  '--ck-connectbutton-hover-background': 'rgba(255,255,255,0.10)',
                  '--ck-connectbutton-color': '#e2e8f0',
                  '--ck-connectbutton-border': '1px solid rgba(255,255,255,0.10)',
                }}
              />
            </div>
          </div>
        </header>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        {/* Desktop/tablet: inline below header */}
        <div className="sticky top-14 z-30 border-b border-white/[0.07] bg-black/15 backdrop-blur-sm hidden sm:block">
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex gap-0">
              {TABS.map(({ id, labelKey, icon: Icon }) => {
                const active = tab === id
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={cn(
                      'relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors duration-150',
                      active ? 'text-white' : 'text-slate-500 hover:text-slate-300',
                    )}
                  >
                    <Icon size={13} />
                    {t[labelKey]}
                    {active && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-t-full"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="flex-1 pt-5 pb-4 relative z-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {tab === 'leaderboard' && <Leaderboard />}
              {tab === 'funder' && <FunderDashboard />}
              {tab === 'agent' && <AgentDashboard />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.09] bg-black/50 backdrop-blur-xl safe-bottom">
          <div className="flex">
            {TABS.map(({ id, labelKey, icon: Icon }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors',
                    active ? 'text-emerald-400' : 'text-slate-600 active:text-slate-400',
                  )}
                >
                  <div className="relative">
                    <Icon size={20} />
                    {active && (
                      <motion.div
                        layoutId="mobile-tab-dot"
                        className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400"
                        transition={{ type: 'spring', stiffness: 600, damping: 40 }}
                      />
                    )}
                  </div>
                  {t[labelKey]}
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </LangContext.Provider>
  )
}
