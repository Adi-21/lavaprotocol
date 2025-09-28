import { Address } from 'viem'

// Contract addresses (update these with your deployed addresses)
export const CONTRACT_ADDRESSES = {
  // Citrea Testnet addresses - synced from scripts/strategy6-addresses.json
  LAVA_CROSS_CHAIN_VAULT: '0x8e9C493D07FF9a37d136104D53b0Cf519B6764dE' as Address,
  LAVA_PORTFOLIO_VAULT: '0xd9d51BbeFadafF71bB36a94bDdda70f678fDd6c1' as Address,
  WC_BTC: '0x3173b5fB1509D68Ca5037b0B2066833B168Cb058' as Address,
  USDC: '0x752cadd7df548F0AC22e33a46f039bcF090054B7' as Address,
  ZENTRA_POOL: '0xAe5d5a5365823E2Ec3afc1d9481A2cedc51b7590' as Address,
  MOCK_YIELD_SOURCE: '0xcF29CE838e8fFD542311650fA3A69133Aa702931' as Address,
  MOCK_BRIDGE: '0xF5934A72CA6Eeb656cDDdce1877240Dc9b4F8199' as Address,
  ZENTRA_ADAPTER: '0xbD3AC2F76A03813027F48E41D7af6789dA3C9C4E' as Address,
  SATSUMA_ADAPTER: '0xBF39CdeE0da03e946A11c43deBd15f9Dc8cEB8Bd' as Address,
  CROSSCHAIN_ADAPTER: '0xD6887b286584e8243e0Ebe19d3C7AF177988CaCc' as Address,
  SATSUMA_LP_VAULT: '0x92Eb3df28871c5A5396e25eb0dF8CC652A96513B' as Address,
} as const

// Network configuration
export const NETWORK_CONFIG = {
  chainId: 5115, // Citrea Testnet chain ID - update this
  name: 'Citrea Testnet',
  rpcUrl: 'https://rpc.testnet.citrea.xyz', // Update with actual RPC URL
  blockExplorer: 'https://explorer.testnet.citrea.xyz', // Update with actual explorer
} as const

// Contract ABIs will be imported from the abis folder
export type ContractName = keyof typeof CONTRACT_ADDRESSES
