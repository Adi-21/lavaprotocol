/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [deployer] = await hre.ethers.getSigners();
  
  console.log('🔧 === FIXING STRATEGY ADAPTERS ===');
  console.log('Deployer:', deployer.address);
  
  const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
  const wcBTC = await hre.ethers.getContractAt('MockWcBTC', addrs.MockWcBTC);
  
  // Check each strategy adapter
  const strategiesData = await portfolioVault.getStrategies();
  const [strategyIds, strategyInfos] = strategiesData;
  
  console.log('\n🔍 Checking each adapter:');
  
  for (let i = 0; i < strategyIds.length; i++) {
    const strategyId = strategyIds[i];
    const info = strategyInfos[i];
    
    console.log(`\n--- Strategy ${strategyId} ---`);
    console.log('Adapter:', info.adapter);
    console.log('Enabled:', info.enabled);
    console.log('Allocation BPS:', info.allocationBps.toString());
    
    if (!info.enabled) {
      console.log('⏭️  Skipping disabled strategy');
      continue;
    }
    
    try {
      // Try to get the adapter contract
      const adapter = await hre.ethers.getContractAt('ZentraAdapter', info.adapter);
      
      // Check basic properties
      const vault = await adapter.vault();
      const underlying = await adapter.underlying();
      const investedBalance = await adapter.investedBalance();
      
      console.log('Vault:', vault);
      console.log('Underlying:', underlying);
      console.log('Invested balance:', investedBalance.toString());
      
      // Check if vault address matches
      if (vault.toLowerCase() !== portfolioVault.target.toLowerCase()) {
        console.log('❌ PROBLEM: Adapter vault mismatch!');
        console.log('  Expected:', portfolioVault.target);
        console.log('  Actual:', vault);
      } else {
        console.log('✅ Vault address correct');
      }
      
      // Check if underlying is WcBTC
      if (underlying.toLowerCase() !== wcBTC.target.toLowerCase()) {
        console.log('❌ PROBLEM: Wrong underlying token!');
        console.log('  Expected:', wcBTC.target);
        console.log('  Actual:', underlying);
      } else {
        console.log('✅ Underlying token correct');
      }
      
      // Check pool
      try {
        const pool = await adapter.pool();
        console.log('Pool:', pool);
        
        // Check pool balance
        const poolBalance = await wcBTC.balanceOf(pool);
        console.log('Pool balance:', poolBalance.toString());
        
        if (poolBalance < investedBalance) {
          console.log('❌ PROBLEM: Pool has less than invested balance!');
          console.log('  Pool balance:', poolBalance.toString());
          console.log('  Invested balance:', investedBalance.toString());
          
          // Try to fix by adding liquidity to pool
          console.log('🔧 Adding liquidity to pool...');
          const needed = investedBalance - poolBalance + hre.ethers.parseUnits('1', 8); // Add 1 extra BTC
          const tx = await wcBTC.mint(pool, needed);
          await tx.wait();
          console.log('✅ Added liquidity to pool');
        } else {
          console.log('✅ Pool has sufficient balance');
        }
        
      } catch (e) {
        console.log('❌ Error checking pool:', e.message);
      }
      
    } catch (e) {
      console.log('❌ Error with adapter:', e.message);
      
      // If it's a contract type error, try different contract types
      if (e.message.includes('no contract deployed') || e.message.includes('contract')) {
        console.log('🔍 Trying different adapter types...');
        
        try {
          const adapter = await hre.ethers.getContractAt('SatsumaAdapter', info.adapter);
          console.log('✅ This is a SatsumaAdapter');
          
          const vault = await adapter.vault();
          const underlying = await adapter.underlying();
          console.log('Vault:', vault);
          console.log('Underlying:', underlying);
          
        } catch (e2) {
          try {
            const adapter = await hre.ethers.getContractAt('CrossChainAdapter', info.adapter);
            console.log('✅ This is a CrossChainAdapter');
          } catch (e3) {
            console.log('❌ Unknown adapter type');
          }
        }
      }
    }
  }
  
  // Now test a small withdrawal to see if it works
  console.log('\n🧪 Testing small withdrawal after fixes...');
  
  const userShares = await portfolioVault.balanceOf(deployer.address);
  if (userShares > 0n) {
    const testShares = userShares / 100n; // 1% of shares
    
    if (testShares > 0n) {
      try {
        console.log('Testing withdrawal of', testShares.toString(), 'shares...');
        
        const tx = await portfolioVault.withdraw(testShares, deployer.address, {
          gasLimit: 2000000
        });
        
        await tx.wait();
        console.log('✅ Small withdrawal successful!');
        
        // Now try a larger withdrawal
        const largerShares = userShares / 10n; // 10% of shares
        if (largerShares > testShares) {
          console.log('Testing larger withdrawal of', largerShares.toString(), 'shares...');
          
          const tx2 = await portfolioVault.withdraw(largerShares, deployer.address, {
            gasLimit: 2000000
          });
          
          await tx2.wait();
          console.log('✅ Larger withdrawal successful!');
        }
        
      } catch (e) {
        console.log('❌ Test withdrawal failed:', e.message);
        
        if (e.message.includes('ERC20InsufficientBalance')) {
          console.log('🚨 Still getting ERC20InsufficientBalance error');
          console.log('The _routeDivest function is still not working properly');
        }
      }
    }
  }
  
  console.log('\n🏁 === ADAPTER FIX COMPLETE ===');
}

main().catch((error) => {
  console.error('Adapter fix failed:', error);
  process.exit(1);
});
