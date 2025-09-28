/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
    // Load addresses
    const addrsPath = path.join(__dirname, 'strategy6-addresses.json');
    const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
    const [user] = await hre.ethers.getSigners();

    console.log('🔍 === WITHDRAWAL DIAGNOSIS SCRIPT ===');
    console.log('User address:', user.address);
    console.log('Network:', hre.network.name);

    // Get contracts
    const portfolioVault = await hre.ethers.getContractAt('LavaPortfolioVault', addrs.LavaPortfolioVault);
    const wcBTC = await hre.ethers.getContractAt('MockWcBTC', addrs.MockWcBTC);
    const zentraPool = await hre.ethers.getContractAt('MockZentraPoolV2', addrs.MockZentraPoolV2);
    const satsumaVault = await hre.ethers.getContractAt('MockSatsumaLPVault', addrs.SATSUMA_LP_VAULT);

    console.log('\n📊 === PORTFOLIO VAULT ANALYSIS ===');

    // Basic vault info
    const symbol = await portfolioVault.symbol();
    const totalAssets = await portfolioVault.totalAssets();
    const totalSupply = await portfolioVault.totalSupply();
    const reserveBps = await portfolioVault.reserveBps();

    console.log('Vault symbol:', symbol);
    console.log('Total assets:', hre.ethers.formatUnits(totalAssets, 8), 'WcBTC');
    console.log('Total supply:', hre.ethers.formatUnits(totalSupply, 18), 'shares');
    console.log('Reserve BPS:', reserveBps.toString(), '(' + (Number(reserveBps) / 100) + '%)');

    // User position
    const userShares = await portfolioVault.balanceOf(user.address);
    const userAssets = totalSupply > 0 ? (userShares * totalAssets) / totalSupply : 0n;

    console.log('\n👤 === USER POSITION ===');
    console.log('User shares:', hre.ethers.formatUnits(userShares, 18));
    console.log('User assets (calculated):', hre.ethers.formatUnits(userAssets, 8), 'WcBTC');

    // Vault balances
    const vaultWcBtcBalance = await wcBTC.balanceOf(portfolioVault.target);
    const reserveAmount = (totalAssets * reserveBps) / 10000n;

    console.log('\n🏦 === VAULT BALANCES ===');
    console.log('Vault WcBTC balance:', hre.ethers.formatUnits(vaultWcBtcBalance, 8), 'WcBTC');
    console.log('Expected reserve:', hre.ethers.formatUnits(reserveAmount, 8), 'WcBTC');
    console.log('Available from reserve:', hre.ethers.formatUnits(vaultWcBtcBalance, 8), 'WcBTC');

    // Strategy analysis
    console.log('\n🎯 === STRATEGY ANALYSIS ===');
    const strategiesData = await portfolioVault.getStrategies();
    const [strategyIds, strategyInfos] = strategiesData;

    console.log('Number of strategies:', strategyIds.length);

    let totalStrategyAssets = 0n;
    for (let i = 0; i < strategyIds.length; i++) {
        const strategyId = strategyIds[i];
        const info = strategyInfos[i];

        console.log(`\nStrategy ${strategyId}:`);
        console.log('  - Adapter:', info.adapter);
        console.log('  - Allocation BPS:', info.allocationBps.toString(), '(' + (Number(info.allocationBps) / 100) + '%)');
        console.log('  - Enabled:', info.enabled);

        if (info.enabled) {
            try {
                const adapter = await hre.ethers.getContractAt('ZentraAdapter', info.adapter);
                const adapterAssets = await adapter.totalAssets();
                totalStrategyAssets += adapterAssets;

                console.log('  - Assets in strategy:', hre.ethers.formatUnits(adapterAssets, 8), 'WcBTC');

                // Check if this is Zentra strategy
                try {
                    const underlying = await adapter.underlying();
                    if (underlying.toLowerCase() === wcBTC.target.toLowerCase()) {
                        console.log('  - This is a Zentra strategy');

                        // Check Zentra pool balance for the adapter
                        const zentraBalance = await wcBTC.balanceOf(zentraPool.target);
                        console.log('  - Zentra pool WcBTC balance:', hre.ethers.formatUnits(zentraBalance, 8), 'WcBTC');
                    }
                } catch (e) {
                    console.log('  - Could not determine strategy type');
                }
            } catch (e) {
                console.log('  - Error reading adapter assets:', e.message);
            }
        }
    }

    console.log('\nTotal assets in strategies:', hre.ethers.formatUnits(totalStrategyAssets, 8), 'WcBTC');

    // Withdrawal simulation
    console.log('\n🧮 === WITHDRAWAL SIMULATION ===');
    if (userShares > 0n) {
        console.log('Simulating withdrawal of', hre.ethers.formatUnits(userShares, 18), 'shares...');

        const needFromReserve = userAssets <= vaultWcBtcBalance ? userAssets : vaultWcBtcBalance;
        const needFromStrategies = userAssets > vaultWcBtcBalance ? userAssets - vaultWcBtcBalance : 0n;

        console.log('Need from reserve:', hre.ethers.formatUnits(needFromReserve, 8), 'WcBTC');
        console.log('Need from strategies:', hre.ethers.formatUnits(needFromStrategies, 8), 'WcBTC');
        console.log('Total strategy assets available:', hre.ethers.formatUnits(totalStrategyAssets, 8), 'WcBTC');

        if (needFromStrategies > totalStrategyAssets) {
            console.log('❌ PROBLEM: Need more from strategies than available!');
            console.log('Shortfall:', hre.ethers.formatUnits(needFromStrategies - totalStrategyAssets, 8), 'WcBTC');
        } else {
            console.log('✅ Sufficient assets available for withdrawal');
        }

        // Check individual strategy liquidity
        if (needFromStrategies > 0n && totalStrategyAssets > 0n) {
            console.log('\n🔍 === STRATEGY LIQUIDITY CHECK ===');
            for (let i = 0; i < strategyIds.length; i++) {
                const info = strategyInfos[i];
                if (!info.enabled) continue;

                try {
                    const adapter = await hre.ethers.getContractAt('ZentraAdapter', info.adapter);
                    const adapterAssets = await adapter.totalAssets();
                    const proportionalNeed = (needFromStrategies * adapterAssets) / totalStrategyAssets;

                    console.log(`Strategy ${strategyIds[i]} proportional need:`, hre.ethers.formatUnits(proportionalNeed, 8), 'WcBTC');

                    // For Zentra strategy, check if pool has enough
                    const underlying = await adapter.underlying();
                    if (underlying.toLowerCase() === wcBTC.target.toLowerCase()) {
                        const poolBalance = await wcBTC.balanceOf(zentraPool.target);
                        console.log('  - Zentra pool balance:', hre.ethers.formatUnits(poolBalance, 8), 'WcBTC');
                        console.log('  - Can fulfill?', poolBalance >= proportionalNeed ? '✅ Yes' : '❌ No');

                        if (poolBalance < proportionalNeed) {
                            console.log('  - Shortfall in Zentra pool:', hre.ethers.formatUnits(proportionalNeed - poolBalance, 8), 'WcBTC');
                        }
                    }
                } catch (e) {
                    console.log(`Strategy ${strategyIds[i]} check failed:`, e.message);
                }
            }
        }
    } else {
        console.log('User has no shares to withdraw');
    }

    // Final diagnosis
    console.log('\n🏥 === DIAGNOSIS ===');
    if (userShares === 0n) {
        console.log('❌ User has no shares to withdraw');
    } else if (totalAssets === 0n) {
        console.log('❌ Vault has no assets (totalAssets = 0)');
    } else if (vaultWcBtcBalance + totalStrategyAssets < userAssets) {
        console.log('❌ Insufficient total liquidity in vault + strategies');
        console.log('Available:', hre.ethers.formatUnits(vaultWcBtcBalance + totalStrategyAssets, 8), 'WcBTC');
        console.log('Needed:', hre.ethers.formatUnits(userAssets, 8), 'WcBTC');
    } else {
        console.log('✅ Vault should have sufficient liquidity');
        console.log('Possible issues:');
        console.log('  - Strategy adapter implementation bug');
        console.log('  - Mock contract state inconsistency');
        console.log('  - Rounding errors in calculations');
        console.log('  - Gas estimation failure');
    }

    console.log('\n🔍 === END DIAGNOSIS ===');
}

main().catch((error) => {
    console.error('Diagnosis failed:', error);
    process.exit(1);
});
