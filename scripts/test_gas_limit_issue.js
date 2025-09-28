/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [user] = await hre.ethers.getSigners();
  
  console.log('⛽ === GAS LIMIT INVESTIGATION ===');
  
  const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
  const userShares = await portfolioVault.balanceOf(user.address);
  
  console.log('User shares:', hre.ethers.formatUnits(userShares, 18));
  
  if (userShares === 0n) {
    console.log('No shares to test');
    return;
  }
  
  // Test different withdrawal sizes with different gas limits
  const testSizes = [
    { fraction: 1000n, name: '0.1%' },
    { fraction: 100n, name: '1%' },
    { fraction: 10n, name: '10%' },
    { fraction: 2n, name: '50%' },
    { fraction: 1n, name: '100%' }
  ];
  
  for (const test of testSizes) {
    const testShares = userShares / test.fraction;
    if (testShares === 0n) continue;
    
    console.log(`\n🧪 Testing ${test.name} withdrawal (${hre.ethers.formatUnits(testShares, 18)} shares):`);
    
    try {
      // First try gas estimation
      console.log('  Estimating gas...');
      const gasEstimate = await portfolioVault.withdraw.estimateGas(testShares, user.address);
      console.log('  Gas estimate:', gasEstimate.toString());
      
      if (gasEstimate > 1000000n) {
        console.log('  ⚠️  Very high gas estimate - this might fail');
      }
      
      // Try with different gas limits
      const gasLimits = [
        gasEstimate * 110n / 100n, // 10% buffer
        gasEstimate * 150n / 100n, // 50% buffer  
        1000000n, // 1M gas
        2000000n  // 2M gas
      ];
      
      let success = false;
      for (const gasLimit of gasLimits) {
        try {
          console.log(`  Trying with gas limit: ${gasLimit.toString()}`);
          const tx = await portfolioVault.withdraw(testShares, user.address, {
            gasLimit: gasLimit
          });
          
          const receipt = await tx.wait();
          console.log(`  ✅ SUCCESS! Gas used: ${receipt.gasUsed.toString()}`);
          success = true;
          break;
        } catch (e) {
          console.log(`  ❌ Failed with gas limit ${gasLimit.toString()}: ${e.message.substring(0, 100)}...`);
        }
      }
      
      if (!success) {
        console.log('  ❌ All gas limits failed for this withdrawal size');
        
        // If this is the 100% withdrawal, this is our main issue
        if (test.fraction === 1n) {
          console.log('\n🚨 === MAIN ISSUE IDENTIFIED ===');
          console.log('The 100% withdrawal fails due to gas/complexity issues');
          console.log('This is likely because:');
          console.log('1. The _routeDivest function is too complex for large amounts');
          console.log('2. Multiple strategy divest calls exceed block gas limit');
          console.log('3. Precision errors in large number calculations');
        }
      }
      
    } catch (e) {
      console.log(`  ❌ Gas estimation failed: ${e.message}`);
    }
  }
  
  console.log('\n💡 === RECOMMENDATIONS ===');
  console.log('1. **Frontend Fix**: Set higher gas limit (2M gas) for withdrawals');
  console.log('2. **User Workaround**: Withdraw in smaller chunks (10-50% at a time)');
  console.log('3. **Contract Fix**: Optimize _routeDivest for large withdrawals');
  
  console.log('\n🔧 === IMMEDIATE FRONTEND FIX ===');
  console.log('In your frontend withdrawal function, add:');
  console.log('```typescript');
  console.log('await writeContract({');
  console.log('  address: vault.address,');
  console.log('  abi: vaultAbi,');
  console.log('  functionName: "withdraw",');
  console.log('  args: [shares, address],');
  console.log('  gas: 2000000n // Add this line!');
  console.log('})');
  console.log('```');
}

main().catch((error) => {
  console.error('Gas test failed:', error);
  process.exit(1);
});
