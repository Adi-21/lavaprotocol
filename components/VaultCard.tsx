'use client'

import { useState, useEffect, ReactNode } from 'react'
import { fetchStorkLatestPrice } from '@/lib/stork'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { VaultInfo } from '@/lib/types'
import { CONTRACT_ADDRESSES } from '@/lib/contracts'
import { formatBTC, parseBTC, createTransactionLog, logTransactionSuccess, logTransactionError } from '@/lib/contract-utils'
import { debugConsole } from '@/lib/debug-console'
import {
    TrendingUp,
    Shield,
    Zap,
    ArrowUpRight,
    ArrowDownLeft,
    Settings,
    Info,
    AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'

// Import actual ABIs from your compiled contracts
import obsidianVaultAbi from '@/abis/obsidian.json'
import magmaVaultAbi from '@/abis/magma.json'

const LAVA_OPTIMIZED_VAULT_ABI = obsidianVaultAbi
const LAVA_MAXIMIZED_VAULT_ABI = magmaVaultAbi

interface VaultCardProps {
    vault: VaultInfo
    isConnected: boolean
    isCorrectNetwork: boolean
}

export function VaultCard({ vault, isConnected, isCorrectNetwork }: VaultCardProps) {
    const { address } = useAccount()
    const { writeContract } = useWriteContract()

    const [depositAmount, setDepositAmount] = useState('')
    const [withdrawShares, setWithdrawShares] = useState('')
    const [leverageLoops, setLeverageLoops] = useState(1)
    const [isDepositing, setIsDepositing] = useState(false)
    const [isWithdrawing, setIsWithdrawing] = useState(false)
    const [isRebalancing, setIsRebalancing] = useState(false)
    const [isSettingAllocation, setIsSettingAllocation] = useState(false)
    const [newAllocation, setNewAllocation] = useState('')
    const [selectedStrategy, setSelectedStrategy] = useState(1)

    // Read vault data
    const { data: totalAssets, refetch: refetchTotalAssets } = useReadContract({
        address: vault.address,
        abi: vault.type === 'optimized' ? LAVA_OPTIMIZED_VAULT_ABI : LAVA_MAXIMIZED_VAULT_ABI,
        functionName: 'totalAssets',
    })

    const { data: totalSupply, refetch: refetchTotalSupply } = useReadContract({
        address: vault.address,
        abi: vault.type === 'optimized' ? LAVA_OPTIMIZED_VAULT_ABI : LAVA_MAXIMIZED_VAULT_ABI,
        functionName: 'totalSupply',
    })

    const { data: userBalance, refetch: refetchUserBalance } = useReadContract({
        address: vault.address,
        abi: vault.type === 'optimized' ? LAVA_OPTIMIZED_VAULT_ABI : LAVA_MAXIMIZED_VAULT_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
    })

    // Additional reads for MagmaVault
    const { data: healthFactor, refetch: refetchHealthFactor } = useReadContract({
        address: vault.address,
        abi: LAVA_MAXIMIZED_VAULT_ABI,
        functionName: 'getHealthFactor',
        query: { enabled: vault.type === 'maximized' },
    })

    const { data: leverageRatio, refetch: refetchLeverageRatio } = useReadContract({
        address: vault.address,
        abi: LAVA_MAXIMIZED_VAULT_ABI,
        functionName: 'getLeverageRatio',
        query: { enabled: vault.type === 'maximized' },
    })

    const { data: btcPrice, refetch: refetchBtcPrice, error: btcPriceError } = useReadContract({
        address: vault.address,
        abi: LAVA_MAXIMIZED_VAULT_ABI,
        functionName: 'getBtcPrice',
        query: {
            enabled: vault.type === 'maximized',
            retry: 1,
            retryDelay: 1000
        },
    })

    // Read raw collateral/debt for fallback math
    const { data: rawTotalCollateral } = useReadContract({
        address: vault.address,
        abi: LAVA_MAXIMIZED_VAULT_ABI,
        functionName: 'totalCollateral',
        query: { enabled: vault.type === 'maximized' },
    })
    const { data: rawTotalDebtUsd } = useReadContract({
        address: vault.address,
        abi: LAVA_MAXIMIZED_VAULT_ABI,
        functionName: 'totalDebtInUsd',
        query: { enabled: vault.type === 'maximized' },
    })

    // Call Zentra pool directly for health factor fallback
    const zentraPoolAbi = [
        {
            inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
            name: 'getUserAccountData',
            outputs: [
                { internalType: 'uint256', name: 'totalCollateralBase', type: 'uint256' },
                { internalType: 'uint256', name: 'totalDebtBase', type: 'uint256' },
                { internalType: 'uint256', name: 'availableBorrowsBase', type: 'uint256' },
                { internalType: 'uint256', name: 'currentLiquidationThreshold', type: 'uint256' },
                { internalType: 'uint256', name: 'ltv', type: 'uint256' },
                { internalType: 'uint256', name: 'healthFactor', type: 'uint256' }
            ],
            stateMutability: 'view',
            type: 'function',
        },
    ] as const

    const { data: zentraAccountData } = useReadContract({
        address: CONTRACT_ADDRESSES.ZENTRA_POOL,
        abi: zentraPoolAbi,
        functionName: 'getUserAccountData',
        args: [vault.address],
        query: { enabled: vault.type === 'maximized' },
    })

    // Read active strategy for MagmaVault
    const { data: activeStrategy, refetch: refetchActiveStrategy } = useReadContract({
        address: vault.address,
        abi: LAVA_MAXIMIZED_VAULT_ABI,
        functionName: 'activeStrategy',
        query: { enabled: vault.type === 'maximized' },
    })

    // Stork Oracle interface based on documentation
    const storkOracleAbi = [
        // Stork-specific interfaces
        {
            "inputs": [{ "internalType": "bytes32", "name": "assetId", "type": "bytes32" }],
            "name": "getTemporalNumericValueV1",
            "outputs": [
                { "internalType": "int64", "name": "value", "type": "int64" },
                { "internalType": "uint64", "name": "timestamp", "type": "uint64" }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [{ "internalType": "bytes32", "name": "assetId", "type": "bytes32" }],
            "name": "getTemporalNumericValueUnsafeV1",
            "outputs": [
                { "internalType": "int64", "name": "value", "type": "int64" },
                { "internalType": "uint64", "name": "timestamp", "type": "uint64" }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [{ "internalType": "bytes32", "name": "assetId", "type": "bytes32" }],
            "name": "getLatestValue",
            "outputs": [
                { "internalType": "int256", "name": "value", "type": "int256" },
                { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        // Standard Chainlink interface (fallback)
        {
            "inputs": [],
            "name": "latestRoundData",
            "outputs": [
                { "internalType": "uint80", "name": "roundId", "type": "uint80" },
                { "internalType": "int256", "name": "answer", "type": "int256" },
                { "internalType": "uint256", "name": "startedAt", "type": "uint256" },
                { "internalType": "uint256", "name": "updatedAt", "type": "uint256" },
                { "internalType": "uint80", "name": "answeredInRound", "type": "uint80" }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "latestAnswer",
            "outputs": [{ "internalType": "int256", "name": "", "type": "int256" }],
            "stateMutability": "view",
            "type": "function"
        }
    ]

    // BTC/USD Asset IDs for Stork (testing both)
    const btcUsdAssetId1 = "0x7404e3d104ea7841c3d9e6fd20adfe99b4ad586bc08d8f3bd3afef894cf184de" // From Stork REST API docs
    const btcUsdAssetId2 = "0xf04a4325765aeffae0c22a3d7bb622ca016173c413d6d627fee6f64dd86d2150" // User provided - test this first
    const btcUsdAssetId = btcUsdAssetId2 // Use the user-provided one first

    // Try Stork-specific oracle methods with BITCOINUSD (correct Asset ID)
    const { data: storkTemporalValue, refetch: refetchStorkTemporal, error: storkTemporalError } = useReadContract({
        address: CONTRACT_ADDRESSES.BTC_USD_ORACLE,
        abi: storkOracleAbi,
        functionName: 'getTemporalNumericValueV1',
        args: [btcUsdAssetId],
        query: { enabled: vault.type === 'maximized' },
    })

    // Unsafe variant (no staleness check)
    const { data: storkTemporalUnsafe, error: storkTemporalUnsafeError } = useReadContract({
        address: CONTRACT_ADDRESSES.BTC_USD_ORACLE,
        abi: storkOracleAbi,
        functionName: 'getTemporalNumericValueUnsafeV1',
        args: [btcUsdAssetId],
        query: { enabled: vault.type === 'maximized' },
    })

    // Also test with the old BTCUSD Asset ID for comparison
    const { data: storkTemporalValueOld, error: storkTemporalErrorOld } = useReadContract({
        address: CONTRACT_ADDRESSES.BTC_USD_ORACLE,
        abi: storkOracleAbi,
        functionName: 'getTemporalNumericValueV1',
        args: [btcUsdAssetId1], // The old BTCUSD Asset ID
        query: { enabled: vault.type === 'maximized' },
    })

    // Test BOTH oracle addresses from contracts.md
    const oldOracleAddress = "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43" as const
    const storkOracleAddress = "0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62" as const

    // Test old oracle with Chainlink interface
    const { data: oldOracleLatestRound, error: oldOracleError } = useReadContract({
        address: oldOracleAddress,
        abi: [{"inputs": [], "name": "latestRoundData", "outputs": [{"internalType": "uint80", "name": "roundId", "type": "uint80"}, {"internalType": "int256", "name": "answer", "type": "int256"}, {"internalType": "uint256", "name": "startedAt", "type": "uint256"}, {"internalType": "uint256", "name": "updatedAt", "type": "uint256"}, {"internalType": "uint80", "name": "answeredInRound", "type": "uint80"}], "stateMutability": "view", "type": "function"}],
        functionName: 'latestRoundData',
        query: { enabled: vault.type === 'maximized' },
    })

    const { data: oldOracleLatestAnswer, error: oldOracleAnswerError } = useReadContract({
        address: oldOracleAddress,
        abi: [{"inputs": [], "name": "latestAnswer", "outputs": [{"internalType": "int256", "name": "", "type": "int256"}], "stateMutability": "view", "type": "function"}],
        functionName: 'latestAnswer',
        query: { enabled: vault.type === 'maximized' },
    })

    // Test Stork oracle with simpler interface
    const { data: storkSimpleValue, error: storkSimpleError } = useReadContract({
        address: storkOracleAddress,
        abi: [{"inputs": [], "name": "latestAnswer", "outputs": [{"internalType": "int256", "name": "", "type": "int256"}], "stateMutability": "view", "type": "function"}],
        functionName: 'latestAnswer',
        query: { enabled: vault.type === 'maximized' },
    })

    const { data: storkLatestValue, refetch: refetchStorkLatest, error: storkLatestError } = useReadContract({
        address: CONTRACT_ADDRESSES.BTC_USD_ORACLE,
        abi: storkOracleAbi,
        functionName: 'getLatestValue',
        args: [btcUsdAssetId],
        query: { enabled: vault.type === 'maximized' },
    })

    // Fallback to standard oracle interfaces
    const { data: storkLatestRoundData, refetch: refetchStorkLatestRound, error: storkLatestRoundError } = useReadContract({
        address: CONTRACT_ADDRESSES.BTC_USD_ORACLE,
        abi: storkOracleAbi,
        functionName: 'latestRoundData',
        query: { enabled: vault.type === 'maximized' },
    })

    const { data: storkLatestAnswer, refetch: refetchStorkLatestAnswer, error: storkLatestAnswerError } = useReadContract({
        address: CONTRACT_ADDRESSES.BTC_USD_ORACLE,
        abi: storkOracleAbi,
        functionName: 'latestAnswer',
        query: { enabled: vault.type === 'maximized' },
    })

    // Calculate share price
    const sharePrice = totalAssets && totalSupply && (totalSupply as bigint) > BigInt(0)
        ? ((totalAssets as bigint) * BigInt(10 ** 18)) / (totalSupply as bigint) // 18 decimals
        : BigInt(10 ** 18) // 1:1 if no shares

    const userAssets = userBalance ? ((userBalance as bigint) * sharePrice) / BigInt(10 ** 18) : BigInt(0)

    const showUserPosition = typeof userBalance === 'bigint' && (userBalance as bigint) > BigInt(0)

    // Mock BTC price for when oracle fails
    const mockBtcPrice = 119670 // fixed demo price USD

    // Fallback metrics using fixed price
    const fallbackBtcPriceE8 = BigInt(mockBtcPrice) * BigInt(1e8)
    const fallbackCollateralUsd = rawTotalCollateral ? ((rawTotalCollateral as bigint) * fallbackBtcPriceE8) / BigInt(1e8) : BigInt(0)
    const fallbackDebtUsd = (rawTotalDebtUsd as bigint) || BigInt(0)
    const fallbackLeverageRatio = (() => {
        if (!rawTotalCollateral || (rawTotalCollateral as bigint) === BigInt(0)) return '1.00x (Mock)'
        const cv = fallbackCollateralUsd
        if (cv <= fallbackDebtUsd) return '∞'
        const lr = Number((cv * BigInt(1e18)) / (cv - fallbackDebtUsd)) / 1e18
        if (!isFinite(lr)) return '∞'
        return lr.toFixed(2) + 'x'
    })()
    const fallbackHealthFactor = (() => {
        if (zentraAccountData) {
            const hf = (zentraAccountData as any)[5] as bigint
            return (Number(hf) / 1e18).toFixed(2)
        }
        // Basic approximation if pool data not available
        if (fallbackCollateralUsd === BigInt(0)) return '1.50'
        const ratio = Number((fallbackCollateralUsd * BigInt(1e18)) / (fallbackDebtUsd === BigInt(0) ? BigInt(1) : fallbackDebtUsd)) / 1e18
        return Math.max(0, Math.min(ratio, 10)).toFixed(2)
    })()

    // Check if user has balance
    const hasUserBalance = Boolean(userBalance && (userBalance as bigint) > BigInt(0))

    // Helper function to check if a value is max uint256 (indicates contract revert)
    const isMaxUint256 = (value: any) => {
        if (!value) return false
        const maxUint256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')
        return (value as bigint) === maxUint256
    }

    // Helper function to format health factor
    const formatHealthFactor = (value: any) => {
        if (!value) return '1.50 (Mock)'
        if (isMaxUint256(value)) return '1.50 (Mock)'

        try {
            const hfBigInt = value as bigint
            // Additional check for extremely large numbers
            if (hfBigInt > BigInt(1e30)) return '1.50 (Mock)'

            const hf = Number(hfBigInt) / 1e18
            // Check if the result is a reasonable health factor (between 0.1 and 100)
            if (hf < 0.1 || hf > 100) return '1.50 (Mock)'

            return hf.toFixed(2)
        } catch (error) {
            console.log('Error formatting health factor:', error)
            return '1.50 (Mock)'
        }
    }

    // Helper function to format leverage ratio
    const formatLeverageRatio = (value: any) => {
        if (!value) return '1.00x (Mock)'
        if (isMaxUint256(value)) return '1.00x (Mock)'

        try {
            const lrBigInt = value as bigint
            // Additional check for extremely large numbers
            if (lrBigInt > BigInt(1e30)) return '1.00x (Mock)'

            const lr = Number(lrBigInt) / 1e18
            // Check if the result is a reasonable leverage ratio (between 0.1 and 10)
            if (lr < 0.1 || lr > 10) return '1.00x (Mock)'

            return lr.toFixed(2) + 'x'
        } catch (error) {
            console.log('Error formatting leverage ratio:', error)
            return '1.00x (Mock)'
        }
    }



    // Stork REST price fallback state
    const [storkRestPrice, setStorkRestPrice] = useState<null | { symbol: string; price: bigint; timestampNs: bigint }>(null)

    async function refreshStorkRestPrice() {
        if (vault.type !== 'maximized') return
        const res = await fetchStorkLatestPrice()
        setStorkRestPrice(res)
    }

    // Fetch Stork REST price on mount
    useEffect(() => {
        refreshStorkRestPrice()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vault.type])

    // Update debug info
    useEffect(() => {
        const debugData: any = {
            [`${vault.symbol}_totalAssets`]: totalAssets,
            [`${vault.symbol}_totalSupply`]: totalSupply,
            [`${vault.symbol}_sharePrice`]: sharePrice,
            [`${vault.symbol}_userBalance`]: userBalance,
        }

        // Add MagmaVault specific data
        if (vault.type === 'maximized') {
            debugData[`${vault.symbol}_activeStrategy`] = activeStrategy
            debugData[`${vault.symbol}_totalAssets`] = totalAssets
            debugData[`${vault.symbol}_totalSupply`] = totalSupply
            debugData[`${vault.symbol}_userBalance`] = userBalance
            debugData[`${vault.symbol}_healthFactor_raw`] = healthFactor
            debugData[`${vault.symbol}_healthFactor_formatted`] = formatHealthFactor(healthFactor)
            debugData[`${vault.symbol}_leverageRatio_raw`] = leverageRatio  
            debugData[`${vault.symbol}_leverageRatio_formatted`] = formatLeverageRatio(leverageRatio)
            debugData[`${vault.symbol}_btcPrice`] = btcPrice
            debugData[`${vault.symbol}_btcPriceError`] = btcPriceError
            debugData[`${vault.symbol}_btcPrice_source`] = btcPriceError ? (storkRestPrice ? `Stork REST (${storkRestPrice.symbol})` : 'MOCK (Oracle failed)') : 'Contract getBtcPrice()'
            
            // Add all Stork oracle attempts
            debugData[`${vault.symbol}_storkOracle_tests`] = {
                // Stork-specific methods
                getTemporalNumericValueV1: {
                    data: storkTemporalValue,
                    error: storkTemporalError?.message || null,
                    formatted: storkTemporalValue ? (() => {
                        const [value, timestamp] = storkTemporalValue as [bigint, bigint]
                        return {
                            price: `$${(Number(value) / 1e18).toFixed(2)}`, // Stork uses 18 decimals
                            timestamp: new Date(Number(timestamp) * 1000).toISOString()
                        }
                    })() : null
                },
                getTemporalNumericValueUnsafeV1: {
                    data: storkTemporalUnsafe,
                    error: storkTemporalUnsafeError?.message || null,
                    formatted: storkTemporalUnsafe ? (() => {
                        const [value, timestamp] = storkTemporalUnsafe as [bigint, bigint]
                        return {
                            price: `$${(Number(value) / 1e18).toFixed(2)}`,
                            timestamp: new Date(Number(timestamp) * 1000).toISOString()
                        }
                    })() : null
                },
                getLatestValue: {
                    data: storkLatestValue,
                    error: storkLatestError?.message || null,
                    formatted: storkLatestValue ? (() => {
                        const [value, timestamp] = storkLatestValue as [bigint, bigint]
                        return {
                            price: `$${(Number(value) / 1e18).toFixed(2)}`, // Stork uses 18 decimals
                            timestamp: new Date(Number(timestamp) * 1000).toISOString()
                        }
                    })() : null
                },
                // Fallback methods
                latestRoundData: {
                    data: storkLatestRoundData,
                    error: storkLatestRoundError?.message || null
                },
                latestAnswer: {
                    data: storkLatestAnswer,
                    error: storkLatestAnswerError?.message || null,
                    formatted: storkLatestAnswer ? `$${(Number(storkLatestAnswer as bigint) / 1e8).toFixed(2)}` : null
                },
                restLatest: storkRestPrice ? {
                    symbol: storkRestPrice.symbol,
                    price: `$${(Number(storkRestPrice.price) / 1e18).toFixed(2)}`,
                    timestamp: new Date(Number(storkRestPrice.timestampNs / BigInt(1_000_000))).toISOString()
                } : { error: 'No REST price (missing token or API error)' }
            }

            // Parse latestRoundData if available
            if (storkLatestRoundData) {
                const [roundId, answer, startedAt, updatedAt, answeredInRound] = storkLatestRoundData as [bigint, bigint, bigint, bigint, bigint]
                debugData[`${vault.symbol}_storkOracle_latestRound_parsed`] = {
                    roundId: roundId.toString(),
                    answer: answer.toString(),
                    priceUSD: (Number(answer) / 1e8).toFixed(2),
                    startedAt: new Date(Number(startedAt) * 1000).toISOString(),
                    updatedAt: new Date(Number(updatedAt) * 1000).toISOString(),
                    answeredInRound: answeredInRound.toString()
                }
            }
            
            // Add strategy status
            if (activeStrategy !== undefined) {
                debugData[`${vault.symbol}_strategy_status`] = `Active Strategy: ${activeStrategy} ${Number(activeStrategy) === 3 ? '(Zentra Leverage - ACTIVE)' : '(NOT ZENTRA LEVERAGE)'}`
            } else {
                debugData[`${vault.symbol}_strategy_status`] = 'Loading active strategy...'
            }
            
            // Add deposit status checks
            debugData[`${vault.symbol}_deposit_check`] = {
                hasAssets: totalAssets ? `${totalAssets} wei` : 'No assets',
                hasShares: totalSupply ? `${totalSupply} shares` : 'No shares',
                userHasShares: userBalance ? `${userBalance} user shares` : 'No user shares',
                strategyActive: Number(activeStrategy) === 3 ? 'YES' : 'NO',
                vaultAddress: vault.address,
                oracleAddress: CONTRACT_ADDRESSES.BTC_USD_ORACLE
            }

            // Add working oracle detection
            const workingOracle = 
                storkTemporalValue ? 'getTemporalNumericValueV1' :
                storkLatestValue ? 'getLatestValue' :
                storkLatestRoundData ? 'latestRoundData' :
                storkLatestAnswer ? 'latestAnswer' : 
                'NONE'
            
            debugData[`${vault.symbol}_working_oracle`] = workingOracle
            
            if (workingOracle !== 'NONE') {
                let realPrice = null
                if (storkTemporalValue) {
                    const [value] = storkTemporalValue as [bigint, bigint]
                    realPrice = `$${(Number(value) / 1e18).toFixed(2)}`
                } else if (storkLatestValue) {
                    const [value] = storkLatestValue as [bigint, bigint]
                    realPrice = `$${(Number(value) / 1e18).toFixed(2)}`
                } else if (storkLatestAnswer) {
                    realPrice = `$${(Number(storkLatestAnswer as bigint) / 1e8).toFixed(2)}`
                }
                debugData[`${vault.symbol}_real_oracle_price`] = realPrice
            }
            
            // Add warnings for max uint256 values
            if (isMaxUint256(healthFactor)) {
                debugData[`${vault.symbol}_healthFactor_status`] = 'CONTRACT REVERTING - using mock value'
            } else if (healthFactor) {
                debugData[`${vault.symbol}_healthFactor_status`] = 'LIVE DATA from contract'
            }
            if (isMaxUint256(leverageRatio)) {
                debugData[`${vault.symbol}_leverageRatio_status`] = 'CONTRACT REVERTING - using mock value'
            } else if (leverageRatio) {
                debugData[`${vault.symbol}_leverageRatio_status`] = 'LIVE DATA from contract'
            }
            if (btcPriceError) {
                debugData[`${vault.symbol}_btcPrice_status`] = 'ORACLE ERROR - using mock value'
            }
        }

        debugConsole.updateDebugInfo(debugData)
    }, [totalAssets, totalSupply, sharePrice, userBalance, healthFactor, leverageRatio, btcPrice, vault.symbol, vault.type])

    const handleDeposit = async () => {
        if (!isConnected || !isCorrectNetwork) {
            toast.error('Please connect wallet and switch to correct network')
            return
        }

        if (!depositAmount || parseFloat(depositAmount) <= 0) {
            toast.error('Please enter a valid amount')
            return
        }

        try {
            setIsDepositing(true)
            const amount = parseBTC(depositAmount)

            console.log('🚀 Starting deposit:', {
                vault: vault.name,
                amount: amount.toString(),
                leverageLoops,
                address,
                activeStrategy
            })

            createTransactionLog('deposit', vault.name, amount)

            await writeContract({
                address: vault.address,
                abi: vault.type === 'optimized' ? LAVA_OPTIMIZED_VAULT_ABI : LAVA_MAXIMIZED_VAULT_ABI,
                functionName: 'deposit',
                args: vault.type === 'optimized'
                    ? [address]
                    : [BigInt(leverageLoops), address],
                value: amount,
            })

            logTransactionSuccess('deposit_tx', amount)
            toast.success('Deposit transaction submitted!')
            console.log('✅ Deposit transaction submitted successfully')
            setDepositAmount('')

            // Refetch data after a delay
            console.log('🔄 Refetching contract data in 3 seconds...')
            setTimeout(() => {
                console.log('🔄 Refetching all contract data now...')
                refetchTotalAssets()
                refetchTotalSupply()
                refetchUserBalance()
                if (vault.type === 'maximized') {
                    refetchActiveStrategy()
                    refetchHealthFactor()
                    refetchLeverageRatio()
                    refetchBtcPrice()
                }
            }, 3000)
        } catch (error) {
            logTransactionError(error)
            toast.error('Deposit failed')
        } finally {
            setIsDepositing(false)
        }
    }

    const handleWithdraw = async () => {
        if (!isConnected || !isCorrectNetwork) {
            toast.error('Please connect wallet and switch to correct network')
            return
        }

        if (!withdrawShares || parseFloat(withdrawShares) <= 0) {
            toast.error('Please enter a valid amount')
            return
        }

        try {
            setIsWithdrawing(true)
            const shares = BigInt(Math.floor(parseFloat(withdrawShares) * 10 ** 18)) // Convert to wei

            createTransactionLog('withdraw', vault.name, undefined, shares)

            await writeContract({
                address: vault.address,
                abi: vault.type === 'optimized' ? LAVA_OPTIMIZED_VAULT_ABI : LAVA_MAXIMIZED_VAULT_ABI,
                functionName: 'withdraw',
                args: [shares, address],
            })

            logTransactionSuccess('withdraw_tx', undefined, shares)
            toast.success('Withdraw transaction submitted!')
            setWithdrawShares('')

            // Refetch data after a delay
            setTimeout(() => {
                refetchTotalAssets()
                refetchTotalSupply()
                refetchUserBalance()
                if (vault.type === 'maximized') {
                    refetchHealthFactor()
                    refetchLeverageRatio()
                    refetchBtcPrice()
                }
            }, 2000)
        } catch (error) {
            logTransactionError(error)
            toast.error('Withdraw failed')
        } finally {
            setIsWithdrawing(false)
        }
    }

    const handleRebalance = async () => {
        if (!isConnected || !isCorrectNetwork) {
            toast.error('Please connect wallet and switch to correct network')
            return
        }

        try {
            setIsRebalancing(true)

            createTransactionLog('rebalance', vault.name)

            await writeContract({
                address: vault.address,
                abi: LAVA_OPTIMIZED_VAULT_ABI,
                functionName: 'rebalance',
            })

            logTransactionSuccess('rebalance_tx')
            toast.success('Rebalance transaction submitted!')

            // Refetch data after a delay
            setTimeout(() => {
                refetchTotalAssets()
                refetchTotalSupply()
                refetchUserBalance()
                if (vault.type === 'maximized') {
                    refetchHealthFactor()
                    refetchLeverageRatio()
                    refetchBtcPrice()
                }
            }, 2000)
        } catch (error) {
            logTransactionError(error)
            toast.error('Rebalance failed')
        } finally {
            setIsRebalancing(false)
        }
    }

    const handleSetAllocation = async () => {
        if (!isConnected || !isCorrectNetwork) {
            toast.error('Please connect wallet and switch to correct network')
            return
        }

        if (!newAllocation || parseFloat(newAllocation) < 0 || parseFloat(newAllocation) > 100) {
            toast.error('Please enter a valid allocation (0-100)')
            return
        }

        try {
            setIsSettingAllocation(true)
            const allocationBps = BigInt(Math.floor(parseFloat(newAllocation) * 100)) // Convert to basis points

            createTransactionLog('setAllocation', vault.name, allocationBps)

            await writeContract({
                address: vault.address,
                abi: LAVA_OPTIMIZED_VAULT_ABI,
                functionName: 'setAllocation',
                args: [BigInt(selectedStrategy), allocationBps],
            })

            logTransactionSuccess('setAllocation_tx', allocationBps)
            toast.success('Allocation updated!')
            setNewAllocation('')

            // Refetch data after a delay
            setTimeout(() => {
                refetchTotalAssets()
                refetchTotalSupply()
                refetchUserBalance()
                if (vault.type === 'maximized') {
                    refetchHealthFactor()
                    refetchLeverageRatio()
                    refetchBtcPrice()
                }
            }, 2000)
        } catch (error) {
            logTransactionError(error)
            toast.error('Set allocation failed')
        } finally {
            setIsSettingAllocation(false)
        }
    }

    const getRiskColor = (riskLevel: string) => {
        switch (riskLevel) {
            case 'low': return 'text-green-600 bg-green-100'
            case 'medium': return 'text-yellow-600 bg-yellow-100'
            case 'high': return 'text-red-600 bg-red-100'
            default: return 'text-gray-600 bg-gray-100'
        }
    }

    const getRiskIcon = (riskLevel: string) => {
        switch (riskLevel) {
            case 'low': return <Shield className="w-4 h-4" />
            case 'medium': return <AlertTriangle className="w-4 h-4" />
            case 'high': return <Zap className="w-4 h-4" />
            default: return <Info className="w-4 h-4" />
        }
    }

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className={`p-6 ${vault.type === 'optimized' ? 'bg-gradient-to-r from-green-500 to-blue-500' : 'bg-gradient-to-r from-orange-500 to-red-500'}`}>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white">{vault.name}</h3>
                        <p className="text-white/80 text-sm">{vault.symbol}</p>
                    </div>
                    <div className="text-right text-white">
                        <div className="text-2xl font-bold">
                            {totalAssets ? formatBTC(totalAssets as bigint) : '0'} cBTC
                        </div>
                        <div className="text-sm opacity-80">Total Assets</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-6">
                {/* Vault Stats */}
                <div className="grid gap-4 mb-6 grid-cols-2">
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-sm text-gray-600 mb-1">Share Price</div>
                        <div className="text-lg font-semibold">
                            {formatBTC(sharePrice as bigint)} cBTC
                        </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-sm text-gray-600 mb-1">Total Shares</div>
                        <div className="text-lg font-semibold">
                            {totalSupply ? formatBTC(totalSupply as bigint) : '0'}
                        </div>
                    </div>

                    {/* Additional stats for MagmaVault */}
                    {vault.type === 'maximized' && (
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="text-sm text-gray-600 mb-1">Health Factor</div>
                            <div className={`text-lg font-semibold ${isMaxUint256(healthFactor) ? 'text-yellow-600' : 'text-green-600'}`}>
                                {formatHealthFactor(healthFactor)}
                            </div>
                            {isMaxUint256(healthFactor) ? (
                                <div className="text-xs text-yellow-600 mt-1">
                                    ⚠️ Contract function reverting - using mock value
                                </div>
                            ) : healthFactor ? (
                                <div className="text-xs text-green-600 mt-1">
                                    ✅ Live from contract
                                </div>
                            ) : (
                                <div className="text-xs text-gray-500 mt-1">
                                    📊 Loading...
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Additional row for MagmaVault leverage and BTC price */}
                {vault.type === 'maximized' ? (
                    <div className="grid gap-4 mb-6 grid-cols-2">
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="text-sm text-gray-600 mb-1">Leverage Ratio</div>
                            <div className="text-lg font-semibold">
                                {leverageRatio ? formatLeverageRatio(leverageRatio) : fallbackLeverageRatio}
                            </div>
                            {isMaxUint256(leverageRatio) ? (
                                <div className="text-xs text-yellow-600 mt-1">
                                    Contract function reverting - using mock value
                                </div>
                            ) : (
                                <div className="text-xs text-gray-500 mt-1">
                                    Real-time leverage
                                </div>
                            )}
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="text-sm text-gray-600 mb-1">BTC Price</div>
                            <div className="text-lg font-semibold">
                                {btcPrice ? `$${(Number(btcPrice as bigint) / 1e8).toLocaleString()}` :
                                    storkRestPrice ? `$${(Number(storkRestPrice.price) / 1e18).toLocaleString()} (REST)` :
                                    `$${mockBtcPrice.toLocaleString()} (Fixed)`}
                            </div>
                            {btcPriceError && !storkRestPrice && (
                                <div className="text-xs text-yellow-600 mt-1">
                                    Oracle not available - using mock price
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* User Position */}
                {Boolean(showUserPosition) ? (
                    <div className="bg-blue-50 rounded-lg p-4 mb-6">
                        <div className="text-sm text-blue-600 mb-1">Your Position</div>
                        <div className="text-lg font-semibold text-blue-800">
                            {formatBTC(userAssets)} cBTC
                        </div>
                        <div className="text-sm text-blue-600">
                            {formatBTC(userBalance as bigint)} shares
                        </div>
                    </div>
                ) : null}

                {/* Strategies */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-gray-700">Strategies</h4>
                        {vault.type === 'maximized' && (
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                Number(activeStrategy) === 3 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-red-100 text-red-700'
                            }`}>
                                {Number(activeStrategy) === 3 
                                    ? '✅ Strategy 3 Active' 
                                    : `❌ Strategy ${activeStrategy || 0} (Need 3)`
                                }
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        {vault.strategies.map((strategy) => (
                            <div key={strategy.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center space-x-3">
                                    {getRiskIcon(strategy.riskLevel)}
                                    <span className="font-medium">{strategy.name}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(strategy.riskLevel)}`}>
                                        {strategy.riskLevel}
                                    </span>
                                    <span className="text-sm text-gray-600">
                                        {(strategy.allocationBps / 100).toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Deposit Section */}
                <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Deposit</h4>
                    <div className="space-y-3">
                        {vault.type === 'maximized' && (
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Leverage Loops</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={leverageLoops}
                                    onChange={(e) => setLeverageLoops(parseInt(e.target.value) || 1)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">Amount (cBTC)</label>
                            <input
                                type="number"
                                step="0.00000001"
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                placeholder="0.0"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            />
                        </div>
                        <button
                            onClick={handleDeposit}
                            disabled={!isConnected || !isCorrectNetwork || isDepositing}
                            className="w-full flex items-center justify-center space-x-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white py-2 px-4 rounded-lg transition-colors"
                        >
                            {isDepositing ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                                <ArrowUpRight className="w-4 h-4" />
                            )}
                            <span>{isDepositing ? 'Depositing...' : 'Deposit'}</span>
                        </button>
                    </div>
                </div>

                {/* Withdraw Section */}
                {userBalance && (userBalance as bigint) > BigInt(0) && (
                    <div className="mb-6">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">Withdraw</h4>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Shares</label>
                                <input
                                    type="number"
                                    step="0.00000001"
                                    value={withdrawShares}
                                    onChange={(e) => setWithdrawShares(e.target.value)}
                                    placeholder="0.0"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                />
                            </div>
                            <button
                                onClick={handleWithdraw}
                                disabled={!isConnected || !isCorrectNetwork || isWithdrawing}
                                className="w-full flex items-center justify-center space-x-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white py-2 px-4 rounded-lg transition-colors"
                            >
                                {isWithdrawing ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <ArrowDownLeft className="w-4 h-4" />
                                )}
                                <span>{isWithdrawing ? 'Withdrawing...' : 'Withdraw'}</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Debug Controls - Only for Maximized Vault */}
                {vault.type === 'maximized' && (
                    <div className="border-t border-gray-200 pt-6 mb-6">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">Debug Controls</h4>
                        <div className="space-y-3">
                            <button
                onClick={() => {
                  console.log('🔄 Testing contract calls...')
                  console.log('📊 Current Data:', {
                    activeStrategy,
                    healthFactor,
                    leverageRatio,
                    btcPrice,
                    btcPriceError: btcPriceError?.message,
                    totalAssets,
                    totalSupply,
                    userBalance
                  })
                  
                  console.log('🔮 Oracle Tests - ASSET ID COMPARISON:', {
                    // BITCOINUSD Asset ID (0xf04a...)
                    BITCOINUSD_temporal: storkTemporalValue,
                    BITCOINUSD_temporalError: storkTemporalError?.message,
                    BITCOINUSD_temporalUnsafe: storkTemporalUnsafe,
                    BITCOINUSD_temporalUnsafeError: storkTemporalUnsafeError?.message,
                    BITCOINUSD_latest: storkLatestValue,
                    BITCOINUSD_latestError: storkLatestError?.message,
                    
                    // BTCUSD Asset ID (0x7404...)
                    BTCUSD_temporal: storkTemporalValueOld,
                    BTCUSD_temporalError: storkTemporalErrorOld?.message,
                    
                    // Old Oracle (0x1b44...)
                    oldOracleLatestRound,
                    oldOracleError: oldOracleError?.message,
                    oldOracleLatestAnswer,
                    oldOracleAnswerError: oldOracleAnswerError?.message,
                  })

                  // Determine working oracle
                  const temporal = storkTemporalValue as unknown as [bigint, bigint] | undefined
                  const temporalUnsafe = storkTemporalUnsafe as unknown as [bigint, bigint] | undefined
                  const temporalOld = storkTemporalValueOld as unknown as [bigint, bigint] | undefined
                  const latest = storkLatestValue as unknown as [bigint, bigint] | undefined

                  const workingOraclePrice = temporal?.[0] || temporalUnsafe?.[0] || temporalOld?.[0] || latest?.[0] || oldOracleLatestAnswer || storkSimpleValue
                  const workingOracleSource = temporal?.[0] ? 'BITCOINUSD_TEMPORAL' :
                                            temporalUnsafe?.[0] ? 'BITCOINUSD_TEMPORAL_UNSAFE' :
                                            temporalOld?.[0] ? 'BTCUSD_TEMPORAL' :
                                            latest?.[0] ? 'BITCOINUSD_LATEST' : 
                                            oldOracleLatestAnswer ? 'OLD_ORACLE' : 
                                            storkSimpleValue ? 'STORK_SIMPLE' : 'NONE'
                  
                  console.log('💰 Working Oracle:', {
                    source: workingOracleSource,
                    rawPrice: workingOraclePrice,
                    formattedPrice: workingOraclePrice ? 
                      `$${(Number(workingOraclePrice as bigint) / (workingOracleSource.includes('OLD') ? 1e8 : 1e18)).toLocaleString()}` : 
                      'N/A'
                  })
                  
                  refetchActiveStrategy()
                  refetchBtcPrice()
                  refetchHealthFactor()
                  refetchLeverageRatio()
                  refetchTotalAssets()
                  refetchTotalSupply()
                  refetchUserBalance()
                  // Test all Stork oracle methods
                  refetchStorkTemporal()
                  refetchStorkLatest()
                  refetchStorkLatestRound()
                  refetchStorkLatestAnswer()
                  // Refresh REST price
                  ;(async () => { await refreshStorkRestPrice() })()
                  
                  console.log('✅ Refetch commands sent!')
                }}
                                className="w-full bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors"
                            >
                                Refresh All Data
                            </button>

                            <button
                                onClick={async () => {
                                    try {
                                        console.log('Setting active strategy to 3...')
                                        await writeContract({
                                            address: vault.address,
                                            abi: LAVA_MAXIMIZED_VAULT_ABI,
                                            functionName: 'setActiveStrategy',
                                            args: [BigInt(3)],
                                        })
                                        toast.success('Active strategy set to 3 (Zentra Leverage)!')
                                        setTimeout(() => {
                                            refetchActiveStrategy()
                                            refetchHealthFactor()
                                            refetchLeverageRatio()
                                        }, 2000)
                                    } catch (error) {
                                        console.error('Failed to set active strategy:', error)
                                        toast.error('Failed to set active strategy')
                                    }
                                }}
                                disabled={!isConnected || !isCorrectNetwork}
                                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-2 px-4 rounded-lg transition-colors"
                            >
                                🎯 Activate Strategy 3 (Zentra Leverage)
                            </button>
                        </div>
                    </div>
                )}

                {/* Admin Controls - Only for Optimized Vault */}
                {vault.type === 'optimized' && (
                    <div className="border-t border-gray-200 pt-6">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">Admin Controls</h4>

                        {/* Rebalance */}
                        <div className="mb-4">
                            <button
                                onClick={handleRebalance}
                                disabled={!isConnected || !isCorrectNetwork || isRebalancing}
                                className="w-full flex items-center justify-center space-x-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-2 px-4 rounded-lg transition-colors"
                            >
                                {isRebalancing ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <Settings className="w-4 h-4" />
                                )}
                                <span>{isRebalancing ? 'Rebalancing...' : 'Rebalance Portfolio'}</span>
                            </button>
                        </div>

                        {/* Set Allocation */}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Strategy</label>
                                <select
                                    value={selectedStrategy}
                                    onChange={(e) => setSelectedStrategy(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                >
                                    <option value={1}>Zentra Lending</option>
                                    <option value={2}>Satsuma LP</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Allocation (%)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={newAllocation}
                                    onChange={(e) => setNewAllocation(e.target.value)}
                                    placeholder="60.0"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                />
                            </div>
                            <button
                                onClick={handleSetAllocation}
                                disabled={!isConnected || !isCorrectNetwork || isSettingAllocation}
                                className="w-full flex items-center justify-center space-x-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white py-2 px-4 rounded-lg transition-colors"
                            >
                                {isSettingAllocation ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <Settings className="w-4 h-4" />
                                )}
                                <span>{isSettingAllocation ? 'Setting...' : 'Set Allocation'}</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
