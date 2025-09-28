import { TransactionLog, DebugInfo } from './types'

class DebugConsole {
  private logs: TransactionLog[] = []
  private debugInfo: DebugInfo = {}
  private listeners: ((logs: TransactionLog[]) => void)[] = []
  private debugListeners: ((info: DebugInfo) => void)[] = []

  // Transaction logging
  addLog(log: Omit<TransactionLog, 'id' | 'timestamp'>) {
    const newLog: TransactionLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    }
    
    this.logs.unshift(newLog) // Add to beginning for newest first
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(0, 100) // Keep only last 100 logs
    }
    
    console.log('🔍 Debug Log:', newLog)
    this.notifyListeners()
  }

  updateLog(id: string, updates: Partial<TransactionLog>) {
    const index = this.logs.findIndex(log => log.id === id)
    if (index !== -1) {
      this.logs[index] = { ...this.logs[index], ...updates }
      console.log('🔄 Log Updated:', this.logs[index])
      this.notifyListeners()
    }
  }

  getLogs(): TransactionLog[] {
    return [...this.logs]
  }

  clearLogs() {
    this.logs = []
    console.log('🧹 Debug logs cleared')
    this.notifyListeners()
  }

  // Debug info management
  updateDebugInfo(info: Partial<DebugInfo>) {
    this.debugInfo = { ...this.debugInfo, ...info }
    console.log('📊 Debug Info Updated:', this.debugInfo)
    this.notifyDebugListeners()
  }

  getDebugInfo(): DebugInfo {
    return { ...this.debugInfo }
  }

  // Event listeners
  onLogsChange(callback: (logs: TransactionLog[]) => void) {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback)
    }
  }

  onDebugInfoChange(callback: (info: DebugInfo) => void) {
    this.debugListeners.push(callback)
    return () => {
      this.debugListeners = this.debugListeners.filter(listener => listener !== callback)
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.logs))
  }

  private notifyDebugListeners() {
    this.debugListeners.forEach(listener => listener(this.debugInfo))
  }

  // Utility methods
  logTransactionStart(type: TransactionLog['type'], vault: string, amount?: bigint) {
    this.addLog({
      type,
      vault,
      amount,
      status: 'pending',
    })
  }

  logTransactionSuccess(hash: string, amount?: bigint, shares?: bigint) {
    const lastLog = this.logs[0]
    if (lastLog && lastLog.status === 'pending') {
      this.updateLog(lastLog.id, {
        status: 'success',
        hash,
        amount: amount || lastLog.amount,
        shares: shares || lastLog.shares,
      })
    }
  }

  logTransactionError(error: string) {
    const lastLog = this.logs[0]
    if (lastLog && lastLog.status === 'pending') {
      this.updateLog(lastLog.id, {
        status: 'failed',
        error,
      })
    }
  }
}

// Singleton instance
export const debugConsole = new DebugConsole()
