/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Alchemy API key; used to build the Arc Mainnet URL when VITE_ALCHEMY_ARC_MAINNET_URL is empty. */
  readonly VITE_ALCHEMY_API_KEY?: string;
  /** Full Alchemy HTTPS URL for Arc Mainnet (primary RPC). */
  readonly VITE_ALCHEMY_ARC_MAINNET_URL?: string;
  /** Optional override for the fallback RPC (defaults to https://rpc.mainnet.arc.io). */
  readonly VITE_ARC_FALLBACK_RPC_URL?: string;
}
