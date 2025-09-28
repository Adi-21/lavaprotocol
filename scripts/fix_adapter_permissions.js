/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [deployer] = await hre.ethers.getSigners();
  
  console.log('🔧 === FIXING ADAPTER PERMISSIONS ===');
  console.log('Deployer:', deployer.address);
  
  const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
  
  // Get strategies
  const strategiesData = await portfolioVault.getStrategies();
  const [strategyIds, strategyInfos] = strategiesData;
  
  console.log('\n🔍 Checking adapter permissions:');
  
  for (let i = 0; i < strategyIds.length; i++) {
    const info = strategyInfos[i];
    if (!info.enabled) continue;
    
    console.log(`\nStrategy ${strategyIds[i]}:`);
    console.log('  Adapter:', info.adapter);
    
    try {
      const adapter = await hre.ethers.getContractAt('ZentraAdapter', info.adapter);
      
      // Check what vault the adapter thinks it belongs to
      const adapterVault = await adapter.vault();
      console.log('  Adapter vault:', adapterVault);
      console.log('  Expected vault:', portfolioVault.target);
      console.log('  Match:', adapterVault.toLowerCase() === portfolioVault.target.toLowerCase() ? '✅' : '❌');
      
      if (adapterVault.toLowerCase() !== portfolioVault.target.toLowerCase()) {
        console.log('  ❌ PROBLEM: Adapter vault mismatch!');
      }
      
      // Check adapter owner
      const adapterOwner = await adapter.owner();
      console.log('  Adapter owner:', adapterOwner);
      console.log('  Vault address:', portfolioVault.target);
      console.log('  Owner match:', adapterOwner.toLowerCase() === portfolioVault.target.toLowerCase() ? '✅' : '❌');
      
      // Try to call divest from the vault's perspective
      console.log('  Testing divest call...');
      try {
        // We can't actually call this from here since we're not the vault,
        // but we can check the adapter's invested balance
        const investedBalance = await adapter.investedBalance();
        console.log('  Invested balance:', hre.ethers.formatUnits(investedBalance, 8), 'WcBTC');
        
        if (investedBalance > 0n) {
          console.log('  ✅ Adapter has assets to divest');
        } else {
          console.log('  ⚠️  Adapter has no assets');
        }
      } catch (e) {
        console.log('  ❌ Error testing divest:', e.message);
      }
      
    } catch (e) {
      console.log('  ❌ Error checking adapter:', e.message);
    }
  }
  
  // The real fix: Test if we can manually trigger a withdrawal that works
  console.log('\n🧪 Testing manual withdrawal process:');
  
  try {
    // Get user shares
    const userShares = await portfolioVault.balanceOf(deployer.address);
    
    if (userShares > 0n) {
      // Try a very small withdrawal first
      const testShares = userShares / 1000n; // 0.1% of shares
      
      if (testShares > 0n) {
        console.log('Testing tiny withdrawal of', hre.ethers.formatUnits(testShares, 18), 'shares...');
        
        const tx = await portfolioVault.withdraw(testShares, deployer.address, {
          gasLimit: 500000 // High gas limit
        });
        
        console.log('Transaction hash:', tx.hash);
        await tx.wait();
        console.log('✅ Tiny withdrawal successful!');
      }
    }
  } catch (e) {
    console.log('❌ Manual withdrawal test failed:', e.message);
    
    // If it's still the same error, the issue is deeper
    if (e.message.includes('ERC20InsufficientBalance') || e.data?.includes('e450d38c')) {
      console.log('\n🔍 === DEEPER INVESTIGATION NEEDED ===');
      console.log('The issue is in the _routeDivest function execution.');
      console.log('Possible causes:');
      console.log('1. Adapter contracts are not properly configured');
      console.log('2. Mock Zentra pool is not returning tokens properly');
      console.log('3. There is a bug in the divest logic');
      console.log('4. The adapters were deployed with wrong vault address');
    }
  }
  
  console.log('\n🏁 === PERMISSION CHECK COMPLETE ===');
}

main().catch((error) => {
  console.error('Permission fix failed:', error);
  process.exit(1);
});
