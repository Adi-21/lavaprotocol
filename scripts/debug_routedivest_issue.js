/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [user] = await hre.ethers.getSigners();
  
  console.log('🔍 === ROUTE DIVEST DEBUG ===');
  console.log('User:', user.address);
  
  const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
  const wcBTC = await hre.ethers.getContractAt('MockWcBTC', addrs.MockWcBTC);
  
  // Get current state
  const userShares = await portfolioVault.balanceOf(user.address);
  const totalSupply = await portfolioVault.totalSupply();
  const totalAssets = await portfolioVault.totalAssets();
  const vaultWcBtcBalance = await wcBTC.balanceOf(portfolioVault.target);
  
  console.log('\n📊 Current State:');
  console.log('User shares:', userShares.toString());
  console.log('Total supply:', totalSupply.toString());
  console.log('Total assets:', totalAssets.toString());
  console.log('Vault WcBTC balance:', vaultWcBtcBalance.toString());
  
  // Calculate what user should get
  const userAssets = totalSupply > 0n ? (userShares * totalAssets) / totalSupply : 0n;
  console.log('User should get:', userAssets.toString());
  console.log('Vault has:', vaultWcBtcBalance.toString());
  console.log('Shortfall:', (userAssets - vaultWcBtcBalance).toString());
  
  // This matches the explorer error!
  console.log('\n🚨 EXPLORER MATCH:');
  console.log('Balance (explorer):', '652929530048525');
  console.log('Needed (explorer):', '889257655057979');
  console.log('Our calculation - Balance:', vaultWcBtcBalance.toString());
  console.log('Our calculation - Needed:', userAssets.toString());
  
  // Check strategies in detail
  console.log('\n🎯 STRATEGY INVESTIGATION:');
  const strategiesData = await portfolioVault.getStrategies();
  const [strategyIds, strategyInfos] = strategiesData;
  
  let totalStrategyAssets = 0n;
  const strategyBalances = [];
  
  for (let i = 0; i < strategyIds.length; i++) {
    const info = strategyInfos[i];
    if (!info.enabled) {
      strategyBalances.push(0n);
      continue;
    }
    
    console.log(`\nStrategy ${strategyIds[i]}:`);
    console.log('  Adapter:', info.adapter);
    console.log('  Allocation BPS:', info.allocationBps.toString());
    
    try {
      const adapter = await hre.ethers.getContractAt('ZentraAdapter', info.adapter);
      const adapterAssets = await adapter.totalAssets();
      strategyBalances.push(adapterAssets);
      totalStrategyAssets += adapterAssets;
      
      console.log('  Assets in adapter:', adapterAssets.toString());
      
      // Check the underlying pool balance
      const underlying = await adapter.underlying();
      const pool = await adapter.pool();
      const poolBalance = await wcBTC.balanceOf(pool);
      
      console.log('  Underlying token:', underlying);
      console.log('  Pool address:', pool);
      console.log('  Pool WcBTC balance:', poolBalance.toString());
      
      // Check if adapter can actually divest
      console.log('  Testing divest capability...');
      
      // Try to simulate a small divest
      const testAmount = adapterAssets / 10n; // 10% of adapter assets
      if (testAmount > 0n) {
        try {
          // This will fail because we're not the vault, but we can see the error
          await adapter.divest.staticCall(testAmount);
          console.log('  ✅ Divest simulation succeeded');
        } catch (e) {
          if (e.message.includes('only vault')) {
            console.log('  ✅ Divest would work (only vault restriction)');
          } else {
            console.log('  ❌ Divest would fail:', e.message);
          }
        }
      }
      
    } catch (e) {
      console.log('  ❌ Error checking adapter:', e.message);
      strategyBalances.push(0n);
    }
  }
  
  console.log('\n📈 TOTALS:');
  console.log('Vault direct balance:', vaultWcBtcBalance.toString());
  console.log('Total strategy assets:', totalStrategyAssets.toString());
  console.log('Combined available:', (vaultWcBtcBalance + totalStrategyAssets).toString());
  console.log('User needs:', userAssets.toString());
  console.log('Sufficient?', (vaultWcBtcBalance + totalStrategyAssets) >= userAssets ? '✅ Yes' : '❌ No');
  
  // Simulate the _routeDivest logic
  console.log('\n🧮 SIMULATING _routeDivest:');
  const need = userAssets - vaultWcBtcBalance;
  console.log('Need from strategies:', need.toString());
  
  if (totalStrategyAssets === 0n) {
    console.log('❌ No strategy assets available!');
  } else {
    console.log('Proportional withdrawals:');
    for (let i = 0; i < strategyIds.length; i++) {
      if (!strategyInfos[i].enabled || strategyBalances[i] === 0n) continue;
      
      const pull = (need * strategyBalances[i]) / totalStrategyAssets;
      console.log(`  Strategy ${strategyIds[i]}: ${pull.toString()} (${hre.ethers.formatUnits(pull, 8)} WcBTC)`);
      
      // Check if this exceeds what the strategy has
      if (pull > strategyBalances[i]) {
        console.log(`    ❌ PROBLEM: Trying to pull ${pull.toString()} but strategy only has ${strategyBalances[i].toString()}`);
      }
    }
  }
  
  console.log('\n🏥 DIAGNOSIS:');
  if (vaultWcBtcBalance + totalStrategyAssets < userAssets) {
    console.log('❌ INSUFFICIENT TOTAL LIQUIDITY');
    console.log('This is a fundamental liquidity problem in the vault system');
  } else {
    console.log('✅ Sufficient liquidity exists');
    console.log('❌ The _routeDivest function is not working properly');
    console.log('Possible causes:');
    console.log('  1. Strategy adapters are not returning tokens to vault');
    console.log('  2. Mock pool contracts are not releasing tokens');
    console.log('  3. Rounding errors in proportional calculations');
    console.log('  4. Race condition in strategy divest calls');
  }
}

main().catch((error) => {
  console.error('Debug failed:', error);
  process.exit(1);
});
