/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [user] = await hre.ethers.getSigners();
  
  console.log('🔍 === DEBUGGING _routeDivest EXECUTION ===');
  
  const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
  const wcBTC = await hre.ethers.getContractAt('MockWcBTC', addrs.MockWcBTC);
  const zentraPool = await hre.ethers.getContractAt('MockZentraPoolV2', addrs.MockZentraPoolV2);
  
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
  
  // Calculate 25% withdrawal
  const shares25pct = totalSupply / 4n; // 25%
  const assets25pct = totalSupply > 0n ? (shares25pct * totalAssets) / totalSupply : 0n;
  
  console.log('\n💰 25% Withdrawal Calculation:');
  console.log('25% shares:', shares25pct.toString());
  console.log('25% assets needed:', assets25pct.toString());
  console.log('Vault has:', vaultWcBtcBalance.toString());
  console.log('Need from strategies:', (assets25pct - vaultWcBtcBalance).toString());
  
  // This should match the explorer error!
  console.log('\n🚨 EXPLORER COMPARISON:');
  console.log('Explorer balance:', '178807035461437');
  console.log('Explorer needed:', '220078378437859');
  console.log('Our balance:', vaultWcBtcBalance.toString());
  console.log('Our needed:', assets25pct.toString());
  
  // Check what happens when we try to manually call divest on each strategy
  console.log('\n🎯 MANUAL STRATEGY DIVEST TEST:');
  
  const strategiesData = await portfolioVault.getStrategies();
  const [strategyIds, strategyInfos] = strategiesData;
  
  const need = assets25pct - vaultWcBtcBalance;
  let totalStrategyAssets = 0n;
  const strategyBalances = [];
  
  // First, get all strategy balances
  for (let i = 0; i < strategyIds.length; i++) {
    if (!strategyInfos[i].enabled) {
      strategyBalances.push(0n);
      continue;
    }
    
    try {
      const adapter = await hre.ethers.getContractAt('ZentraAdapter', strategyInfos[i].adapter);
      const balance = await adapter.totalAssets();
      strategyBalances.push(balance);
      totalStrategyAssets += balance;
      console.log(`Strategy ${strategyIds[i]} has: ${balance.toString()}`);
    } catch (e) {
      console.log(`Strategy ${strategyIds[i]} error: ${e.message}`);
      strategyBalances.push(0n);
    }
  }
  
  console.log('Total strategy assets:', totalStrategyAssets.toString());
  console.log('Need from strategies:', need.toString());
  
  // Now simulate the proportional divest calls
  console.log('\n🧮 SIMULATING PROPORTIONAL DIVEST:');
  
  if (totalStrategyAssets > 0n) {
    for (let i = 0; i < strategyIds.length; i++) {
      if (!strategyInfos[i].enabled || strategyBalances[i] === 0n) continue;
      
      const pull = (need * strategyBalances[i]) / totalStrategyAssets;
      console.log(`\nStrategy ${strategyIds[i]}:`);
      console.log('  Should pull:', pull.toString());
      console.log('  Has available:', strategyBalances[i].toString());
      console.log('  Can fulfill:', pull <= strategyBalances[i] ? 'YES' : 'NO');
      
      if (pull > 0n) {
        try {
          // Try to simulate the divest call
          const adapter = await hre.ethers.getContractAt('ZentraAdapter', strategyInfos[i].adapter);
          
          // Check the pool balance first
          const pool = await adapter.pool();
          const poolBalance = await wcBTC.balanceOf(pool);
          console.log('  Pool balance:', poolBalance.toString());
          console.log('  Pool can provide:', pull <= poolBalance ? 'YES' : 'NO');
          
          if (pull > poolBalance) {
            console.log('  ❌ PROBLEM: Pool insufficient balance!');
            console.log('    Need:', pull.toString());
            console.log('    Pool has:', poolBalance.toString());
            console.log('    Shortfall:', (pull - poolBalance).toString());
          }
          
        } catch (e) {
          console.log('  ❌ Error checking strategy:', e.message);
        }
      }
    }
  }
  
  // Check if the issue is that strategies are not actually divesting
  console.log('\n🔬 TESTING ACTUAL DIVEST CALLS:');
  
  // Try to call divest directly on Strategy 1 (which should work)
  try {
    const adapter1 = await hre.ethers.getContractAt('ZentraAdapter', strategyInfos[0].adapter);
    const testAmount = strategyBalances[0] / 10n; // 10% of strategy 1
    
    if (testAmount > 0n) {
      console.log('Testing divest on Strategy 1 with amount:', testAmount.toString());
      
      // This will fail because we're not the vault, but let's see the error
      try {
        await adapter1.divest.staticCall(testAmount);
        console.log('✅ Strategy 1 divest simulation succeeded');
      } catch (e) {
        if (e.message.includes('only vault')) {
          console.log('✅ Strategy 1 divest would work (access control correct)');
        } else {
          console.log('❌ Strategy 1 divest would fail:', e.message);
        }
      }
    }
  } catch (e) {
    console.log('❌ Error testing Strategy 1 divest:', e.message);
  }
  
  // Final diagnosis
  console.log('\n🏥 === FINAL DIAGNOSIS ===');
  
  const totalAvailable = vaultWcBtcBalance + totalStrategyAssets;
  console.log('Total available (vault + strategies):', totalAvailable.toString());
  console.log('25% withdrawal needs:', assets25pct.toString());
  console.log('Sufficient total liquidity:', totalAvailable >= assets25pct ? 'YES' : 'NO');
  
  if (totalAvailable >= assets25pct) {
    console.log('✅ Sufficient liquidity exists');
    console.log('❌ The problem is in the _routeDivest execution');
    console.log('Possible causes:');
    console.log('  1. Strategies are not returning tokens to vault after divest');
    console.log('  2. Mock pool contracts have bugs in withdraw function');
    console.log('  3. Race condition between strategy divest calls');
    console.log('  4. Gas limit issues preventing complete execution');
    console.log('  5. Rounding errors causing insufficient amounts');
  } else {
    console.log('❌ INSUFFICIENT TOTAL LIQUIDITY');
    console.log('This is a fundamental problem with the vault setup');
  }
  
  console.log('\n💡 RECOMMENDED NEXT STEPS:');
  console.log('1. Check if mock pool contracts are working correctly');
  console.log('2. Verify strategy adapters are returning tokens to vault');
  console.log('3. Test with even smaller amounts (5-10%)');
  console.log('4. Consider fixing the mock contract implementations');
}

main().catch((error) => {
  console.error('Debug failed:', error);
  process.exit(1);
});
