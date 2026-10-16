import { AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { useLang } from '../../i18n'

export function NotDeployedBanner() {
  const { t } = useLang()
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto px-4 pt-8"
    >
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-6 flex gap-4">
        <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/25 flex items-center justify-center shrink-0 mt-0.5">
          <AlertCircle size={16} className="text-amber-400" />
        </div>
        <div>
          <p className="font-semibold text-amber-300 mb-1">{t.not_deployed_title}</p>
          <p className="text-sm text-slate-400 leading-relaxed">{t.not_deployed_body}</p>
          <code className="mt-3 block text-xs mono text-slate-500 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.07]">
            bun run contracts:export
          </code>
        </div>
      </div>
    </motion.div>
  )
}
