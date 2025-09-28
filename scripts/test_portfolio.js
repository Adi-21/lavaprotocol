/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const hre = require('hardhat')

function approxEq(actual, expectedNum, label, tol = 5n) {
  const diff = (actual > expectedNum ? actual - expectedNum : expectedNum - actual)
  const ok = diff <= tol
  console.log(`${label}: actual=${actual} expected≈${expectedNum} tol=${tol} -> ${ok ? 'OK' : 'FAIL'}`)
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function main() {
  const addrsPath = fs.existsSync(path.join(__dirname, 'portfolio-addresses.json'))
    ? path.join(__dirname, 'portfolio-addresses.json')
    : path.join(__dirname, 'strategy6-addresses.json')
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'))

  const wc = await hre.ethers.getContractAt('MockWcBTC', addrs.MockWcBTC)
  const portfolio = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault)
  const zAdapter = await hre.ethers.getContractAt('ZentraAdapter', addrs.ZentraAdapter)
  const sAdapter = await hre.ethers.getContractAt('SatsumaAdapter', addrs.SatsumaAdapter)
  const cAdapter = await hre.ethers.getContractAt('CrossChainAdapter', addrs.CrossChainAdapter)

  const [user] = await hre.ethers.getSigners()
  console.log('Tester:', user.address)

  const reserveBps = await portfolio.reserveBps()
  const totalBefore = await portfolio.totalAssets()
  const reserveBefore = await wc.balanceOf(await portfolio.getAddress())
  const zBefore = await zAdapter.investedBalance()
  const sBefore = await sAdapter.investedBalance()
  const cBefore = await cAdapter.totalAssets()
  console.log('reserveBps:', reserveBps, 'totalAssets before:', totalBefore.toString())

  // Deposit 0.0002 cBTC (8 decimals)
  const deposit = hre.ethers.parseUnits('0.0002', 8)
  // Retry deposit with fixed gasLimit to avoid estimator issues on Citrea
  let sent = false
  const maxFee = process.env.CITREA_MAX_FEE_GWEI ? hre.ethers.parseUnits(process.env.CITREA_MAX_FEE_GWEI, 'gwei') : undefined
  const maxPrio = process.env.CITREA_PRIORITY_GWEI ? hre.ethers.parseUnits(process.env.CITREA_PRIORITY_GWEI, 'gwei') : undefined
  for (let i = 0; i < 5 && !sent; i++) {
    try {
      const overrides = maxFee && maxPrio ? { value: deposit, gasLimit: 700000, maxFeePerGas: maxFee, maxPriorityFeePerGas: maxPrio } : { value: deposit, gasLimit: 700000 }
      const tx = await portfolio.connect(user).deposit(user.address, overrides)
      await tx.wait()
      sent = true
    } catch (e) {
      console.log(`deposit attempt ${i + 1} failed:`, e?.shortMessage || e?.message || e)
      await sleep(1500 * (i + 1))
    }
  }
  if (!sent) throw new Error('deposit failed after retries')

  const totalAfter = await portfolio.totalAssets()
  const reserveBal = await wc.balanceOf(await portfolio.getAddress())
  const zBal = await zAdapter.investedBalance()
  const sBal = await sAdapter.investedBalance()
  const cBal = await cAdapter.totalAssets()

  console.log('totalAssets after:', totalAfter.toString())
  console.log('reserve (WcBTC at vault):', reserveBal.toString())
  console.log('Zentra investedBalance:', zBal.toString())
  console.log('Satsuma investedBalance:', sBal.toString())
  console.log('CrossChain custody:', cBal.toString())

  // Expectations (approximate, allows minor rounding)
  // Use deltas to ignore previous deposits
  const dReserve = reserveBal - reserveBefore
  const dZ = zBal - zBefore
  const dS = sBal - sBefore
  const dC = cBal - cBefore
  const expectReserve = (deposit * BigInt(reserveBps)) / 10000n
  const expectZentra = (deposit * 3000n) / 10000n
  const expectSatsuma = (deposit * 2500n) / 10000n
  const expectCross = (deposit * 2500n) / 10000n

  approxEq(dReserve, expectReserve, 'Reserve ~20% (delta)')
  approxEq(dZ, expectZentra, 'Zentra ~30% (delta)')
  approxEq(dS, expectSatsuma, 'Satsuma ~25% (delta)')
  approxEq(dC, expectCross, 'Cross-Chain ~25% (delta)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


