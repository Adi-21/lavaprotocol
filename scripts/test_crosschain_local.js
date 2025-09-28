/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const hre = require('hardhat')

async function main() {
  const addrs = JSON.parse(fs.readFileSync(path.join(__dirname, 'crosschain-addresses.json'), 'utf8'))
  const [owner] = await hre.ethers.getSigners()
  console.log('Owner:', owner.address)

  const wc = await hre.ethers.getContractAt('MockWcBTC', addrs.MockWcBTC)
  const usdc = await hre.ethers.getContractAt('MockUSDC', addrs.MockUSDC)
  const ys = await hre.ethers.getContractAt('MockInstitutionalYieldSource', addrs.MockInstitutionalYieldSource)
  const vault = await hre.ethers.getContractAt('LavaCrossChainVault', addrs.LavaCrossChainVault)

  // Deposit 0.0002 cBTC
  const depositVal = hre.ethers.parseUnits('0.0002', 8)
  const tx1 = await vault.deposit(owner.address, { value: depositVal })
  await tx1.wait()
  console.log('Deposited 0.0002 cBTC')

  const nav1 = await vault.totalAssets()
  console.log('NAV after deposit (WcBTC 8d):', nav1.toString())

  // Simulate profit at yield source (e.g., 50 USDC)
  const mintAmt = hre.ethers.parseUnits('50', 6)
  await (await usdc.mint(ys.target, mintAmt)).wait()
  console.log('Minted profit to yield source')

  // Harvest and verify NAV increases
  await (await vault.harvestCrossChainYield()).wait()
  const nav2 = await vault.totalAssets()
  console.log('NAV after harvest (WcBTC 8d):', nav2.toString())

  if (nav2 <= nav1) {
    throw new Error('Expected NAV to increase after harvest')
  }
  console.log('OK: NAV increased')
}

main().catch((e) => { console.error(e); process.exit(1) })



