'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useBlockNumber } from 'wagmi'
import { parseEther } from 'viem'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { CONTRACT_ADDRESSES } from '@/lib/contracts'
import portfolioAbi from '@/abis/lavaPortfolioVault.json'
import crossAbi from '@/abis/lavaCrossChainVault.json'
import { WalletConnectButton } from './WalletConnectButton'

function formatAddress(addr?: string) {
    if (!addr) return '-'
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatUnitsDec(value?: number, decimals: number = 8) {
    if (value === undefined || value === null || Number.isNaN(value)) return '0.00000000'
    const n = value / Math.pow(10, decimals)
    return n.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })
}

function formatBTC(value?: number | bigint, fromDecimals: number = 8) {
    if (value === undefined || value === null) return '0.00000000'
    const numValue = typeof value === 'bigint' ? Number(value) : value
    if (Number.isNaN(numValue)) return '0.00000000'

    // If the value is already in decimal form (< 1000 and has decimals), don't convert
    const btcAmount = numValue > 1000 && Number.isInteger(numValue)
        ? numValue / Math.pow(10, fromDecimals)  // Convert from wei/satoshi format
        : numValue  // Already in decimal format

    // For very small amounts, show more precision
    if (btcAmount < 0.001) {
        return btcAmount.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })
    }
    // For normal amounts, show reasonable precision
    else if (btcAmount < 1) {
        return btcAmount.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })
    }
    // For larger amounts, show fewer decimals
    else if (btcAmount < 1000) {
        return btcAmount.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    }
    // For very large amounts, show minimal decimals
    else {
        return btcAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
}

function formatShares(value?: number | bigint) {
    if (value === undefined || value === null) return '0.00000000'
    const numValue = typeof value === 'bigint' ? Number(value) : value
    if (Number.isNaN(numValue)) return '0.00000000'

    // Check if this is raw share value (like 11701) vs wei format
    // If the number is small and doesn't look like wei, treat it as raw shares
    if (numValue > 0 && numValue < 1e12) {
        // This looks like raw shares, not wei format
        return numValue.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        })
    }

    // Otherwise, treat as 18-decimal format
    const shareAmount = numValue / 1e18

    // Always show shares in a readable format, avoid scientific notation
    if (shareAmount === 0) {
        return '0.00000000'
    } else if (shareAmount < 0.00000001) {
        // For extremely small amounts, show more precision
        return shareAmount.toFixed(12)
    } else if (shareAmount < 0.001) {
        return shareAmount.toFixed(10)
    } else if (shareAmount < 1) {
        return shareAmount.toFixed(8)
    } else {
        return shareAmount.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })
    }
}

function formatSharesForDeposit(value?: number | bigint) {
    if (value === undefined || value === null) return '0'
    const numValue = typeof value === 'bigint' ? Number(value) : value
    if (Number.isNaN(numValue)) return '0'

    // Check if this is raw share value vs wei format (same logic as formatShares)
    if (numValue > 0 && numValue < 1e12) {
        // This looks like raw shares, not wei format
        return numValue.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        })
    }

    const shareAmount = numValue / 1e18

    // For deposit display, show user-friendly format
    if (shareAmount === 0) {
        return '0'
    } else if (shareAmount < 0.000001) {
        return '< 0.000001' // Show "less than" for very small amounts
    } else if (shareAmount < 0.01) {
        return shareAmount.toFixed(6)
    } else if (shareAmount < 1) {
        return shareAmount.toFixed(4)
    } else {
        return shareAmount.toFixed(2)
    }
}

function calculateExpectedShares(depositAmount: string, totalAssets?: bigint, totalSupply?: bigint, decimals: number = 18): string {
    if (!depositAmount || !totalAssets || !totalSupply) return '0'

    const depositValue = parseFloat(depositAmount || '0')
    if (depositValue <= 0) return '0'

    // For payable deposit functions, always use 18 decimals (wei)
    const depositWei = BigInt(Math.floor(depositValue * 1e18))

    // ERC-4626 share calculation: shares = supply == 0 ? assets : (assets * totalSupply) / totalAssets
    let expectedShares: bigint
    if (Number(totalSupply) === 0) {
        expectedShares = depositWei
    } else {
        expectedShares = (depositWei * totalSupply) / totalAssets
    }

    const sharesDecimal = Number(expectedShares) / 1e18

    // Format for display
    if (sharesDecimal === 0) {
        return '0'
    } else if (sharesDecimal < 0.000001) {
        return '< 0.000001'
    } else if (sharesDecimal < 0.01) {
        return sharesDecimal.toFixed(6)
    } else if (sharesDecimal < 1) {
        return sharesDecimal.toFixed(4)
    } else {
        return sharesDecimal.toFixed(2)
    }
}

export default function CrossChainDashboard() {
    const { address, isConnected } = useAccount()
    const { writeContract } = useWriteContract()
    const CLEAN_UI = true

    // Reads
    // Read live portfolio config from LavaPortfolioVault (for flow display)
    const { data: reserveBps } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
        abi: portfolioAbi as any,
        functionName: 'reserveBps',
    })
    const { data: strategiesData } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
        abi: portfolioAbi as any,
        functionName: 'getStrategies',
    })

    const { data: symbolPortfolio } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
        abi: portfolioAbi as any,
        functionName: 'symbol',
    })
    const { data: symbolCrossChain } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: crossAbi as any,
        functionName: 'symbol',
    })
    const { data: owner } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
        abi: portfolioAbi as any,
        functionName: 'owner',
    })
    const { data: portfolioAsset } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
        abi: portfolioAbi as any,
        functionName: 'asset',
    })
    const { data: totalAssets, refetch: refetchTotalAssets } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
        abi: portfolioAbi as any,
        functionName: 'totalAssets',
    })
    const { data: totalSupply, refetch: refetchTotalSupply } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
        abi: portfolioAbi as any,
        functionName: 'totalSupply',
    })
    const { data: userShares, refetch: refetchUserShares } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
        abi: portfolioAbi as any,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: Boolean(address) },
    })
    // Minimal ERC20 decimals ABI
    const erc20DecimalsAbi = [
        { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
    ] as const

    const { data: portfolioAssetDecimals } = useReadContract({
        address: (portfolioAsset as any) || undefined,
        abi: erc20DecimalsAbi as any,
        functionName: 'decimals',
        query: { enabled: Boolean(portfolioAsset) },
    })

    const btcPrice = 119670 * 1e8

    const assetDecimals = Number(portfolioAssetDecimals || 8)
    const sharePrice = useMemo(() => {
        if (!totalAssets || !totalSupply || Number(totalSupply) === 0) return Math.pow(10, assetDecimals)
        return (Number(totalAssets) * Math.pow(10, assetDecimals)) / Number(totalSupply)
    }, [totalAssets, totalSupply, assetDecimals])

    const userAssets = useMemo(() => {
        console.log('🔍 Portfolio User Shares Debug:', {
            userShares: userShares?.toString(),
            userSharesNumber: Number(userShares || 0),
            totalAssets: totalAssets?.toString(),
            totalSupply: totalSupply?.toString(),
            assetDecimals
        })

        if (!userShares || Number(userShares) === 0) return 0
        if (!totalAssets || !totalSupply || Number(totalSupply) === 0) return 0

        // Use ERC-4626 formula: userAssets = (userShares * totalAssets) / totalSupply
        // Convert to decimal format for display
        const userAssetsRaw = (Number(userShares) * Number(totalAssets)) / Number(totalSupply)
        return userAssetsRaw / Math.pow(10, assetDecimals) // Convert from wei to decimal
    }, [userShares, totalAssets, totalSupply, assetDecimals])

    // Cross-chain vault readings for visible yield change demo
    const { data: crossTotalAssets, refetch: refetchCrossTotalAssets } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: crossAbi as any,
        functionName: 'totalAssets',
    })
    const { data: crossTotalSupply, refetch: refetchCrossTotalSupply } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: crossAbi as any,
        functionName: 'totalSupply',
    })
    const { data: crossAsset } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: crossAbi as any,
        functionName: 'asset',
    })
    const { data: crossAssetDecimals } = useReadContract({
        address: (crossAsset as any) || undefined,
        abi: erc20DecimalsAbi as any,
        functionName: 'decimals',
        query: { enabled: Boolean(crossAsset) },
    })
    const { data: userSharesCross, refetch: refetchUserSharesCross } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: crossAbi as any,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: Boolean(address) },
    })
    const crossDecs = Number(crossAssetDecimals || 8)
    const crossSharePrice = useMemo(() => {
        if (!crossTotalAssets || !crossTotalSupply || Number(crossTotalSupply) === 0) return Math.pow(10, crossDecs)
        return (Number(crossTotalAssets) * Math.pow(10, crossDecs)) / Number(crossTotalSupply)
    }, [crossTotalAssets, crossTotalSupply, crossDecs])
    const [crossBaseline, setCrossBaseline] = useState<number | null>(null)
    useEffect(() => {
        if (crossBaseline === null && crossSharePrice > 0) {
            setCrossBaseline(crossSharePrice)
        }
    }, [crossSharePrice, crossBaseline])
    const crossDelta = crossBaseline ? crossSharePrice - crossBaseline : 0
    const crossDeltaPct = crossBaseline && crossBaseline > 0 ? (crossDelta / crossBaseline) * 100 : 0
    const userCrossAssets = useMemo(() => {
        if (!userSharesCross || Number(userSharesCross) === 0) return 0
        if (!crossTotalAssets || !crossTotalSupply || Number(crossTotalSupply) === 0) return 0

        // Use ERC-4626 formula: userAssets = (userShares * totalAssets) / totalSupply
        // Convert to decimal format for display
        const userAssetsRaw = (Number(userSharesCross) * Number(crossTotalAssets)) / Number(crossTotalSupply)
        return userAssetsRaw / Math.pow(10, crossDecs) // Convert from wei to decimal
    }, [userSharesCross, crossTotalAssets, crossTotalSupply, crossDecs])

    async function addTokenToWallet(tokenAddress: `0x${string}`, symbol: string) {
        try {
            // 18 decimals for both pcBTC/xcBTC shares
            // @ts-ignore
            await window?.ethereum?.request?.({
                method: 'wallet_watchAsset',
                params: {
                    type: 'ERC20',
                    options: { address: tokenAddress, symbol, decimals: 18 },
                },
            })
        } catch { }
    }

    // Auto-refresh on every new block so UI updates without manual reload
    const { data: blockNumber } = useBlockNumber({ watch: true })
    useEffect(() => {
        refetchTotalAssets();
        refetchTotalSupply();
        refetchUserShares();
        refetchCrossTotalAssets();
        refetchCrossTotalSupply();
        refetchUserSharesCross();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blockNumber])

    // Allocation model for judge-friendly visualization (automated plan)
    const RESERVE_BPS = reserveBps ? Number(reserveBps) / 100 : 20
    // Map live strategies → simple display buckets by id
    const PLAN_BPS = useMemo(() => {
        const byId: Record<number, number> = {}
        if (strategiesData) {
            const [ids, infos] = strategiesData as [bigint[], any[]]
            ids.forEach((id, i) => {
                const strategyId = Number(id)
                const enabled = infos[i].enabled
                const bps = Number(infos[i].allocationBps || 0)

                // Only include allocation if strategy is enabled, otherwise 0%
                byId[strategyId] = enabled ? bps / 100 : 0
            })
        }

        const zentraAlloc = byId[1] ?? 0
        const satsumaAlloc = byId[2] ?? 0
        const crossChainAlloc = byId[3] ?? 0

        return {
            zentra: zentraAlloc,
            satsuma: satsumaAlloc,
            crossChain: crossChainAlloc,
            institutional: Math.max(0, 100 - RESERVE_BPS - (zentraAlloc + satsumaAlloc + crossChainAlloc)),
        } as const
    }, [strategiesData, RESERVE_BPS])

    function pct(bps: number) { return `${bps}%` }
    function portion(amount: number, bps: number) { return (amount * bps) / 100 }

    const total = Number(totalAssets || 0)
    const reserveAmt = portion(total, RESERVE_BPS)
    const planTotalBps = 100 - RESERVE_BPS // 80
    // Scale sub-allocations to total directly (they already sum to 80)
    const zentraAmt = portion(total, PLAN_BPS.zentra)
    const satsumaAmt = portion(total, PLAN_BPS.satsuma)
    const crossAmt = portion(total, PLAN_BPS.crossChain)
    const instAmt = portion(total, PLAN_BPS.institutional)

    // Actions
    const [depositAmount, setDepositAmount] = useState('0.0001')
    const [depositAmountCross, setDepositAmountCross] = useState('0.0001')
    const [busy, setBusy] = useState<'deposit' | 'deposit_cross' | 'withdraw' | 'withdraw_cross' | null>(null)

    async function doDeposit() {
        if (!isConnected) return toast.error('Connect wallet')
        try {
            setBusy('deposit')
            // For payable deposit functions, value should be in wei (18 decimals)
            const value = BigInt(Math.floor(parseFloat(depositAmount || '0') * 1e18))
            await writeContract({
                address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
                abi: portfolioAbi as any,
                functionName: 'deposit',
                args: [address!],
                value,
            })
            const expectedShares = calculateExpectedShares(depositAmount, totalAssets as bigint | undefined, totalSupply as bigint | undefined)
            toast.success(`Deposit sent! Expected: ${expectedShares} pcBTC shares`)
            // refresh
            setTimeout(() => {
                refetchTotalAssets(); refetchTotalSupply(); refetchUserShares()
            }, 2500)
        } catch (e: any) {
            toast.error(e?.shortMessage || 'Deposit failed')
        } finally {
            setBusy(null)
        }
    }

    async function doDepositCross() {
        if (!isConnected) return toast.error('Connect wallet')
        try {
            setBusy('deposit_cross')
            // For payable deposit functions, value should be in wei (18 decimals)
            const value = BigInt(Math.floor(parseFloat(depositAmountCross || '0') * 1e18))
            await writeContract({
                address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
                abi: crossAbi as any,
                functionName: 'deposit',
                args: [address!],
                value,
            })
            const expectedSharesCross = calculateExpectedShares(depositAmountCross, crossTotalAssets as bigint | undefined, crossTotalSupply as bigint | undefined)
            toast.success(`Cross-chain deposit sent! Expected: ${expectedSharesCross} xcBTC shares`)
        } catch (e: any) {
            toast.error(e?.shortMessage || 'Cross-chain deposit failed')
        } finally {
            setBusy(null)
        }
    }

    async function doWithdrawAll() {
        if (!isConnected) return toast.error('Connect wallet')
        const sharesStr = (userShares as any)?.toString?.() || '0'
        const shares = BigInt(sharesStr)
        if (shares === BigInt(0)) return toast.error('No pcBTC shares')

        // SAFETY: Limit withdrawals to 25% of total shares to prevent liquidity issues
        const totalSupplyNum = Number(totalSupply || 0)
        const sharesNum = Number(shares)
        const maxWithdrawPct = 25 // 25% maximum
        const maxShares = BigInt(Math.floor(totalSupplyNum * maxWithdrawPct / 100))

        if (shares > maxShares) {
            toast.error(`Maximum withdrawal is ${maxWithdrawPct}% of vault (${formatShares(Number(maxShares))} shares). Please withdraw in smaller amounts.`)
            return
        }

        try {
            setBusy('withdraw')

            // === COMPREHENSIVE DEBUGGING ===
            console.log('🔍 === PORTFOLIO WITHDRAWAL DEBUG START ===')
            console.log('📊 User Info:')
            console.log('  - Address:', address)
            console.log('  - Shares to withdraw:', shares.toString())
            console.log('  - Shares formatted:', formatShares(Number(shares)))

            console.log('📈 Vault State:')
            console.log('  - Portfolio vault address:', CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT)
            console.log('  - Total assets:', totalAssets?.toString())
            console.log('  - Total supply:', totalSupply?.toString())
            console.log('  - Reserve BPS:', reserveBps?.toString())

            // Calculate expected withdrawal amount
            const expectedAssets = userShares && totalSupply && totalAssets && (totalSupply as bigint) > BigInt(0)
                ? ((userShares as bigint) * (totalAssets as bigint)) / (totalSupply as bigint)
                : BigInt(0)
            console.log('💰 Expected withdrawal:')
            console.log('  - Expected assets (raw):', expectedAssets?.toString())
            console.log('  - Expected assets (formatted):', formatBTC(Number(expectedAssets || 0), 8))

            // Check if vault has enough balance  
            const reserveAmount = totalAssets && reserveBps
                ? ((totalAssets as bigint) * BigInt(reserveBps as number)) / BigInt(10000)
                : BigInt(0)
            console.log('🏦 Balance Analysis:')
            console.log('  - Reserve amount:', reserveAmount.toString())
            console.log('  - Need from strategies:', expectedAssets && reserveAmount && expectedAssets > reserveAmount ? (expectedAssets - reserveAmount).toString() : '0')

            // Strategy analysis
            console.log('🎯 Strategy Analysis:')
            if (strategiesData && Array.isArray(strategiesData) && strategiesData.length >= 2) {
                const [strategyIds, strategyInfos] = strategiesData
                console.log('  - Strategy IDs:', strategyIds?.map((id: any) => id.toString()))

                strategyInfos?.forEach((info: any, index: number) => {
                    console.log(`  - Strategy ${strategyIds[index]}:`, {
                        adapter: info.adapter,
                        allocationBps: info.allocationBps?.toString(),
                        enabled: info.enabled
                    })
                })
            } else {
                console.log('  - No strategies data available')
            }

            console.log('🚀 Submitting withdrawal transaction...')

            await writeContract({
                address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
                abi: portfolioAbi as any,
                functionName: 'withdraw',
                args: [shares, address!],
                gas: BigInt(2000000), // High gas limit for complex withdrawals
            })

            console.log('✅ Portfolio withdrawal transaction submitted successfully')
            console.log('🔍 === PORTFOLIO WITHDRAWAL DEBUG END ===')
            toast.success('Withdraw sent')
            setTimeout(() => {
                refetchTotalAssets(); refetchTotalSupply(); refetchUserShares()
            }, 2500)

        } catch (e: any) {
            console.error('❌ === PORTFOLIO WITHDRAWAL ERROR ===')
            console.error('Error object:', e)
            console.error('Error message:', e?.message)
            console.error('Error shortMessage:', e?.shortMessage)
            console.error('Error cause:', e?.cause)
            console.error('Error code:', e?.code)
            console.error('Error data:', e?.data)

            // Try to extract revert reason
            if (e?.data) {
                console.error('Raw error data:', e.data)
            }
            if (e?.cause?.data) {
                console.error('Cause error data:', e.cause.data)
            }

            console.error('❌ === PORTFOLIO WITHDRAWAL ERROR END ===')
            toast.error(e?.shortMessage || 'Withdraw failed')
        } finally {
            setBusy(null)
        }
    }

    async function doWithdrawAllCross() {
        if (!isConnected) return toast.error('Connect wallet')
        const sharesStr = (userSharesCross as any)?.toString?.() || '0'
        const shares = BigInt(sharesStr)
        if (shares === BigInt(0)) return toast.error('No xcBTC shares')

        try {
            setBusy('withdraw_cross')

            // === COMPREHENSIVE DEBUGGING FOR CROSS-CHAIN ===
            console.log('🔍 === CROSS-CHAIN WITHDRAWAL DEBUG START ===')
            console.log('📊 User Info:')
            console.log('  - Address:', address)
            console.log('  - Shares to withdraw:', shares.toString())
            console.log('  - Shares formatted:', formatShares(Number(shares)))

            console.log('📈 Cross-Chain Vault State:')
            console.log('  - Cross-chain vault address:', CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT)
            console.log('  - Total assets:', crossTotalAssets?.toString())
            console.log('  - Total supply:', crossTotalSupply?.toString())

            // Calculate expected withdrawal amount
            const expectedAssetsCross = userSharesCross && crossTotalSupply && crossTotalAssets && (crossTotalSupply as bigint) > BigInt(0)
                ? ((userSharesCross as bigint) * (crossTotalAssets as bigint)) / (crossTotalSupply as bigint)
                : BigInt(0)
            console.log('💰 Expected withdrawal:')
            console.log('  - Expected assets (raw):', expectedAssetsCross?.toString())
            console.log('  - Expected assets (formatted):', formatBTC(Number(expectedAssetsCross || 0), 8))

            console.log('🏦 Cross-Chain Balance Analysis:')
            console.log('  - Expected withdrawal amount:', expectedAssetsCross?.toString())

            console.log('🚀 Submitting cross-chain withdrawal transaction...')

            await writeContract({
                address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
                abi: crossAbi as any,
                functionName: 'withdraw',
                args: [shares, address!],
                gas: BigInt(2000000), // High gas limit for complex withdrawals
            })

            console.log('✅ Cross-chain withdrawal transaction submitted successfully')
            console.log('🔍 === CROSS-CHAIN WITHDRAWAL DEBUG END ===')
            toast.success('Cross-chain withdraw sent')
            setTimeout(() => {
                refetchUserSharesCross()
            }, 2500)

        } catch (e: any) {
            console.error('❌ === CROSS-CHAIN WITHDRAWAL ERROR ===')
            console.error('Error object:', e)
            console.error('Error message:', e?.message)
            console.error('Error shortMessage:', e?.shortMessage)
            console.error('Error cause:', e?.cause)
            console.error('Error code:', e?.code)
            console.error('Error data:', e?.data)

            // Try to extract revert reason
            if (e?.data) {
                console.error('Raw error data:', e.data)
            }
            if (e?.cause?.data) {
                console.error('Cause error data:', e.cause.data)
            }

            console.error('❌ === CROSS-CHAIN WITHDRAWAL ERROR END ===')
            toast.error(e?.shortMessage || 'Cross-chain withdraw failed')
        } finally {
            setBusy(null)
        }
    }

    // No harvest/withdraw actions exposed in minimal user view

    // Beautiful minimalistic design with nostalgic gradients
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-100/50 relative overflow-hidden">
            {/* Animated Background Elements */}
            <div className="absolute inset-0 opacity-20">
                <div className="absolute top-10 left-10 w-96 h-96 bg-gradient-to-br from-blue-200/40 to-purple-300/40 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
                <div className="absolute top-10 right-10 w-80 h-80 bg-gradient-to-br from-purple-200/40 to-pink-300/40 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-1000"></div>
                <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 w-72 h-72 bg-gradient-to-br from-indigo-200/40 to-cyan-300/40 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-500"></div>
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-8 py-16">

                {/* Elegant Vault Overview */}
                <div className="grid lg:grid-cols-2 gap-12 mb-16">
                    {/* Portfolio Vault (pcBTC) */}
                    <div className="backdrop-blur-md bg-white/25 rounded-3xl p-8 border border-white/30 shadow-2xl shadow-blue-500/5 hover:shadow-blue-500/10 transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-400 to-red-500 animate-pulse"></div>
                            <h2 className="text-2xl font-light text-slate-700">Portfolio Vault</h2>
                            <span className="text-sm font-medium bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">pcBTC</span>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-8">
                            <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-6 border border-white/20">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Vault NAV</div>
                                <div className="text-2xl font-light text-slate-800">{formatBTC(Number(totalAssets || 0), assetDecimals)}</div>
                                <div className="text-xs text-slate-500 mt-1">cBTC</div>
                            </div>
                            <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-6 border border-white/20">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Share Price</div>
                                <div className="text-2xl font-light text-slate-800">{(Number(sharePrice) / Math.pow(10, assetDecimals)).toFixed(2)}</div>
                                <div className="text-xs text-slate-500 mt-1">cBTC/share</div>
                            </div>
                            <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-6 border border-white/20">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Your Shares</div>
                                <div className="text-2xl font-light text-slate-800">
                                    {Number(userShares || 0) === 0 ? (
                                        <span className="text-slate-400">0</span>
                                    ) : (
                                        formatShares(Number(userShares || 0))
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">pcBTC shares</div>
                            </div>
                            <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-6 border border-white/20">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Your Assets</div>
                                <div className="text-2xl font-light text-slate-800">{formatBTC(userAssets, 0)}</div>
                                <div className="text-xs text-slate-500 mt-1">cBTC</div>
                            </div>
                        </div>
                        <div className="backdrop-blur-sm bg-gradient-to-br from-white/30 to-white/10 rounded-3xl p-8 border border-white/40 shadow-xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-400 to-purple-600"></div>
                                <h3 className="text-lg font-light text-slate-700">Portfolio Interface</h3>
                            </div>
                            <div className="space-y-6">
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.00000001"
                                        value={depositAmount}
                                        onChange={(e) => setDepositAmount(e.target.value)}
                                        className="w-full backdrop-blur-sm bg-white/40 border border-white/50 rounded-2xl px-6 py-4 text-lg font-light focus:outline-none focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400/50 transition-all duration-300 placeholder-slate-400"
                                        placeholder="0.0001"
                                    />
                                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm font-medium text-slate-500">cBTC</div>
                                </div>

                                <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-4 border border-white/30">
                                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Your Position</div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-slate-600">Shares:</span>
                                        <span className="font-medium text-slate-800">{formatSharesForDeposit(Number(userShares || 0))}</span>
                                    </div>
                                    <div className="flex justify-between items-center mt-1">
                                        <span className="text-sm text-slate-600">Value:</span>
                                        <span className="font-medium text-slate-800">{formatBTC(userAssets, 0)} cBTC</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={doDeposit}
                                        disabled={!isConnected || busy === 'deposit'}
                                        className="backdrop-blur-sm bg-gradient-to-r from-orange-500/80 to-red-500/80 hover:from-orange-500 hover:to-red-500 text-white rounded-2xl px-6 py-4 font-medium disabled:opacity-50 transition-all duration-300 hover:shadow-xl hover:scale-105 hover:-translate-y-1"
                                    >
                                        {busy === 'deposit' ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                Depositing
                                            </div>
                                        ) : (
                                            'Deposit'
                                        )}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!isConnected) return toast.error('Connect wallet')
                                            const totalSupplyNum = Number(totalSupply || 0)
                                            const shares25pct = BigInt(Math.floor(totalSupplyNum * 25 / 100))
                                            if (shares25pct === BigInt(0)) return toast.error('No shares to withdraw')

                                            try {
                                                setBusy('withdraw')
                                                await writeContract({
                                                    address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
                                                    abi: portfolioAbi as any,
                                                    functionName: 'withdraw',
                                                    args: [shares25pct, address!],
                                                    gas: BigInt(2000000),
                                                })
                                                toast.success('25% withdrawal sent')
                                                setTimeout(() => {
                                                    refetchTotalAssets(); refetchTotalSupply(); refetchUserShares()
                                                }, 2500)
                                            } catch (e: any) {
                                                toast.error(e?.shortMessage || 'Withdraw failed')
                                            } finally {
                                                setBusy(null)
                                            }
                                        }}
                                        disabled={!isConnected || busy === 'withdraw'}
                                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded px-4 py-2 disabled:opacity-60"
                                    >
                                        {busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw 25%'}
                                    </button>
                                </div>
                                <p className="text-xs text-black/60 mt-2">
                                    Wraps to WcBTC, keeps 20% reserve, routes rest to strategies.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Cross-Chain Vault (xcBTC) */}
                    <div className="backdrop-blur-md bg-white/25 rounded-3xl p-8 border border-white/30 shadow-2xl shadow-indigo-500/5 hover:shadow-indigo-500/10 transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-indigo-400 to-purple-500 animate-pulse"></div>
                            <h2 className="text-2xl font-light text-slate-700">Cross-Chain Vault</h2>
                            <span className="text-sm font-medium bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">xcBTC</span>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-8">
                            <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-6 border border-white/20">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Vault NAV</div>
                                <div className="text-2xl font-light text-slate-800">{formatBTC(Number(crossTotalAssets || 0), crossDecs)}</div>
                                <div className="text-xs text-slate-500 mt-1">cBTC</div>
                            </div>
                            <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-6 border border-white/20">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Share Price</div>
                                <div className="text-2xl font-light text-slate-800">{(crossSharePrice / Math.pow(10, crossDecs)).toFixed(2)}</div>
                                <div className="text-xs text-slate-500 mt-1">cBTC/share</div>
                            </div>
                            <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-6 border border-white/20">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Your Shares</div>
                                <div className="text-2xl font-light text-slate-800">
                                    {Number(userSharesCross || 0) === 0 ? (
                                        <span className="text-slate-400">0</span>
                                    ) : (
                                        formatShares(Number(userSharesCross || 0))
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">xcBTC shares</div>
                            </div>
                            <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-6 border border-white/20">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Your Assets</div>
                                <div className="text-2xl font-light text-slate-800">{formatBTC(userCrossAssets, 0)}</div>
                                <div className="text-xs text-slate-500 mt-1">cBTC</div>
                            </div>
                        </div>

                        {/* Elegant Cross-Chain Deposit Interface */}
                        <div className="backdrop-blur-sm bg-gradient-to-br from-white/30 to-white/10 rounded-3xl p-8 border border-white/40 shadow-xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-400 to-purple-600"></div>
                                <h3 className="text-lg font-light text-slate-700">Cross-Chain Interface</h3>
                            </div>

                            <div className="space-y-6">
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.00000001"
                                        value={depositAmountCross}
                                        onChange={(e) => setDepositAmountCross(e.target.value)}
                                        className="w-full backdrop-blur-sm bg-white/40 border border-white/50 rounded-2xl px-6 py-4 text-lg font-light focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/50 transition-all duration-300 placeholder-slate-400"
                                        placeholder="0.0001"
                                    />
                                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm font-medium text-slate-500">cBTC</div>
                                </div>

                                <div className="backdrop-blur-sm bg-white/20 rounded-2xl p-4 border border-white/30">
                                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Your Position</div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-slate-600">Shares:</span>
                                        <span className="font-medium text-slate-800">{formatSharesForDeposit(Number(userSharesCross || 0))}</span>
                                    </div>
                                    <div className="flex justify-between items-center mt-1">
                                        <span className="text-sm text-slate-600">Value:</span>
                                        <span className="font-medium text-slate-800">{formatBTC(userCrossAssets, 0)} cBTC</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={doDepositCross}
                                        disabled={!isConnected || busy === 'deposit_cross'}
                                        className="backdrop-blur-sm bg-gradient-to-r from-indigo-500/80 to-purple-500/80 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl px-6 py-4 font-medium disabled:opacity-50 transition-all duration-300 hover:shadow-xl hover:scale-105 hover:-translate-y-1"
                                    >
                                        {busy === 'deposit_cross' ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                Depositing
                                            </div>
                                        ) : (
                                            'Deposit'
                                        )}
                                    </button>
                                    <button
                                        onClick={doWithdrawAllCross}
                                        disabled={!isConnected || busy === 'withdraw_cross'}
                                        className="backdrop-blur-sm bg-white/30 hover:bg-white/50 text-slate-700 rounded-2xl px-6 py-4 font-medium border border-white/40 disabled:opacity-50 transition-all duration-300 hover:shadow-xl hover:scale-105 hover:-translate-y-1"
                                    >
                                        {busy === 'withdraw_cross' ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-600 rounded-full animate-spin"></div>
                                                Withdrawing
                                            </div>
                                        ) : (
                                            'Withdraw All'
                                        )}
                                    </button>
                                </div>

                                <div className="text-xs text-slate-500 text-center font-light">
                                    Cross-chain yield with automated borrowing and harvest cycles
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Elegant Strategy Allocation */}
                <div className="backdrop-blur-md bg-white/20 rounded-3xl p-8 border border-white/30 shadow-xl mb-12">
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-light text-slate-700 mb-2">Strategy Allocation</h3>
                        <div className="w-16 h-0.5 bg-gradient-to-r from-blue-400 to-indigo-500 mx-auto"></div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="backdrop-blur-sm bg-gradient-to-br from-green-100/50 to-emerald-100/50 rounded-2xl p-6 border border-green-200/30 shadow-lg">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                <div className="text-xs font-medium text-green-700 uppercase tracking-wider">Reserve</div>
                            </div>
                            <div className="text-2xl font-light text-green-800 mb-1">{pct(RESERVE_BPS)}</div>
                            <div className="text-xs text-green-600">{formatBTC(reserveAmt, 0)} cBTC</div>
                        </div>

                        <div className="backdrop-blur-sm bg-white/30 rounded-2xl p-6 border border-white/30 shadow-lg">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                <div className="text-xs font-medium text-slate-600 uppercase tracking-wider">Zentra</div>
                            </div>
                            <div className="text-2xl font-light text-slate-800 mb-1">{pct(PLAN_BPS.zentra)}</div>
                            <div className="text-xs text-slate-500">{formatBTC(zentraAmt, 0)} cBTC</div>
                        </div>

                        <div className="backdrop-blur-sm bg-white/30 rounded-2xl p-6 border border-white/30 shadow-lg opacity-60">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Satsuma</div>
                            </div>
                            <div className="text-2xl font-light text-slate-600 mb-1">{pct(PLAN_BPS.satsuma)}</div>
                            <div className="text-xs text-slate-400">{formatBTC(satsumaAmt, 0)} cBTC</div>
                        </div>

                        <div className="backdrop-blur-sm bg-white/30 rounded-2xl p-6 border border-white/30 shadow-lg opacity-60">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Cross-Chain</div>
                            </div>
                            <div className="text-2xl font-light text-slate-600 mb-1">{pct(PLAN_BPS.crossChain)}</div>
                            <div className="text-xs text-slate-400">{formatBTC(crossAmt, 0)} cBTC</div>
                        </div>

                        <div className="backdrop-blur-sm bg-white/30 rounded-2xl p-6 border border-white/30 shadow-lg opacity-60">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Institutional</div>
                            </div>
                            <div className="text-2xl font-light text-slate-600 mb-1">{pct(PLAN_BPS.institutional)}</div>
                            <div className="text-xs text-slate-400">{formatBTC(instAmt, 0)} cBTC</div>
                        </div>
                    </div>
                </div>

                {/* Explainers */}
                <div className="grid md:grid-cols-3 gap-4">
                    <div className="border border-black/10 rounded-lg p-4">
                        <div className="text-xs font-semibold uppercase text-black/60">What</div>
                        <div className="text-sm mt-2">
                            A single vault (the Brain) controlling simple strategies (the Hands). Funds are isolated, and we can add new strategies without redeploying the vault.
                        </div>
                    </div>
                    <div className="border border-black/10 rounded-lg p-4">
                        <div className="text-xs font-semibold uppercase text-black/60">Why</div>
                        <div className="text-sm mt-2">
                            Use Bitcoin’s liquidity as collateral to access yield anywhere, then bring profits back to Citrea. User gets a simple deposit/withdraw experience.
                        </div>
                    </div>
                    <div className="border border-black/10 rounded-lg p-4">
                        <div className="text-xs font-semibold uppercase text-black/60">How</div>
                        <ul className="text-sm mt-2 list-disc pl-4 space-y-1">
                            <li>Fixed BTC price for demo: ${Number(btcPrice) / 1e8}</li>
                            <li>Reserve: 20% of new deposits; remaining split by live on-chain bps</li>
                            <li>Adapters isolate strategy risk; allocations are owner-adjustable</li>
                        </ul>
                    </div>
                </div>

                {/* Step-by-step calculation explainer */}
                <div className="mt-10 border border-black/10 rounded-lg p-4">
                    <div className="text-sm font-semibold mb-3">How the math works (at a glance)</div>
                    <ul className="text-sm list-disc pl-4 space-y-1">
                        <li>Fixed BTC price = ${Number(btcPrice) / 1e8} → for display only.</li>
                        <li>Initial deposit D (WcBTC 8d) → keep reserve = 20% × D.</li>
                        <li>Remaining is allocated by live bps to Zentra/Satsuma/Cross-Chain.</li>
                        <li>Share price = totalAssets / totalSupply (WcBTC/share). Rising share price = accrued yield.</li>
                        <li>Cross-chain demo shows visible share price increase after a harvest event.</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}


