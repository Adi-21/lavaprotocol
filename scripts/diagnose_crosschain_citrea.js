/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const hre = require('hardhat')

function fmt8(n) { return (Number(n) / 1e8).toFixed(8) }
function fmt6(n) { return (Number(n) / 1e6).toFixed(6) }

async function main() {
  const addrs = JSON.parse(fs.readFileSync(path.join(__dirname, 'crosschain-addresses.json'), 'utf8'))
  const [signer] = await hre.ethers.getSigners()
  console.log('Signer:', signer.address)

  const vault = await hre.ethers.getContractAt('LavaCrossChainVault', addrs.LavaCrossChainVault)
  const pool = await hre.ethers.getContractAt('MockZentraPoolV2', addrs.MockZentraPoolV2)
  const usdc = await hre.ethers.getContractAt('MockUSDC', addrs.MockUSDC)
  const ys = await hre.ethers.getContractAt('MockInstitutionalYieldSource', addrs.MockInstitutionalYieldSource)

  const beforeNAV = await vault.totalAssets()
  const beforeSupply = await vault.totalSupply()
  const beforeDebt12 = await vault.totalDebtUsd()
  const debt6 = await pool.usdcDebtOf(vault.target)
  const bridged6 = await vault.initialBridgedUsd()
  const ysBal6 = await ys.totalAssets(addrs.MockUSDC)

  console.log('Before: NAV8', beforeNAV.toString(), '(', fmt8(beforeNAV), 'cBTC )')
  console.log('Before: supply8', beforeSupply.toString(), 'debt12', beforeDebt12.toString(), 'debt6(pool)', debt6.toString())
  console.log('Before: bridged6', bridged6.toString(), 'ysBal6', ysBal6.toString())

  // If no debt, create a small position so harvest has something to repay
  if (debt6 === 0n) {
    console.log('No USDC debt at pool; sending small deposit to create borrow path...')
    const depVal = hre.ethers.parseUnits('0.0002', 8)
    await (await vault.deposit(signer.address, { value: depVal })).wait()
  }

  // Re-evaluate bridged and ys balance
  const bridged6b = await vault.initialBridgedUsd()
  const ysBal6b = await ys.totalAssets(addrs.MockUSDC)
  console.log('Recheck: bridged6', bridged6b.toString(), 'ysBal6', ysBal6b.toString())

  // Ensure yield source balance exceeds bridged by at least +200 USDC
  let mintAmt = 0n
  if (ysBal6b <= bridged6b) {
    mintAmt = (bridged6b - ysBal6b) + hre.ethers.parseUnits('200', 6)
  } else {
    // still add +200 to make a visible change
    mintAmt = hre.ethers.parseUnits('200', 6)
  }
  console.log('Minting profit to YS (USDC 6d):', mintAmt.toString(), ' (', fmt6(mintAmt), ' USDC )')
  await (await usdc.mint(ys.target, mintAmt)).wait()

  console.log('Harvesting...')
  await (await vault.harvestCrossChainYield()).wait()

  const afterNAV = await vault.totalAssets()
  const afterDebt12 = await vault.totalDebtUsd()
  const afterDebt6 = await pool.usdcDebtOf(vault.target)
  console.log('After:  NAV8', afterNAV.toString(), '(', fmt8(afterNAV), 'cBTC )')
  console.log('After:  debt12', afterDebt12.toString(), 'debt6(pool)', afterDebt6.toString())

  if (afterNAV <= beforeNAV) {
    console.log('WARN: NAV did not increase. Try a larger profit mint or verify pool debt.')
  } else {
    console.log('OK: NAV increased by', fmt8(afterNAV - beforeNAV), 'cBTC')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })



