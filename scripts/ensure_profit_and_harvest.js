/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const hre = require('hardhat')

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
async function retry(label, fn, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try { return await fn() } catch (e) {
      console.log(`[retry] ${label} failed (${i + 1}/${retries})`, e?.shortMessage || e?.message || e)
      if (i === retries - 1) throw e
      await sleep(delayMs * (i + 1))
    }
  }
}

async function main() {
  const addrs = JSON.parse(fs.readFileSync(path.join(__dirname, 'crosschain-addresses.json'), 'utf8'))
  const [deployer] = await hre.ethers.getSigners()
  console.log('Owner:', deployer.address)

  const usdc = await hre.ethers.getContractAt('MockUSDC', addrs.MockUSDC)
  const ys = await hre.ethers.getContractAt('MockInstitutionalYieldSource', addrs.MockInstitutionalYieldSource)
  const vault = await hre.ethers.getContractAt('LavaCrossChainVault', addrs.LavaCrossChainVault)

  const nav1 = await vault.totalAssets()
  console.log('NAV before (WcBTC 8d):', nav1.toString())

  const atYS = await ys.totalAssets(addrs.MockUSDC) // 6d
  const bridged = await vault.initialBridgedUsd() // 6d
  console.log('YieldSource USDC:', atYS.toString(), 'Initial bridged USDC:', bridged.toString())

  let needProfit = 0n
  if (atYS <= bridged) {
    // Ensure strictly greater than bridged by +200 USDC
    const shortfall = bridged - atYS + 1n
    const extra = hre.ethers.parseUnits('200', 6)
    needProfit = shortfall + extra
  }
  if (needProfit > 0n) {
    console.log('Minting profit to YS (USDC 6d):', needProfit.toString())
    await (await retry('usdc.mint(ys)', () => usdc.mint(ys.target, needProfit))).wait()
  } else {
    console.log('YS already has profit > bridged; skipping mint')
  }

  await (await retry('vault.harvest', () => vault.harvestCrossChainYield())).wait()
  const nav2 = await vault.totalAssets()
  console.log('NAV after (WcBTC 8d):', nav2.toString())
  if (nav2 <= nav1) throw new Error('NAV did not increase. Check profit mint and try larger amount.')
}

main().catch((e) => { console.error(e); process.exit(1) })



