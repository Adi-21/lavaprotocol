'use client'

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Wallet, LogOut, ChevronDown } from 'lucide-react'
import { debugConsole } from '@/lib/debug-console'

export function WalletConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const [isOpen, setIsOpen] = useState(false)

  const handleConnect = async (connector: any) => {
    try {
      debugConsole.addLog({
        type: 'deposit', // Using deposit type for wallet connection
        vault: 'Wallet Connection',
        status: 'pending',
      })
      
      await connect({ connector })
      
      debugConsole.addLog({
        type: 'deposit',
        vault: 'Wallet Connection',
        status: 'success',
        hash: 'wallet_connected',
      })
    } catch (error) {
      debugConsole.addLog({
        type: 'deposit',
        vault: 'Wallet Connection',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Connection failed',
      })
    }
  }

  const handleDisconnect = () => {
    try {
      debugConsole.addLog({
        type: 'withdraw', // Using withdraw type for wallet disconnection
        vault: 'Wallet Connection',
        status: 'pending',
      })
      
      disconnect()
      
      debugConsole.addLog({
        type: 'withdraw',
        vault: 'Wallet Connection',
        status: 'success',
        hash: 'wallet_disconnected',
      })
    } catch (error) {
      debugConsole.addLog({
        type: 'withdraw',
        vault: 'Wallet Connection',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Disconnection failed',
      })
    }
  }

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Wallet className="w-4 h-4" />
          <span className="hidden sm:inline">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <ChevronDown className="w-4 h-4" />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
            <div className="px-4 py-2 text-sm text-gray-600 border-b border-gray-100">
              {address}
            </div>
            <button
              onClick={() => {
                handleDisconnect()
                setIsOpen(false)
              }}
              className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <LogOut className="w-4 h-4" />
              <span>Disconnect</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
      >
        <Wallet className="w-4 h-4" />
        <span>Connect Wallet</span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                handleConnect(connector)
                setIsOpen(false)
              }}
              className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Wallet className="w-4 h-4" />
              <span>{connector.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
