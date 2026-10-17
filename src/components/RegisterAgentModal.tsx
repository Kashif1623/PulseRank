import { useState, useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { motion } from 'framer-motion'
import { X, UserPlus, CheckCircle } from 'lucide-react'

import { REGISTRY_ABI, REGISTRY_ADDRESS, parseUsdc } from '../contracts'
import { ARC_MAINNET_ID } from '../config'
import { TxButton } from './ui/TxButton'
import { cn } from './utils'
import { useLang } from '../i18n'
import { txSuccess, txError } from '../lib/txToast'

const CHAIN = ARC_MAINNET_ID

/** Encode a short ASCII string as bytes32 (right-padded with 0x00) */
function encodeBytes32(str: string): `0x${string}` {
  const clean = str.trim().slice(0, 31) // max 31 chars to be safe
  let hex = '0x'
  for (let i = 0; i < 32; i++) {
    const code = i < clean.length ? clean.charCodeAt(i) : 0
    hex += code.toString(16).padStart(2, '0')
  }
  return hex as `0x${string}`
}

interface Props {
  onClose: () => void
  isRegistered: boolean
}

export function RegisterAgentModal({ onClose, isRegistered }: Props) {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { t } = useLang()

  const [name, setName] = useState('')
  const [profileURI, setProfileURI] = useState('')
  const [minRate, setMinRate] = useState('0')

  const isWrongChain = chainId !== CHAIN

  const { writeContract, data: txHash, isPending, error: txErr } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (isSuccess) {
      txSuccess(t.toast_registered, txHash)
      onClose()
    }
  }, [isSuccess, txHash, t.toast_registered, onClose])

  useEffect(() => {
    if (txErr) txError(t.toast_tx_error, txErr)
  }, [txErr, t.toast_tx_error])

  const handleRegister = useCallback(() => {
    if (isWrongChain) { switchChain({ chainId: CHAIN }); return }
    const nameBytes = encodeBytes32(name)
    const minRateUnits = parseUsdc(minRate || '0')
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: 'registerAgent',
      args: [nameBytes, profileURI, minRateUnits],
      chainId: CHAIN,
    })
  }, [isWrongChain, switchChain, writeContract, name, profileURI, minRate])

  const canSubmit = name.trim().length > 0 && name.trim().length <= 31

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
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 pt-6 pb-4 bg-[#101624] border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
              <UserPlus size={14} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="display font-semibold text-base text-white leading-none">
                {t.register_agent}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">{t.register_agent_subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/[0.07] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-4">
          {/* Already registered banner */}
          {isRegistered && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2.5">
              <CheckCircle size={14} className="text-emerald-400 shrink-0" />
              <p className="text-xs text-emerald-300">{t.already_registered}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-[11px] text-slate-500 uppercase tracking-widest mb-1.5 block font-medium">
              {t.register_name}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_\-.]/g, '').slice(0, 31))}
              placeholder={t.register_name_placeholder}
              maxLength={31}
              spellCheck={false}
              className="w-full bg-white/[0.05] border border-white/[0.09] rounded-xl px-3 py-2.5 text-sm mono text-slate-200 placeholder-slate-700 focus:outline-none focus:border-cyan-400/50 focus:bg-white/[0.07] transition-all"
            />
            <div className="flex justify-between mt-1">
              <p className="text-[10px] text-slate-700">ASCII only, max 31 chars</p>
              <p className={cn('text-[10px] tabular', name.length > 28 ? 'text-amber-400' : 'text-slate-700')}>
                {name.length}/31
              </p>
            </div>
          </div>

          {/* Profile URI */}
          <div>
            <label className="text-[11px] text-slate-500 uppercase tracking-widest mb-1.5 block font-medium">
              {t.register_profile_uri}
            </label>
            <input
              value={profileURI}
              onChange={(e) => setProfileURI(e.target.value)}
              placeholder={t.register_profile_uri_placeholder}
              type="url"
              className="w-full bg-white/[0.05] border border-white/[0.09] rounded-xl px-3 py-2.5 text-sm mono text-slate-200 placeholder-slate-700 focus:outline-none focus:border-cyan-400/50 focus:bg-white/[0.07] transition-all"
            />
          </div>

          {/* Min daily rate */}
          <div>
            <label className="text-[11px] text-slate-500 uppercase tracking-widest mb-1.5 block font-medium">
              {t.register_min_rate}
            </label>
            <div className="relative">
              <input
                value={minRate}
                onChange={(e) => setMinRate(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                className="w-full bg-white/[0.05] border border-white/[0.09] rounded-xl px-3 py-2.5 text-sm tabular text-slate-200 placeholder-slate-700 focus:outline-none focus:border-cyan-400/50 pr-16 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-semibold">USDC/d</span>
            </div>
            <p className="text-[10px] text-slate-700 mt-1">{t.register_min_rate_hint}</p>
          </div>

          {/* CTA */}
          {isWrongChain ? (
            <TxButton onClick={() => switchChain({ chainId: CHAIN })} fullWidth variant="amber" size="lg">
              {t.switch_to_arc}
            </TxButton>
          ) : (
            <TxButton
              onClick={handleRegister}
              isPending={isPending}
              isConfirming={isConfirming}
              txHash={txHash}
              disabled={!canSubmit || isRegistered}
              fullWidth
              size="lg"
              variant="cyan"
            >
              <UserPlus size={15} />
              {t.register_submit}
            </TxButton>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
