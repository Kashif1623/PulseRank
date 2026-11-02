/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

// Arc Mainnet (chain ID 5042) — USDC as gas token
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
})

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arcMainnet.id, arcMainnet.rpcUrls.default.http[0])

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
      [arcMainnet.id]: http('https://rpc.mainnet.arc.io'),
      [arcTestnet.id]: http(),
      [mainnet.id]:    http(),
    },
  }),
)
