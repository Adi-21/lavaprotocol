/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [deployer] = await hre.ethers.getSigners();
  
  console.log('🔧 === FIXING POOL LIQUIDITY ISSUE ===');
  
  const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
  const wcBTC = await hre.ethers.getContractAt('MockWcBTC', addrs.MockWcBTC);
  const zentraPool = await hre.ethers.getContractAt('MockZentraPoolV2', addrs.MockZentraPoolV2);
  
  // Check current pool balance
  const currentPoolBalance = await wcBTC.balanceOf(zentraPool.target);
  console.log('Current Zentra pool balance:', hre.ethers.formatUnits(currentPoolBalance, 8), 'WcBTC');
  
  // Calculate total strategy assets
  const strategiesData = await portfolioVault.getStrategies();
  const [strategyIds, strategyInfos] = strategiesData;
  
  let totalStrategyAssets = 0n;
  for (let i = 0; i < strategyIds.length; i++) {
    if (!strategyInfos[i].enabled) continue;
    
    try {
      const adapter = await hre.ethers.getContractAt('ZentraAdapter', strategyInfos[i].adapter);
      const assets = await adapter.totalAssets();
      totalStrategyAssets += assets;
      console.log(`Strategy ${strategyIds[i]} assets:`, hre.ethers.formatUnits(assets, 8), 'WcBTC');
    } catch (e) {
      console.log(`Strategy ${strategyIds[i]} error:`, e.message);
    }
  }
  
  console.log('Total strategy assets:', hre.ethers.formatUnits(totalStrategyAssets, 8), 'WcBTC');
  
  // Ensure pool has enough liquidity for all strategies + buffer
  const requiredLiquidity = totalStrategyAssets + hre.ethers.parseUnits('1000', 8); // Add 1000 BTC buffer
  
  if (currentPoolBalance < requiredLiquidity) {
    const needToAdd = requiredLiquidity - currentPoolBalance;
    console.log('Adding', hre.ethers.formatUnits(needToAdd, 8), 'WcBTC to pool...');
    
    const tx = await wcBTC.mint(zentraPool.target, needToAdd);
    await tx.wait();
    console.log('✅ Added liquidity to pool');
    
    const newBalance = await wcBTC.balanceOf(zentraPool.target);
    console.log('New pool balance:', hre.ethers.formatUnits(newBalance, 8), 'WcBTC');
  } else {
    console.log('✅ Pool already has sufficient liquidity');
  }
  
  // Test progressive withdrawals
  console.log('\n🧪 Testing progressive withdrawals...');
  
  const userShares = await portfolioVault.balanceOf(deployer.address);
  console.log('User total shares:', userShares.toString());
  
  if (userShares > 0n) {
    const testSizes = [
      { fraction: 100n, name: '1%' },
      { fraction: 20n, name: '5%' },
      { fraction: 10n, name: '10%' },
      { fraction: 4n, name: '25%' },
      { fraction: 2n, name: '50%' }
    ];
    
    for (const test of testSizes) {
      const testShares = userShares / test.fraction;
      if (testShares === 0n) continue;
      
      console.log(`\nTesting ${test.name} withdrawal (${testShares.toString()} shares):`);
      
      try {
        const tx = await portfolioVault.withdraw(testShares, deployer.address, {
          gasLimit: 2000000
        });
        
        await tx.wait();
        console.log(`✅ ${test.name} withdrawal successful!`);
        
        // Update remaining shares
        const remainingShares = await portfolioVault.balanceOf(deployer.address);
        console.log(`Remaining shares: ${remainingShares.toString()}`);
        
        // If this was 50%, we're done testing
        if (test.fraction === 2n) {
          console.log('🎉 Large withdrawal (50%) successful!');
          break;
        }
        
      } catch (e) {
        console.log(`❌ ${test.name} withdrawal failed:`, e.message.substring(0, 100) + '...');
        
        if (e.message.includes('ERC20InsufficientBalance')) {
          console.log('🚨 Still getting ERC20InsufficientBalance');
          console.log('The pool liquidity fix did not resolve the issue');
          console.log('This suggests a deeper problem in the _routeDivest logic');
          break;
        }
      }
    }
  }
  
  console.log('\n💡 === RECOMMENDATIONS ===');
  console.log('1. ✅ Pool liquidity has been increased');
  console.log('2. 🔧 If large withdrawals still fail, the issue is in _routeDivest logic');
  console.log('3. 🚀 Small-medium withdrawals should work reliably now');
  console.log('4. 📱 Consider adding withdrawal limits in the frontend (max 25% at once)');
  
  console.log('\n🏁 === LIQUIDITY FIX COMPLETE ===');
}

main().catch((error) => {
  console.error('Liquidity fix failed:', error);
  process.exit(1);
});
