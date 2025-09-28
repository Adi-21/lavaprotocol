/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  // Load addresses
  const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [deployer] = await hre.ethers.getSigners();
  
  console.log('🔧 === WITHDRAWAL ISSUE FIX SCRIPT ===');
  console.log('Deployer address:', deployer.address);
  
  // Get contracts
  const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
  const wcBTC = await hre.ethers.getContractAt('MockWcBTC', addrs.MockWcBTC);
  const zentraPool = await hre.ethers.getContractAt('MockZentraPoolV2', addrs.MockZentraPoolV2);
  
  console.log('\n🏥 === APPLYING FIXES ===');
  
  // Fix 1: Ensure Zentra pool has sufficient WcBTC liquidity
  console.log('Fix 1: Adding liquidity to Zentra pool...');
  const zentraBalance = await wcBTC.balanceOf(zentraPool.target);
  const targetLiquidity = hre.ethers.parseUnits('10', 8); // 10 WcBTC
  
  if (zentraBalance < targetLiquidity) {
    console.log('Current Zentra balance:', hre.ethers.formatUnits(zentraBalance, 8), 'WcBTC');
    console.log('Target liquidity:', hre.ethers.formatUnits(targetLiquidity, 8), 'WcBTC');
    
    const needToMint = targetLiquidity - zentraBalance;
    console.log('Minting', hre.ethers.formatUnits(needToMint, 8), 'WcBTC to Zentra pool...');
    
    // Mint WcBTC directly to Zentra pool (this is a mock, so we can do this)
    const tx1 = await wcBTC.mint(zentraPool.target, needToMint);
    await tx1.wait();
    console.log('✅ Liquidity added to Zentra pool');
  } else {
    console.log('✅ Zentra pool already has sufficient liquidity');
  }
  
  // Fix 2: Ensure vault has some reserve
  console.log('\nFix 2: Checking vault reserve...');
  const vaultBalance = await wcBTC.balanceOf(portfolioVault.target);
  const totalAssets = await portfolioVault.totalAssets();
  const reserveBps = await portfolioVault.reserveBps();
  const expectedReserve = (totalAssets * reserveBps) / 10000n;
  
  console.log('Vault WcBTC balance:', hre.ethers.formatUnits(vaultBalance, 8), 'WcBTC');
  console.log('Expected reserve:', hre.ethers.formatUnits(expectedReserve, 8), 'WcBTC');
  
  if (vaultBalance < expectedReserve / 2n) { // If less than half expected reserve
    const needToAdd = expectedReserve / 2n;
    console.log('Adding', hre.ethers.formatUnits(needToAdd, 8), 'WcBTC to vault reserve...');
    
    const tx2 = await wcBTC.mint(portfolioVault.target, needToAdd);
    await tx2.wait();
    console.log('✅ Reserve added to vault');
  } else {
    console.log('✅ Vault has sufficient reserve');
  }
  
  // Fix 3: Check and fix strategy adapter balances
  console.log('\nFix 3: Checking strategy adapters...');
  const strategiesData = await portfolioVault.getStrategies();
  const [strategyIds, strategyInfos] = strategiesData;
  
  for (let i = 0; i < strategyIds.length; i++) {
    const info = strategyInfos[i];
    if (!info.enabled) continue;
    
    try {
      const adapter = await hre.ethers.getContractAt('ZentraAdapter', info.adapter);
      const investedBalance = await adapter.investedBalance();
      const actualBalance = await wcBTC.balanceOf(zentraPool.target);
      
      console.log(`Strategy ${strategyIds[i]}:`);
      console.log('  - Invested balance:', hre.ethers.formatUnits(investedBalance, 8), 'WcBTC');
      console.log('  - Zentra pool balance:', hre.ethers.formatUnits(actualBalance, 8), 'WcBTC');
      
      // If invested balance is greater than what's available, this could cause issues
      if (investedBalance > actualBalance) {
        console.log('  - ⚠️  Invested balance exceeds pool balance');
        console.log('  - This could cause withdrawal failures');
      } else {
        console.log('  - ✅ Strategy balance looks good');
      }
    } catch (e) {
      console.log(`Strategy ${strategyIds[i]} check failed:`, e.message);
    }
  }
  
  // Fix 4: Test a small withdrawal
  console.log('\nFix 4: Testing small withdrawal...');
  const userShares = await portfolioVault.balanceOf(deployer.address);
  
  if (userShares > 0n) {
    const testShares = userShares / 10n; // Withdraw 10% for testing
    if (testShares > 0n) {
      console.log('Testing withdrawal of', hre.ethers.formatUnits(testShares, 18), 'shares...');
      
      try {
        // Estimate gas first
        const gasEstimate = await portfolioVault.withdraw.estimateGas(testShares, deployer.address);
        console.log('Gas estimate:', gasEstimate.toString());
        
        // Try the actual withdrawal
        const tx3 = await portfolioVault.withdraw(testShares, deployer.address);
        await tx3.wait();
        console.log('✅ Test withdrawal successful!');
        
      } catch (e) {
        console.log('❌ Test withdrawal failed:', e.message);
        
        // Try to decode the error
        if (e.data) {
          console.log('Error data:', e.data);
        }
        if (e.reason) {
          console.log('Error reason:', e.reason);
        }
      }
    } else {
      console.log('User shares too small for test withdrawal');
    }
  } else {
    console.log('User has no shares for test withdrawal');
  }
  
  console.log('\n🏁 === FIX SCRIPT COMPLETE ===');
  console.log('If withdrawals still fail, the issue may be:');
  console.log('1. Frontend transaction parameters');
  console.log('2. Gas limit too low');
  console.log('3. Slippage in mock DEX operations');
  console.log('4. Contract logic bug requiring code fix');
}

main().catch((error) => {
  console.error('Fix script failed:', error);
  process.exit(1);
});
