/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [user] = await hre.ethers.getSigners();
  
  console.log('🔍 === BALANCE INVESTIGATION ===');
  
  const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
  const wcBTC = await hre.ethers.getContractAt('MockWcBTC', addrs.MockWcBTC);
  
  // Get detailed state
  const userShares = await portfolioVault.balanceOf(user.address);
  const totalSupply = await portfolioVault.totalSupply();
  const totalAssets = await portfolioVault.totalAssets();
  const vaultWcBtcBalance = await wcBTC.balanceOf(portfolioVault.target);
  
  console.log('📊 Current State:');
  console.log('  User shares:', userShares.toString(), '(' + hre.ethers.formatUnits(userShares, 18) + ')');
  console.log('  Total supply:', totalSupply.toString(), '(' + hre.ethers.formatUnits(totalSupply, 18) + ')');
  console.log('  Total assets:', totalAssets.toString(), '(' + hre.ethers.formatUnits(totalAssets, 8) + ')');
  console.log('  Vault WcBTC balance:', vaultWcBtcBalance.toString(), '(' + hre.ethers.formatUnits(vaultWcBtcBalance, 8) + ')');
  
  // Calculate what the user should get
  const userAssets = totalSupply > 0n ? (userShares * totalAssets) / totalSupply : 0n;
  console.log('  User should get:', userAssets.toString(), '(' + hre.ethers.formatUnits(userAssets, 8) + ')');
  
  // Check the _routeDivest logic step by step
  console.log('\n🔍 Simulating _routeDivest logic:');
  const reserveBps = await portfolioVault.reserveBps();
  console.log('  Reserve BPS:', reserveBps.toString());
  
  if (vaultWcBtcBalance >= userAssets) {
    console.log('  ✅ Can serve entirely from reserve');
  } else {
    const need = userAssets - vaultWcBtcBalance;
    console.log('  ❌ Need from strategies:', need.toString(), '(' + hre.ethers.formatUnits(need, 8) + ')');
    
    // Check strategies
    const strategiesData = await portfolioVault.getStrategies();
    const [strategyIds, strategyInfos] = strategiesData;
    
    let totalStrategyAssets = 0n;
    const strategyAssets = [];
    
    for (let i = 0; i < strategyIds.length; i++) {
      if (!strategyInfos[i].enabled) {
        strategyAssets.push(0n);
        continue;
      }
      
      const adapter = await hre.ethers.getContractAt('ZentraAdapter', strategyInfos[i].adapter);
      const assets = await adapter.totalAssets();
      strategyAssets.push(assets);
      totalStrategyAssets += assets;
      
      console.log(`    Strategy ${strategyIds[i]}: ${assets.toString()} (${hre.ethers.formatUnits(assets, 8)})`);
    }
    
    console.log('  Total strategy assets:', totalStrategyAssets.toString(), '(' + hre.ethers.formatUnits(totalStrategyAssets, 8) + ')');
    
    if (totalStrategyAssets === 0n) {
      console.log('  ❌ PROBLEM: No strategy assets available!');
    } else {
      // Simulate proportional withdrawal
      console.log('\n🧮 Simulating proportional withdrawal:');
      for (let i = 0; i < strategyIds.length; i++) {
        if (!strategyInfos[i].enabled || strategyAssets[i] === 0n) continue;
        
        const pull = (need * strategyAssets[i]) / totalStrategyAssets;
        console.log(`    Strategy ${strategyIds[i]} should provide: ${pull.toString()} (${hre.ethers.formatUnits(pull, 8)})`);
        
        // Check if the adapter can actually provide this
        const adapter = await hre.ethers.getContractAt('ZentraAdapter', strategyInfos[i].adapter);
        try {
          // Try to simulate the divest call
          const result = await adapter.divest.staticCall(pull);
          console.log(`    Strategy ${strategyIds[i]} can provide: ${result.toString()} (${hre.ethers.formatUnits(result, 8)})`);
        } catch (e) {
          console.log(`    Strategy ${strategyIds[i]} CANNOT provide: ${e.message}`);
        }
      }
    }
  }
  
  // Check if the issue is in the asset.withdraw call
  console.log('\n💰 Checking WcBTC withdraw capability:');
  try {
    // Check if the vault can withdraw the calculated amount from WcBTC
    const canWithdraw = await wcBTC.balanceOf(portfolioVault.target);
    console.log('  Vault can withdraw up to:', canWithdraw.toString(), '(' + hre.ethers.formatUnits(canWithdraw, 8) + ')');
    
    if (userAssets > canWithdraw) {
      console.log('  ❌ PROBLEM: User wants more than vault has in WcBTC!');
      console.log('  This suggests the _routeDivest is not working properly');
    }
  } catch (e) {
    console.log('  Error checking withdraw capability:', e.message);
  }
  
  console.log('\n🏥 === CONCLUSION ===');
  if (userAssets > vaultWcBtcBalance) {
    console.log('❌ The issue is that _routeDivest is not properly pulling assets from strategies');
    console.log('   The vault needs to get assets from strategies before calling asset.withdraw()');
  } else {
    console.log('✅ The vault should have sufficient balance');
  }
}

main().catch((error) => {
  console.error('Investigation failed:', error);
  process.exit(1);
});
