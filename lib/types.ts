import { Address } from 'viem'

export interface VaultInfo {
  name: string
  symbol: string
  address: Address
  type: 'optimized' | 'maximized'
  strategies: StrategyInfo[]
  totalAssets: bigint
  totalSupply: bigint
  sharePrice: bigint
}

export interface StrategyInfo {
  id: number
  name: string
  address: Address
  allocationBps: number
  totalAssets: bigint
  riskLevel: 'low' | 'medium' | 'high'
}

export interface UserPosition {
  vaultAddress: Address
  shares: bigint
  assets: bigint
  sharePrice: bigint
}

export interface TransactionLog {
  id: string
  timestamp: Date
  type: 'deposit' | 'withdraw' | 'rebalance' | 'setAllocation'
  vault: string
  amount?: bigint
  shares?: bigint
  status: 'pending' | 'success' | 'failed'
  hash?: string
  error?: string
}

export interface DebugInfo {
  walletAddress?: Address
  chainId?: number
  balance?: bigint
  gasPrice?: bigint
  blockNumber?: bigint
  networkName?: string
}

export interface VaultMetrics {
  totalValueLocked: bigint
  totalShares: bigint
  sharePrice: bigint
  strategies: {
    [strategyId: number]: {
      assets: bigint
      allocation: number
      performance: number
    }
  }
}
