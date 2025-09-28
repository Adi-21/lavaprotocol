'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { CONTRACT_ADDRESSES } from '@/lib/contracts'
import vaultAbi from '@/abis/lavaCrossChainVault.json'
import portfolioAbi from '@/abis/lavaPortfolioVault.json'

function formatBTC(value?: number) {
    if (value === undefined || value === null) return '0.0'
    return (value / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })
}

export default function CalculationsPage() {
    const { address } = useAccount()

    // Optional visibility for pcBTC adapters (portfolio) — invested balances
    const { data: zentraInvested } = useReadContract({
        address: CONTRACT_ADDRESSES.ZENTRA_ADAPTER,
        abi: [{"inputs":[],"name":"investedBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}] as any,
        functionName: 'investedBalance',
    })
    const { data: satsumaInvested } = useReadContract({
        address: CONTRACT_ADDRESSES.SATSUMA_ADAPTER,
        abi: [{"inputs":[],"name":"investedBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}] as any,
        functionName: 'investedBalance',
    })
    const { data: crossCustody } = useReadContract({
        address: CONTRACT_ADDRESSES.CROSSCHAIN_ADAPTER,
        abi: [{"inputs":[],"name":"totalAssets","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}] as any,
        functionName: 'totalAssets',
    })

    // Live reads from the vault used in the dashboard
    const { data: symbolCrossChain } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: vaultAbi as any,
        functionName: 'symbol',
    })
    const { data: symbolPortfolio } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_PORTFOLIO_VAULT,
        abi: portfolioAbi as any,
        functionName: 'symbol',
    })
    const { data: totalAssets } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: vaultAbi as any,
        functionName: 'totalAssets',
    })
    const { data: totalSupply } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: vaultAbi as any,
        functionName: 'totalSupply',
    })
    const { data: userShares } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: vaultAbi as any,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: Boolean(address) },
    })
    const { data: btcPrice } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: vaultAbi as any,
        functionName: 'getBtcPrice',
    })
    const { data: totalDebtUsd } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: vaultAbi as any,
        functionName: 'totalDebtUsd',
    })
    const { data: initialBridgedUsd } = useReadContract({
        address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
        abi: vaultAbi as any,
        functionName: 'initialBridgedUsd',
    })

    // Live portfolio config for visual flow
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

    const sharePrice = useMemo(() => {
        if (!totalAssets || !totalSupply || Number(totalSupply) === 0) return 1e8
        return (Number(totalAssets) * 1e8) / Number(totalSupply)
    }, [totalAssets, totalSupply])

    // Judge-friendly allocation plan (visual only)
    const RESERVE_BPS = 20
    const liveReserve = reserveBps ? Number(reserveBps) / 100 : RESERVE_BPS
    const livePlan = (() => {
        const defaults = { zentra: 30, satsuma: 25, crossChain: 25, institutional: 100 - liveReserve - 30 - 25 - 25 }
        if (!strategiesData) return defaults
        const [ids, infos] = strategiesData as [bigint[], any[]]
        const m: Record<number, number> = {}
        
        // Build map of all strategies (enabled and disabled)
        ids.forEach((id, i) => { 
            const strategyId = Number(id)
            const allocation = Number(infos[i].allocationBps || 0) / 100
            const enabled = infos[i].enabled
            
            // Only include allocation if strategy is enabled
            m[strategyId] = enabled ? allocation : 0
        })
        
        const zentraAlloc = m[1] ?? 0
        const satsumaAlloc = m[2] ?? 0  
        const crossChainAlloc = m[3] ?? 0
        
        return {
            zentra: zentraAlloc,
            satsuma: satsumaAlloc,
            crossChain: crossChainAlloc,
            institutional: Math.max(0, 100 - liveReserve - zentraAlloc - satsumaAlloc - crossChainAlloc),
        }
    })()
    const total = Number(totalAssets || 0)
    const pct = (x: number) => `${x}%`
    const portion = (amt: number, bps: number) => (amt * bps) / 100

    const reserveAmt = portion(total, liveReserve)
    const zentraAmt = portion(total, livePlan.zentra)
    const satsumaAmt = portion(total, livePlan.satsuma)
    const crossAmt = portion(total, livePlan.crossChain)
    const instAmt = portion(total, livePlan.institutional)

    // Example calculator
    const [exampleDeposit, setExampleDeposit] = useState('0.001')
    const [exampleNavBumpPct, setExampleNavBumpPct] = useState('2') // 2% illustrative

    const exDepositWc = useMemo(() => Math.floor(parseFloat(exampleDeposit || '0') * 1e8), [exampleDeposit])
    const exSharesMinted = useMemo(() => {
        if (!totalAssets || !totalSupply || Number(totalSupply) === 0) return exDepositWc
        return Math.floor((exDepositWc * Number(totalSupply)) / Number(totalAssets))
    }, [exDepositWc, totalAssets, totalSupply])
    const exSharePriceAfter = useMemo(() => {
        const bump = Math.max(0, parseFloat(exampleNavBumpPct || '0')) / 100
        const current = sharePrice / 1e8
        return (current * (1 + bump)).toFixed(8)
    }, [sharePrice, exampleNavBumpPct])
    const exAssetsValueAfter = useMemo(() => {
        const bump = Math.max(0, parseFloat(exampleNavBumpPct || '0')) / 100
        const currentShare = sharePrice / 1e8
        const after = currentShare * (1 + bump)
        const shares = exSharesMinted / 1e8
        return (after * shares).toFixed(8)
    }, [sharePrice, exampleNavBumpPct, exSharesMinted])

    // Assumed APYs (illustrative) for per-allocation yield breakdown
    const [zentraApy, setZentraApy] = useState('6')
    const [satsumaApy, setSatsumaApy] = useState('8')
    const [crossApy, setCrossApy] = useState('5')
    const [instApy, setInstApy] = useState('9')

    function annualYieldCbtc(amount: number, apyPct: string) {
        const apy = Math.max(0, parseFloat(apyPct || '0')) / 100
        const amt = amount / 1e8
        return (amt * apy).toFixed(8)
    }
    function monthlyYieldCbtc(amount: number, apyPct: string) {
        const ann = parseFloat(annualYieldCbtc(amount, apyPct))
        return (ann / 12).toFixed(8)
    }

    return (
        <div className="min-h-screen bg-white text-black">
            <div className="max-w-5xl mx-auto px-4 py-8">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold">Yield Engine - Calculations & Formulas</h1>
                    <Link href="/" className="text-orange-600 hover:underline">← Back to Vault</Link>
                </div>

                {/* Formulas section */}
                <div className="border border-black/10 rounded-lg p-4 mb-8">
                    <div className="text-sm font-semibold mb-2">Key Formulas (Both Vaults)</div>
                    <ul className="text-sm list-disc pl-4 space-y-1">
                        <li>Share Price (cBTC/share) = totalAssets / totalSupply</li>
                        <li>Shares Minted = supply == 0 ? deposit : (deposit × totalSupply) / totalAssets</li>
                        <li>Portfolio reserve = 20% of totalAssets; remaining split by live on-chain bps</li>
                        <li>Cross-Chain: Borrow USD12 = (depositWc8 × BTCprice8) × 20% × 1e4; USDC6 = USD12 / 1e6</li>
                        <li>Cross-Chain NAV: NAV8 = ((collateralUsd12 − totalDebtUsd12) × 1e8 / BTCprice8) / 1e4</li>
                        <li>Harvest uses profit to repay debt first, then increases collateral → share price rises</li>
                        <li>NAV - Net Asset Value</li>
                        <li>Portfolio Vault token symbol: pcBTC</li>
                        <li>Cross-Chain Vault token symbol: xcBTC</li>
                    </ul>
                </div>

                {/* Cross-Chain Vault - Live Numbers */}
                <div className="grid md:grid-cols-4 gap-4 mb-8">
                    <div className="rounded-lg p-4 border border-black/10">
                        <div className="text-xs text-black/60">Vault Token</div>
                        <div className="text-lg font-semibold">{symbolPortfolio as string || 'pcBTC'}</div>
                    </div>
                    <div className="rounded-lg p-4 border border-black/10">
                        <div className="text-xs text-black/60">Vault Token</div>
                        <div className="text-lg font-semibold">{symbolCrossChain as string || 'xcBTC'}</div>
                    </div>
                    <div className="rounded-lg p-4 border border-black/10">
                        <div className="text-xs text-black/60">cBTC Price (fixed)</div>
                        <div className="text-lg font-semibold">${(Number(btcPrice || 119670 * 1e8) / 1e8).toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg p-4 border border-black/10">
                        <div className="text-xs text-black/60">NAV (cBTC)</div>
                        <div className="text-lg font-semibold">{formatBTC(Number(totalAssets || 0))}</div>
                    </div>
                    <div className="rounded-lg p-4 border border-black/10">
                        <div className="text-xs text-black/60">Share Price</div>
                        <div className="text-lg font-semibold">{(sharePrice / 1e8).toFixed(8)} cBTC</div>
                    </div>
                </div>

                {/* Cross-Chain Specific Calculations */}
                <div className="border border-black/10 rounded-lg p-4 mb-8">
                    <div className="text-sm font-semibold mb-3">Cross-Chain Calculations (Live)</div>
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="rounded p-3 border border-black/10">
                            <div className="text-xs text-black/60">Total Debt (USD 12d)</div>
                            <div className="text-lg font-semibold">{Number(totalDebtUsd || 0).toLocaleString()}</div>
                        </div>
                        <div className="rounded p-3 border border-black/10">
                            <div className="text-xs text-black/60">Initial Bridged (USDC 6d)</div>
                            <div className="text-lg font-semibold">{Number(initialBridgedUsd || 0).toLocaleString()}</div>
                        </div>
                        <div className="rounded p-3 border border-black/10">
                            <div className="text-xs text-black/60">Share Price (cBTC/share)</div>
                            <div className="text-lg font-semibold">{(sharePrice / 1e8).toFixed(8)}</div>
                        </div>
                    </div>
                    <p className="text-xs text-black/60 mt-3">
                        Notes: 8d=8 decimals (WcBTC), 6d=6 decimals (USDC), 12d=USD fixed-point. Harvest repays debt then increases NAV (Net Asset Value).
                    </p>
                </div>

                {/* Strategy Flow (visual) */}
                <div className="border border-black/10 rounded-lg p-4 mb-8">
                    <div className="text-sm font-semibold mb-3">How the Yield Engine Flows (Both Vaults)</div>
                    <div className="space-y-3 text-sm">
                        <div className="flex items-center flex-wrap gap-2">
                            <div className="px-2 py-1 rounded bg-black text-white">User</div>
                            <div>deposits cBTC →</div>
                            <div className="px-2 py-1 rounded bg-orange-500 text-white">Vault</div>
                            <div>wraps to WcBTC → keeps</div>
                            <div className="px-2 py-1 rounded bg-green-100 text-green-700">Reserve {liveReserve}%</div>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                            <div>Portfolio routes remaining by on-chain bps:</div>
                            <div className="px-2 py-1 rounded border">Zentra {livePlan.zentra}%</div>
                            <div className="px-2 py-1 rounded border">Satsuma {livePlan.satsuma}%</div>
                            <div className="px-2 py-1 rounded border">Cross-Chain {livePlan.crossChain}%</div>
                            <div className="px-2 py-1 rounded border">Institutional {livePlan.institutional}%</div>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                            <div className="px-2 py-1 rounded border">Zentra</div>
                            <div>supplies WcBTC (earns Supply APY). If leverage is enabled, borrow small USDC, loop safely (HF&gt;1.0).</div>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                            <div className="px-2 py-1 rounded border">Satsuma</div>
                            <div>deposits into Ichi‑managed cBTC vault (fees + emissions, managed range).</div>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                            <div className="px-2 py-1 rounded border">Cross-Chain</div>
                            <div>supplies WcBTC → borrows ~20% USDC (LTV) → bridge out → yield source accrues profit → harvest pulls back & repays debt.</div>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                            <div className="px-2 py-1 rounded border">Institutional</div>
                            <div>allocates to institutional‑grade sources via bridge, returns profit periodically.</div>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                            <div className="px-2 py-1 rounded bg-green-600 text-white">Harvest</div>
                            <div>profits repay debt first (if any), then increase WcBTC collateral → NAV rises → user’s vault tokens are worth more cBTC.</div>
                        </div>
                    </div>
                </div>

                {/* Allocation breakdown (visual only) */}
                <div className="grid md:grid-cols-5 gap-4 mb-4">
                    <div className="rounded-lg p-4 border border-black/10 bg-green-50">
                        <div className="text-xs text-black/60">Reserve</div>
                        <div className="text-lg font-semibold text-green-700">{pct(RESERVE_BPS)}</div>
                        <div className="text-xs text-black/60 mt-1">{formatBTC(reserveAmt)} cBTC</div>
                    </div>
                    <div className="rounded-lg p-4 border border-black/10">
                        <div className="text-xs text-black/60">Zentra</div>
                        <div className="text-lg font-semibold">{pct(livePlan.zentra)}</div>
                        <div className="text-xs text-black/60 mt-1">{formatBTC(zentraAmt)} cBTC</div>
                    </div>
                    <div className="rounded-lg p-4 border border-black/10">
                        <div className="text-xs text-black/60">Satsuma</div>
                        <div className="text-lg font-semibold">{pct(livePlan.satsuma)}</div>
                        <div className="text-xs text-black/60 mt-1">{formatBTC(satsumaAmt)} cBTC</div>
                    </div>
                    <div className="rounded-lg p-4 border border-black/10">
                        <div className="text-xs text-black/60">Cross-Chain</div>
                        <div className="text-lg font-semibold">{pct(livePlan.crossChain)}</div>
                        <div className="text-xs text-black/60 mt-1">{formatBTC(crossAmt)} cBTC</div>
                    </div>
                    <div className="rounded-lg p-4 border border-black/10">
                        <div className="text-xs text-black/60">Institutional</div>
                        <div className="text-lg font-semibold">{pct(livePlan.institutional)}</div>
                        <div className="text-xs text-black/60 mt-1">{formatBTC(instAmt)} cBTC</div>
                    </div>
                </div>

                {/* Portfolio Adapters - Live Balances (pcBTC) */}
                <div className="border border-black/10 rounded-lg p-4 mb-8">
                    <div className="text-sm font-semibold mb-3">Portfolio Strategies (Live Balances)</div>
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="rounded p-3 border border-black/10">
                            <div className="text-xs text-black/60">Zentra Adapter (WcBTC)</div>
                            <div className="text-lg font-semibold">{formatBTC(Number(zentraInvested || 0))}</div>
                        </div>
                        <div className="rounded p-3 border border-black/10">
                            <div className="text-xs text-black/60">Satsuma Adapter (WcBTC)</div>
                            <div className="text-lg font-semibold">{formatBTC(Number(satsumaInvested || 0))}</div>
                        </div>
                        <div className="rounded p-3 border border-black/10">
                            <div className="text-xs text-black/60">Cross-Chain Adapter Custody (WcBTC)</div>
                            <div className="text-lg font-semibold">{formatBTC(Number(crossCustody || 0))}</div>
                        </div>
                    </div>
                    <p className="text-xs text-black/60 mt-3">These balances are what the portfolio vault has routed to each strategy.</p>
                </div>

                {/* Per-allocation yield (assumptions) */}
                <div className="border border-black/10 rounded-lg p-4 mb-8">
                    <div className="text-sm font-semibold mb-3">Per-Allocation Yield (Assumed APY)</div>
                    <div className="grid md:grid-cols-4 gap-4">
                        <div className="rounded p-3 border border-black/10">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-semibold">Zentra</div>
                                <input type="number" step="0.1" value={zentraApy} onChange={(e) => setZentraApy(e.target.value)} className="w-20 border border-black/10 rounded px-2 py-1 text-sm" />
                            </div>
                            <div className="text-xs text-black/60">APY</div>
                            <div className="text-sm">{zentraApy}%</div>
                            <div className="text-xs text-black/60 mt-2">Annual</div>
                            <div className="text-sm">{annualYieldCbtc(zentraAmt, zentraApy)} cBTC</div>
                            <div className="text-xs text-black/60 mt-2">Monthly</div>
                            <div className="text-sm">{monthlyYieldCbtc(zentraAmt, zentraApy)} cBTC</div>
                        </div>
                        <div className="rounded p-3 border border-black/10">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-semibold">Satsuma</div>
                                <input type="number" step="0.1" value={satsumaApy} onChange={(e) => setSatsumaApy(e.target.value)} className="w-20 border border-black/10 rounded px-2 py-1 text-sm" />
                            </div>
                            <div className="text-xs text-black/60">APY</div>
                            <div className="text-sm">{satsumaApy}%</div>
                            <div className="text-xs text-black/60 mt-2">Annual</div>
                            <div className="text-sm">{annualYieldCbtc(satsumaAmt, satsumaApy)} cBTC</div>
                            <div className="text-xs text-black/60 mt-2">Monthly</div>
                            <div className="text-sm">{monthlyYieldCbtc(satsumaAmt, satsumaApy)} cBTC</div>
                        </div>
                        <div className="rounded p-3 border border-black/10">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-semibold">Cross-Chain</div>
                                <input type="number" step="0.1" value={crossApy} onChange={(e) => setCrossApy(e.target.value)} className="w-20 border border-black/10 rounded px-2 py-1 text-sm" />
                            </div>
                            <div className="text-xs text-black/60">APY</div>
                            <div className="text-sm">{crossApy}%</div>
                            <div className="text-xs text-black/60 mt-2">Annual</div>
                            <div className="text-sm">{annualYieldCbtc(crossAmt, crossApy)} cBTC</div>
                            <div className="text-xs text-black/60 mt-2">Monthly</div>
                            <div className="text-sm">{monthlyYieldCbtc(crossAmt, crossApy)} cBTC</div>
                        </div>
                        <div className="rounded p-3 border border-black/10">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-semibold">Institutional</div>
                                <input type="number" step="0.1" value={instApy} onChange={(e) => setInstApy(e.target.value)} className="w-20 border border-black/10 rounded px-2 py-1 text-sm" />
                            </div>
                            <div className="text-xs text-black/60">APY</div>
                            <div className="text-sm">{instApy}%</div>
                            <div className="text-xs text-black/60 mt-2">Annual</div>
                            <div className="text-sm">{annualYieldCbtc(instAmt, instApy)} cBTC</div>
                            <div className="text-xs text-black/60 mt-2">Monthly</div>
                            <div className="text-sm">{monthlyYieldCbtc(instAmt, instApy)} cBTC</div>
                        </div>
                    </div>
                    <p className="text-xs text-black/60 mt-3">These APYs are illustrative for demo; actual returns depend on live strategy performance.</p>
                </div>

                {/* Example projection */}
                <div className="border border-black/10 rounded-lg p-4">
                    <div className="text-sm font-semibold mb-2">Example: What does a user get?</div>
                    <div className="grid md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <div className="text-xs text-black/60 mb-1">Deposit (cBTC)</div>
                            <input
                                type="number"
                                step="0.00000001"
                                value={exampleDeposit}
                                onChange={(e) => setExampleDeposit(e.target.value)}
                                className="w-full border border-black/10 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                        </div>
                        <div>
                            <div className="text-xs text-black/60 mb-1">Illustrative NAV increase (%)</div>
                            <input
                                type="number"
                                step="0.01"
                                value={exampleNavBumpPct}
                                onChange={(e) => setExampleNavBumpPct(e.target.value)}
                                className="w-full border border-black/10 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                        </div>
                        <div className="rounded p-3 bg-orange-50 border border-orange-200">
                            <div className="text-xs text-black/60">Share Price After (demo)</div>
                            <div className="text-lg font-semibold">{exSharePriceAfter} cBTC</div>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="rounded p-3 border border-black/10">
                            <div className="text-xs text-black/60">Shares Minted</div>
                            <div className="text-lg font-semibold">{formatBTC(exSharesMinted)} shares</div>
                        </div>
                        <div className="rounded p-3 border border-black/10">
                            <div className="text-xs text-black/60">Value After (cBTC)</div>
                            <div className="text-lg font-semibold">{exAssetsValueAfter}</div>
                        </div>
                        <div className="rounded p-3 border border-black/10">
                            <div className="text-xs text-black/60">Illustrative Gain</div>
                            <div className="text-lg font-semibold">
                                {(() => {
                                    const after = parseFloat(exAssetsValueAfter || '0')
                                    const dep = parseFloat(exampleDeposit || '0')
                                    const gain = Math.max(0, after - dep)
                                    return `${gain.toFixed(8)} cBTC`
                                })()}
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-black/60 mt-3">
                        Note: This is a simplified demonstration for judges. The real yield depends on market conditions and realized profits used to repay debt.
                    </p>
                </div>
            </div>
        </div>
    )
}


