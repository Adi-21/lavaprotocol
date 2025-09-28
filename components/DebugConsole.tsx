'use client'

import { useState, useEffect } from 'react'
import { useAccount, useBalance, useChainId } from 'wagmi'
import { TransactionLog, DebugInfo } from '@/lib/types'
import { debugConsole } from '@/lib/debug-console'
import { formatBTC } from '@/lib/contract-utils'
import { 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  Copy, 
  CheckCircle, 
  XCircle, 
  Clock,
  Info
} from 'lucide-react'
import toast from 'react-hot-toast'

export function DebugConsole() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { data: balance } = useBalance({ address })
  
  const [logs, setLogs] = useState<TransactionLog[]>([])
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({})
  const [isExpanded, setIsExpanded] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)

  useEffect(() => {
    const unsubscribeLogs = debugConsole.onLogsChange(setLogs)
    const unsubscribeDebug = debugConsole.onDebugInfoChange(setDebugInfo)
    
    return () => {
      unsubscribeLogs()
      unsubscribeDebug()
    }
  }, [])

  const getStatusIcon = (status: TransactionLog['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Info className="w-4 h-4 text-gray-500" />
    }
  }

  const getStatusColor = (status: TransactionLog['status']) => {
    switch (status) {
      case 'pending':
        return 'border-yellow-400 bg-yellow-50'
      case 'success':
        return 'border-green-400 bg-green-50'
      case 'failed':
        return 'border-red-400 bg-red-50'
      default:
        return 'border-gray-400 bg-gray-50'
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const clearLogs = () => {
    debugConsole.clearLogs()
    toast.success('Debug logs cleared')
  }

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-gray-900 text-white p-3 rounded-lg shadow-lg hover:bg-gray-800 transition-colors"
        >
          <Terminal className="w-5 h-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Terminal className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Debug Console</h3>
          <span className="text-sm text-gray-500">({logs.length} logs)</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={clearLogs}
            className="p-1 hover:bg-gray-100 rounded text-red-600"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 hover:bg-gray-100 rounded"
            title="Minimize"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Debug Info */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h4 className="text-sm font-medium text-gray-700 mb-2">System Info</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Wallet:</span>
            <span className="ml-2 font-mono">
              {debugInfo.walletAddress ? (
                <button
                  onClick={() => copyToClipboard(debugInfo.walletAddress!)}
                  className="text-blue-600 hover:underline"
                >
                  {debugInfo.walletAddress.slice(0, 6)}...{debugInfo.walletAddress.slice(-4)}
                </button>
              ) : (
                'Not connected'
              )}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Network:</span>
            <span className="ml-2">{debugInfo.networkName || 'Unknown'}</span>
          </div>
          <div>
            <span className="text-gray-600">Chain ID:</span>
            <span className="ml-2">{debugInfo.chainId || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-600">Balance:</span>
            <span className="ml-2">
              {debugInfo.balance ? formatBTC(debugInfo.balance) : '0'} cBTC
            </span>
          </div>
        </div>
      </div>

      {/* Logs */}
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No debug logs yet</p>
              <p className="text-sm">Interact with the vaults to see logs</p>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`debug-log ${getStatusColor(log.status)} p-3 rounded`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2 flex-1">
                      {getStatusIcon(log.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-sm">
                            {log.type.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTimestamp(log.timestamp)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 mt-1">
                          <span className="font-medium">{log.vault}</span>
                          {log.amount && (
                            <span className="ml-2">
                              Amount: {formatBTC(log.amount)} cBTC
                            </span>
                          )}
                          {log.shares && (
                            <span className="ml-2">
                              Shares: {formatBTC(log.shares)}
                            </span>
                          )}
                        </div>
                        {log.hash && (
                          <div className="text-xs text-gray-600 mt-1">
                            <button
                              onClick={() => copyToClipboard(log.hash!)}
                              className="font-mono hover:underline"
                            >
                              {log.hash.slice(0, 10)}...{log.hash.slice(-8)}
                            </button>
                          </div>
                        )}
                        {log.error && (
                          <div className="text-xs text-red-600 mt-1">
                            Error: {log.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Stats */}
      {!isExpanded && logs.length > 0 && (
        <div className="p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">
                Latest: {logs[0]?.type} - {logs[0]?.vault}
              </span>
              {getStatusIcon(logs[0]?.status || 'pending')}
            </div>
            <span className="text-gray-500">
              {logs.filter(log => log.status === 'pending').length} pending
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
