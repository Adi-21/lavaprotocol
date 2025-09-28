import { Address, formatUnits, parseUnits } from 'viem'
import { CONTRACT_ADDRESSES } from './contracts'
import { debugConsole } from './debug-console'

// Utility functions for contract interactions
export const formatTokenAmount = (amount: bigint, decimals: number = 18): string => {
  return formatUnits(amount, decimals)
}

export const parseTokenAmount = (amount: string, decimals: number = 18): bigint => {
  return parseUnits(amount, decimals)
}

export const formatBTC = (amount: bigint): string => {
  return formatUnits(amount, 8) // BTC has 8 decimals
}

export const parseBTC = (amount: string): bigint => {
  return parseUnits(amount, 8)
}

export const formatUSD = (amount: bigint): string => {
  return formatUnits(amount, 6) // USDC has 6 decimals
}

export const parseUSD = (amount: string): bigint => {
  return parseUnits(amount, 6)
}

// Contract address helpers
export const getContractAddress = (contractName: keyof typeof CONTRACT_ADDRESSES): Address => {
  const address = CONTRACT_ADDRESSES[contractName]
  if (!address || address === '0x...') {
    throw new Error(`Contract address not set for ${contractName}`)
  }
  return address
}

// Gas estimation helpers
export const estimateGasWithBuffer = (estimatedGas: bigint, bufferPercent: number = 20): bigint => {
  return (estimatedGas * BigInt(100 + bufferPercent)) / BigInt(100)
}

// Error handling helpers
export const parseContractError = (error: any): string => {
  if (error?.message) {
    // Common contract error patterns
    if (error.message.includes('insufficient funds')) {
      return 'Insufficient funds for transaction'
    }
    if (error.message.includes('user rejected')) {
      return 'Transaction rejected by user'
    }
    if (error.message.includes('gas')) {
      return 'Gas estimation failed or insufficient gas'
    }
    if (error.message.includes('revert')) {
      return 'Transaction reverted - check contract conditions'
    }
    return error.message
  }
  return 'Unknown error occurred'
}

// Transaction helpers
export const createTransactionLog = (
  type: 'deposit' | 'withdraw' | 'rebalance' | 'setAllocation',
  vault: string,
  amount?: bigint,
  shares?: bigint
) => {
  debugConsole.logTransactionStart(type, vault, amount)
}

export const logTransactionSuccess = (hash: string, amount?: bigint, shares?: bigint) => {
  debugConsole.logTransactionSuccess(hash, amount, shares)
}

export const logTransactionError = (error: any) => {
  const errorMessage = parseContractError(error)
  debugConsole.logTransactionError(errorMessage)
}

// Validation helpers
export const validateAmount = (amount: string, minAmount: bigint = 0n): boolean => {
  try {
    const parsed = parseBTC(amount)
    return parsed >= minAmount
  } catch {
    return false
  }
}

export const validateAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

// Price formatting helpers
export const formatPrice = (price: bigint, decimals: number = 18): string => {
  const formatted = formatUnits(price, decimals)
  const num = parseFloat(formatted)
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
}

export const formatPercentage = (value: bigint, decimals: number = 18): string => {
  const formatted = formatUnits(value, decimals)
  const num = parseFloat(formatted)
  return `${(num * 100).toFixed(2)}%`
}
