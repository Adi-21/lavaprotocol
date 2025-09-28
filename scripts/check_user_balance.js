const { ethers } = require("hardhat");

async function main() {
    console.log("🔍 Checking user balance in Portfolio Vault...\n");
    
    // Get contract addresses
    const portfolioVaultAddress = "0xd9d51BbeFadafF71bB36a94bDdda70f678fDd6c1";
    
    // Get the signer (your wallet)
    const [signer] = await ethers.getSigners();
    const userAddress = await signer.getAddress();
    
    console.log("👤 User Address:", userAddress);
    console.log("🏦 Portfolio Vault:", portfolioVaultAddress);
    console.log("");
    
    // Get Portfolio Vault contract
    const portfolioVault = await ethers.getContractAt("LavaPortfolioVault", portfolioVaultAddress);
    
    try {
        // Check user's share balance
        const userShares = await portfolioVault.balanceOf(userAddress);
        console.log("📊 User Shares (raw):", userShares.toString());
        console.log("📊 User Shares (formatted):", ethers.formatUnits(userShares, 18));
        
        // Check vault totals
        const totalAssets = await portfolioVault.totalAssets();
        const totalSupply = await portfolioVault.totalSupply();
        
        console.log("💰 Total Assets (raw):", totalAssets.toString());
        console.log("💰 Total Assets (formatted):", ethers.formatUnits(totalAssets, 8), "cBTC");
        console.log("🔢 Total Supply (raw):", totalSupply.toString());
        console.log("🔢 Total Supply (formatted):", ethers.formatUnits(totalSupply, 18));
        
        // Calculate user's assets using ERC-4626 formula
        if (userShares > 0 && totalSupply > 0) {
            const userAssets = (userShares * totalAssets) / totalSupply;
            console.log("💎 User Assets (raw):", userAssets.toString());
            console.log("💎 User Assets (formatted):", ethers.formatUnits(userAssets, 8), "cBTC");
            
            // Calculate share price
            const sharePrice = totalSupply > 0 ? (totalAssets * ethers.parseUnits("1", 8)) / totalSupply : ethers.parseUnits("1", 8);
            console.log("💵 Share Price:", ethers.formatUnits(sharePrice, 8), "cBTC/share");
        } else {
            console.log("❌ User has no shares in the Portfolio Vault");
        }
        
        console.log("\n" + "=".repeat(50));
        
        // Also check if there are any recent deposits
        console.log("🔍 Checking recent deposit events...");
        
        const filter = portfolioVault.filters.Deposit(userAddress);
        const events = await portfolioVault.queryFilter(filter, -100); // Last 100 blocks
        
        if (events.length > 0) {
            console.log(`📝 Found ${events.length} deposit event(s):`);
            events.forEach((event, i) => {
                console.log(`  ${i + 1}. Block ${event.blockNumber}: Deposited ${ethers.formatEther(event.args.assets)} ETH, got ${ethers.formatUnits(event.args.shares, 18)} shares`);
            });
        } else {
            console.log("❌ No recent deposit events found for this address");
        }
        
    } catch (error) {
        console.error("❌ Error checking balance:", error.message);
    }
}

main().catch((error) => {
    console.error("❌ Script failed:", error);
    process.exitCode = 1;
});
