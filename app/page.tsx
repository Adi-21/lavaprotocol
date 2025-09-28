'use client'

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance, useChainId } from 'wagmi'
import { WalletConnectButton } from '@/components/WalletConnectButton'
import CrossChainDashboard from '@/components/CrossChainDashboard'
import { DebugConsole } from '@/components/DebugConsole'
import { NetworkStatus } from '@/components/NetworkStatus'
import { debugConsole } from '@/lib/debug-console'
import { CONTRACT_ADDRESSES, NETWORK_CONFIG } from '@/lib/contracts'
import { formatBTC, formatTokenAmount } from '@/lib/contract-utils'
import { VaultInfo } from '@/lib/types'
import { Wallet, Zap, Shield, TrendingUp } from 'lucide-react'

export default function Home() {
  return <CrossChainDashboard />
}
