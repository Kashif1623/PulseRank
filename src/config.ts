/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { defineChain, type Transport } from 'viem'
import { injected } from 'wagmi/connectors'
import { getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

// ── RPC providers for Arc Mainnet ────────────────────────────────────────────
// Alchemy is the primary when configured; Circle's public endpoint is the automatic fallback.
// Alchemy keys are public in a browser app (Vite ships every VITE_ value), so restrict the key to
// your domains in the Alchemy dashboard.
const ARC_PUBLIC_RPC = 'https://rpc.mainnet.arc.io'

function httpsUrl(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  return v && /^https:\/\//i.test(v) ? v : undefined;
}

const alchemyKey = import.meta.env.VITE_ALCHEMY_API_KEY?.trim();
const ALCHEMY_ARC_URL =
  httpsUrl(import.meta.env.VITE_ALCHEMY_ARC_MAINNET_URL) ??
  (alchemyKey ? `https://arc-mainnet.g.alchemy.com/v2/${alchemyKey}` : undefined);
const ARC_FALLBACK_URL = httpsUrl(import.meta.env.VITE_ARC_FALLBACK_RPC_URL) ?? ARC_PUBLIC_RPC;

// Arc Mainnet (chain ID 5042) — USDC as gas token
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  // Public endpoint only: this is what wallets see when adding the chain, so it never carries a key.
  rpcUrls: { default: { http: [ARC_PUBLIC_RPC] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
})

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arcMainnet.id, ARC_PUBLIC_RPC)
if (ALCHEMY_ARC_URL) registerChain(arcMainnet.id, ALCHEMY_ARC_URL)
if (ARC_FALLBACK_URL !== ARC_PUBLIC_RPC) registerChain(arcMainnet.id, ARC_FALLBACK_URL)

// ── Cooldown: skip a failing provider for a while instead of waiting for it on every call ───────
const COOLDOWN_MS = 60_000

/** True for "the provider is unavailable or out of credits" (not for reverts or bad requests). */
function isProviderOutage(error: unknown): boolean {
  let e: unknown = error
  for (let depth = 0; e && depth < 6; depth++) {
    const err = e as { name?: string; status?: number; code?: number; message?: string; cause?: unknown }
    if (typeof err.status === 'number' && (err.status === 429 || err.status >= 500)) return true
    if (err.name === 'TimeoutError' || err.name === 'HttpRequestError' && err.status === undefined) return true
    if (err.code === 429) return true
    const msg = err.message ?? ''
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) return true
    if (/(exceeded|reached).{0,60}(capacity|compute units|rate limit|monthly|limit)|too many requests|rate.?limit/i.test(msg)) return true
    e = err.cause
  }
  return false
}

/** Wraps a transport: after an outage-type failure it throws immediately for COOLDOWN_MS, so viem's
 *  fallback() moves straight to the next provider. Reverts and bad requests never start a cooldown. */
function withCooldown(inner: Transport, cooldownMs = COOLDOWN_MS): Transport {
  return (params) => {
    const transport = inner(params)
    let pausedUntil = 0
    return {
      ...transport,
      request: (async (args: Parameters<typeof transport.request>[0]) => {
        if (Date.now() < pausedUntil) throw new Error('RPC provider paused after a recent failure; using the next provider')
        try {
          return await transport.request(args)
        } catch (error) {
          if (isProviderOutage(error)) pausedUntil = Date.now() + cooldownMs
          throw error
        }
      }),
    }
  }
}

// Order is fixed (rank: false): Alchemy first, then the Arc endpoint. With no Alchemy URL configured
// the app behaves exactly as before, with the Arc endpoint only.
const arcMainnetTransport: Transport = ALCHEMY_ARC_URL
  ? fallback(
      [
        withCooldown(http(ALCHEMY_ARC_URL, { timeout: 8_000, retryCount: 1, retryDelay: 300 })),
        http(ARC_FALLBACK_URL, { timeout: 15_000, retryCount: 3, retryDelay: 600 }),
      ],
      { rank: false, retryCount: 1 },
    )
  : http(ARC_FALLBACK_URL)

export const config = createConfig(
  getDefaultConfig({
    // App metadata — shown in WalletConnect modal and mobile wallet popups
    appName:        'PulseRank',
    appDescription: 'Autonomous AI agent monitoring and escrow protocol on Arc Mainnet.',
    appUrl:         'https://www.pulserank.tech',
    appIcon:        'https://www.pulserank.tech/logo.svg',
    walletConnectProjectId: 'pulserank',   // placeholder; replace with real WC project ID for production

    chains: [arcMainnet, arcTestnet, mainnet],
    connectors: [injected()],
    transports: {
      [arcMainnet.id]: arcMainnetTransport,
      [arcTestnet.id]: http(),
      [mainnet.id]:    http(),
    },
  }),
)
