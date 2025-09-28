/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const hre = require('hardhat')

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  console.log('Deployer:', deployer.address)

  // Mocks
  const MockWcBTC = await hre.ethers.getContractFactory('MockWcBTC')
  const wc = await MockWcBTC.deploy()
  await wc.waitForDeployment()
  console.log('MockWcBTC:', wc.target)

  const MockUSDC = await hre.ethers.getContractFactory('MockUSDC')
  const usdc = await MockUSDC.deploy()
  await usdc.waitForDeployment()
  console.log('MockUSDC:', usdc.target)

  const MockZentraPoolV2 = await hre.ethers.getContractFactory('MockZentraPoolV2')
  const pool = await MockZentraPoolV2.deploy(wc.target, usdc.target)
  await pool.waitForDeployment()
  console.log('MockZentraPoolV2:', pool.target)

  const MockInstitutionalYieldSource = await hre.ethers.getContractFactory('MockInstitutionalYieldSource')
  const ys = await MockInstitutionalYieldSource.deploy(deployer.address)
  await ys.waitForDeployment()
  console.log('MockInstitutionalYieldSource:', ys.target)

  const MockBridge = await hre.ethers.getContractFactory('MockBridge')
  const bridge = await MockBridge.deploy(deployer.address)
  await bridge.waitForDeployment()
  console.log('MockBridge:', bridge.target)
  await (await bridge.setYieldSource(ys.target)).wait()
  await (await ys.transferOwnership(bridge.target)).wait()

  // Portfolio
  const Vault = await hre.ethers.getContractFactory('LavaPortfolioVault')
  const portfolio = await Vault.deploy(wc.target, 2000) // 20%
  await portfolio.waitForDeployment()
  console.log('LavaPortfolioVault:', portfolio.target)

  // Satsuma LP mock
  const MockSatsumaLPVault = await hre.ethers.getContractFactory('MockSatsumaLPVault')
  const mockLp = await MockSatsumaLPVault.deploy(wc.target)
  await mockLp.waitForDeployment()
  console.log('MockSatsumaLPVault:', mockLp.target)

  // Adapters
  const ZentraAdapter = await hre.ethers.getContractFactory('ZentraAdapter')
  const zAdapter = await ZentraAdapter.deploy(portfolio.target, wc.target, pool.target)
  await zAdapter.waitForDeployment()
  console.log('ZentraAdapter:', zAdapter.target)

  const SatsumaAdapter = await hre.ethers.getContractFactory('SatsumaAdapter')
  const sAdapter = await SatsumaAdapter.deploy(portfolio.target, wc.target, mockLp.target)
  await sAdapter.waitForDeployment()
  console.log('SatsumaAdapter:', sAdapter.target)

  const CrossChainAdapter = await hre.ethers.getContractFactory('CrossChainAdapter')
  const cAdapter = await CrossChainAdapter.deploy(portfolio.target, wc.target, usdc.target, bridge.target, ys.target)
  await cAdapter.waitForDeployment()
  console.log('CrossChainAdapter:', cAdapter.target)

  // Register strategies 30/25/25 (80 total)
  await (await portfolio.addStrategy(1, zAdapter.target, 3000)).wait()
  await (await portfolio.addStrategy(2, sAdapter.target, 2500)).wait()
  await (await portfolio.addStrategy(3, cAdapter.target, 2500)).wait()

  // Seed pool liquidity for potential leverage paths (not used here but safe)
  await (await usdc.mint(pool.target, hre.ethers.parseUnits('1000000', 6))).wait()

  const out = {
    network: 'localhost',
    deployer: deployer.address,
    MockWcBTC: wc.target,
    MockUSDC: usdc.target,
    MockZentraPoolV2: pool.target,
    MockInstitutionalYieldSource: ys.target,
    MockBridge: bridge.target,
    LavaPortfolioVault: portfolio.target,
    ZentraAdapter: zAdapter.target,
    SatsumaAdapter: sAdapter.target,
    CrossChainAdapter: cAdapter.target,
    SATSUMA_LP_VAULT: mockLp.target,
  }
  const outPath = path.join(__dirname, 'portfolio-addresses.json')
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log('Saved addresses to', outPath)
}

main().catch((e) => { console.error(e); process.exit(1) })


