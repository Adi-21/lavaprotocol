'use client'

import { useChainId } from 'wagmi'
import { NETWORK_CONFIG } from '@/lib/contracts'
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'

export function NetworkStatus() {
  const chainId = useChainId()
  const isCorrectNetwork = chainId === NETWORK_CONFIG.chainId

  if (isCorrectNetwork) {
    return (
      <div className="flex items-center space-x-2 text-green-600">
        <CheckCircle className="w-4 h-4" />
        <span className="text-sm font-medium">{NETWORK_CONFIG.name}</span>
      </div>
    )
  }

  if (chainId) {
    return (
      <div className="flex items-center space-x-2 text-red-600">
        <XCircle className="w-4 h-4" />
        <span className="text-sm font-medium">Wrong Network</span>
      </div>
    )
  }

  return (
    <div className="flex items-center space-x-2 text-yellow-600">
      <AlertCircle className="w-4 h-4" />
      <span className="text-sm font-medium">No Network</span>
    </div>
  )
}
