/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  // Load addresses
  const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [user] = await hre.ethers.getSigners();
  
  console.log('🧪 === FRONTEND WITHDRAWAL TEST ===');
  console.log('User address:', user.address);
  
  // Get contracts
  const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
  
  // Get user's current shares
  const userShares = await portfolioVault.balanceOf(user.address);
  console.log('User shares:', hre.ethers.formatUnits(userShares, 18));
  
  if (userShares === 0n) {
    console.log('❌ User has no shares to test withdrawal');
    return;
  }
  
  // Test the exact same call that the frontend makes
  console.log('\n🔍 === TESTING FRONTEND-STYLE WITHDRAWAL ===');
  
  try {
    // This mimics exactly what the frontend does
    console.log('Testing withdrawal with parameters:');
    console.log('  - shares:', userShares.toString());
    console.log('  - receiver:', user.address);
    
    // First, estimate gas
    console.log('\n⛽ Gas estimation...');
    const gasEstimate = await portfolioVault.withdraw.estimateGas(userShares, user.address);
    console.log('Gas estimate:', gasEstimate.toString());
    
    // Check if gas estimate is reasonable (should be < 500k for this operation)
    if (gasEstimate > 500000n) {
      console.log('⚠️  High gas estimate - this might indicate an issue');
    }
    
    // Now try the actual transaction with higher gas limit
    console.log('\n🚀 Executing withdrawal...');
    const tx = await portfolioVault.withdraw(userShares, user.address, {
      gasLimit: gasEstimate * 120n / 100n // 20% buffer
    });
    
    console.log('Transaction hash:', tx.hash);
    console.log('Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log('✅ Transaction confirmed!');
    console.log('Gas used:', receipt.gasUsed.toString());
    console.log('Block number:', receipt.blockNumber);
    
    // Check final balances
    const finalShares = await portfolioVault.balanceOf(user.address);
    console.log('Final user shares:', hre.ethers.formatUnits(finalShares, 18));
    
  } catch (error) {
    console.error('❌ === WITHDRAWAL FAILED ===');
    console.error('Error:', error.message);
    
    // Try to decode the error
    if (error.data) {
      console.error('Error data:', error.data);
    }
    if (error.reason) {
      console.error('Error reason:', error.reason);
    }
    if (error.code) {
      console.error('Error code:', error.code);
    }
    
    // Check if it's a gas issue
    if (error.message.includes('gas') || error.message.includes('Gas')) {
      console.error('🔥 This appears to be a GAS-related issue');
      console.error('Try increasing gas limit in frontend');
    }
    
    // Check if it's a balance issue
    if (error.message.includes('insufficient') || error.message.includes('balance')) {
      console.error('💰 This appears to be a BALANCE-related issue');
      console.error('Check if vault has sufficient liquidity');
    }
    
    // Check if it's a revert
    if (error.message.includes('revert') || error.message.includes('execution reverted')) {
      console.error('🔄 Transaction reverted - check contract logic');
    }
  }
  
  console.log('\n🏁 === TEST COMPLETE ===');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
