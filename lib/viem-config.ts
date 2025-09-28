import { createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'
import { NETWORK_CONFIG } from './contracts'

// Define Citrea Testnet chain
export const citreaTestnet = {
  id: NETWORK_CONFIG.chainId,
  name: NETWORK_CONFIG.name,
  nativeCurrency: {
    decimals: 18,
    name: 'Citrea',
    symbol: 'CITREA',
  },
  rpcUrls: {
    default: {
      http: [NETWORK_CONFIG.rpcUrl],
    },
    public: {
      http: [NETWORK_CONFIG.rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: 'Citrea Explorer',
      url: NETWORK_CONFIG.blockExplorer,
    },
  },
  testnet: true,
} as const

// Wagmi configuration
export const config = createConfig({
  chains: [citreaTestnet, mainnet, sepolia],
  connectors: [
    injected(),
    metaMask(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
    }),
  ],
  transports: {
    [citreaTestnet.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})

export type Config = typeof config
