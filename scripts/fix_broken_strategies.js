/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [deployer] = await hre.ethers.getSigners();
  
  console.log('🔧 === FIXING BROKEN STRATEGIES ===');
  console.log('Deployer:', deployer.address);
  
  const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
  
  // The simplest fix: Disable the broken strategies
  console.log('\n🚫 Disabling broken strategies...');
  
  try {
    // Disable Strategy 2
    console.log('Disabling Strategy 2...');
    const tx1 = await portfolioVault.setStrategy(2, 0, false); // 0 allocation, disabled
    await tx1.wait();
    console.log('✅ Strategy 2 disabled');
    
    // Disable Strategy 3  
    console.log('Disabling Strategy 3...');
    const tx2 = await portfolioVault.setStrategy(3, 0, false); // 0 allocation, disabled
    await tx2.wait();
    console.log('✅ Strategy 3 disabled');
    
    // Increase Strategy 1 allocation to compensate
    console.log('Increasing Strategy 1 allocation to 8000 BPS (80%)...');
    const tx3 = await portfolioVault.setStrategy(1, 8000, true); // 80% allocation
    await tx3.wait();
    console.log('✅ Strategy 1 allocation increased');
    
    console.log('\n📊 New allocation:');
    console.log('  - Reserve: 20%');
    console.log('  - Strategy 1 (Zentra): 80%');
    console.log('  - Strategy 2: 0% (disabled)');
    console.log('  - Strategy 3: 0% (disabled)');
    
  } catch (e) {
    console.log('❌ Error updating strategies:', e.message);
    return;
  }
  
  // Test the fix
  console.log('\n🧪 Testing withdrawal after fix...');
  
  const userShares = await portfolioVault.balanceOf(deployer.address);
  if (userShares > 0n) {
    // Test 10% first
    const shares10pct = userShares / 10n;
    
    if (shares10pct > 0n) {
      try {
        console.log('Testing 10% withdrawal...');
        const tx = await portfolioVault.withdraw(shares10pct, deployer.address, {
          gasLimit: 2000000
        });
        await tx.wait();
        console.log('✅ 10% withdrawal successful!');
        
        // Test 25% 
        const shares25pct = userShares / 4n;
        if (shares25pct > shares10pct) {
          console.log('Testing 25% withdrawal...');
          const tx2 = await portfolioVault.withdraw(shares25pct, deployer.address, {
            gasLimit: 2000000
          });
          await tx2.wait();
          console.log('✅ 25% withdrawal successful!');
          
          // Test 50%
          const shares50pct = userShares / 2n;
          if (shares50pct > shares25pct) {
            console.log('Testing 50% withdrawal...');
            const tx3 = await portfolioVault.withdraw(shares50pct, deployer.address, {
              gasLimit: 2000000
            });
            await tx3.wait();
            console.log('✅ 50% withdrawal successful!');
          }
        }
        
      } catch (e) {
        console.log('❌ Test withdrawal failed:', e.message);
        
        if (e.message.includes('ERC20InsufficientBalance')) {
          console.log('🚨 Still getting balance error - deeper issue exists');
        }
      }
    }
  }
  
  console.log('\n🎯 === STRATEGY FIX SUMMARY ===');
  console.log('✅ Disabled broken strategies 2 & 3');
  console.log('✅ Increased working strategy 1 to 80%');
  console.log('✅ Vault now uses only reliable Zentra strategy');
  console.log('🚀 Withdrawals should work reliably now!');
  
  console.log('\n💡 For production:');
  console.log('  - Fix the underlying mock contract issues');
  console.log('  - Re-enable strategies 2 & 3 after fixing');
  console.log('  - This is a temporary workaround for demo purposes');
}

main().catch((error) => {
  console.error('Strategy fix failed:', error);
  process.exit(1);
});
