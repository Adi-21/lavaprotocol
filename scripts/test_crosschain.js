/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const hre = require('hardhat')

async function main() {
  const addrs = JSON.parse(fs.readFileSync(path.join(__dirname, 'crosschain-addresses.json'), 'utf8'))
  const [owner] = await hre.ethers.getSigners()
  console.log('Owner:', owner.address)

  const usdc = await hre.ethers.getContractAt('MockUSDC', addrs.MockUSDC)
  const ys = await hre.ethers.getContractAt('MockInstitutionalYieldSource', addrs.MockInstitutionalYieldSource)
  const vault = await hre.ethers.getContractAt('LavaCrossChainVault', addrs.LavaCrossChainVault)

  const nav1 = await vault.totalAssets()
  console.log('NAV before harvest (WcBTC 8d):', nav1.toString())

  // Simulate profit and harvest
  await (await usdc.mint(ys.target, hre.ethers.parseUnits('50', 6))).wait()
  await (await vault.harvestCrossChainYield()).wait()
  const nav2 = await vault.totalAssets()
  console.log('NAV after harvest (WcBTC 8d):', nav2.toString())

  if (nav2 <= nav1) throw new Error('NAV did not increase')
  console.log('OK: NAV increased')
}

main().catch((e) => { console.error(e); process.exit(1) })



