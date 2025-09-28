/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const hre = require('hardhat')

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
async function retry(label, fn, retries = 3, delayMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try { return await fn() } catch (e) {
      console.log(`[retry] ${label} failed (${i + 1}/${retries})`, e?.shortMessage || e?.message || e)
      if (i === retries - 1) throw e
      await sleep(delayMs * (i + 1))
    }
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  console.log('Deployer:', deployer.address)

  // Optional fee overrides (no-op on localhost)
  const maxFee = process.env.CITREA_MAX_FEE_GWEI ? hre.ethers.parseUnits(process.env.CITREA_MAX_FEE_GWEI, 'gwei') : undefined
  const maxPrio = process.env.CITREA_PRIORITY_GWEI ? hre.ethers.parseUnits(process.env.CITREA_PRIORITY_GWEI, 'gwei') : undefined
  const gasPrice = process.env.CITREA_GAS_PRICE ? hre.ethers.parseUnits(process.env.CITREA_GAS_PRICE, 'gwei') : undefined
  const overrides = maxFee && maxPrio ? { maxFeePerGas: maxFee, maxPriorityFeePerGas: maxPrio } : (gasPrice ? { gasPrice } : {})

  // --- Deploy mocks needed for cross-chain vault ---
  const MockWcBTC = await hre.ethers.getContractFactory('MockWcBTC')
  const wc = await retry('deploy MockWcBTC', () => MockWcBTC.deploy(overrides))
  await wc.waitForDeployment()
  console.log('MockWcBTC:', wc.target)

  const MockUSDC = await hre.ethers.getContractFactory('MockUSDC')
  const usdc = await retry('deploy MockUSDC', () => MockUSDC.deploy(overrides))
  await usdc.waitForDeployment()
  console.log('MockUSDC:', usdc.target)

  const MockZentraPoolV2 = await hre.ethers.getContractFactory('MockZentraPoolV2')
  const pool = await retry('deploy MockZentraPoolV2', () => MockZentraPoolV2.deploy(wc.target, usdc.target, overrides))
  await pool.waitForDeployment()
  console.log('MockZentraPoolV2:', pool.target)

  const MockInstitutionalYieldSource = await hre.ethers.getContractFactory('MockInstitutionalYieldSource')
  const ys = await retry('deploy MockInstitutionalYieldSource', () => MockInstitutionalYieldSource.deploy(deployer.address, overrides))
  await ys.waitForDeployment()
  console.log('MockInstitutionalYieldSource:', ys.target)

  const MockBridge = await hre.ethers.getContractFactory('MockBridge')
  const bridge = await retry('deploy MockBridge', () => MockBridge.deploy(deployer.address, overrides))
  await bridge.waitForDeployment()
  console.log('MockBridge:', bridge.target)
  await (await retry('bridge.setYieldSource', () => bridge.setYieldSource(ys.target))).wait()
  await (await retry('ys.transferOwnership', () => ys.transferOwnership(bridge.target))).wait()
  console.log('Yield source owner -> bridge OK')

  // Seed USDC liquidity to pool to allow borrow/repay
  await (await retry('usdc.mint(pool,1e6)', () => usdc.mint(pool.target, hre.ethers.parseUnits('1000000', 6)))).wait()
  console.log('Seeded USDC to pool')

  // --- Deploy cross-chain vault ---
  const Vault = await hre.ethers.getContractFactory('LavaCrossChainVault')
  const vault = await retry('deploy LavaCrossChainVault', () => Vault.deploy(wc.target, usdc.target, pool.target, bridge.target, ys.target, overrides))
  await vault.waitForDeployment()
  console.log('LavaCrossChainVault:', vault.target)

  // Bridge ownership -> vault (vault orchestrates bridge ops)
  await (await retry('bridge.transferOwnership(vault)', () => bridge.transferOwnership(vault.target))).wait()
  console.log('Bridge owner -> vault OK')

  // Save addresses
  const out = {
    network: hre.network.name,
    deployer: deployer.address,
    MockWcBTC: wc.target,
    MockUSDC: usdc.target,
    MockZentraPoolV2: pool.target,
    MockInstitutionalYieldSource: ys.target,
    MockBridge: bridge.target,
    LavaCrossChainVault: vault.target,
  }
  const outPath = path.join(__dirname, 'crosschain-addresses.json')
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log('Saved addresses to', outPath)
}

main().catch((e) => { console.error(e); process.exit(1) })



