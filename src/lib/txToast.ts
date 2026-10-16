/**
 * Transaction toast helpers — rich feedback with explorer links.
 */
import { toast } from 'sonner'

const ARC_EXPLORER = 'https://explorer.arc.io'

export function txPending(message: string) {
  return toast.loading(message, { id: 'tx-pending', duration: Infinity })
}

export function txSuccess(message: string, txHash?: `0x${string}`) {
  toast.dismiss('tx-pending')
  toast.success(message, {
    duration: 6000,
    action: txHash
      ? {
          label: 'View tx',
          onClick: () => window.open(`${ARC_EXPLORER}/tx/${txHash}`, '_blank'),
        }
      : undefined,
  })
}

export function txError(message: string, err?: unknown) {
  toast.dismiss('tx-pending')
  const detail = getRevertReason(err)
  toast.error(detail ? `${message}: ${detail}` : message, { duration: 8000 })
}

function getRevertReason(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const e = err as Record<string, unknown>
  // viem ContractFunctionRevertedError
  if (typeof e['shortMessage'] === 'string') return e['shortMessage']
  if (typeof e['message'] === 'string') {
    const msg = e['message']
    // strip long viem stack noise
    const match = msg.match(/reverted with the following reason:\s*(.+)/i)
    if (match) return match[1].trim().slice(0, 80)
    return msg.slice(0, 80)
  }
  return null
}

export function copyToast(label: string) {
  toast.success(label, { duration: 1800 })
}
