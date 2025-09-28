/* eslint-disable no-console */
const hre = require('hardhat');

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const bal = await hre.ethers.provider.getBalance(deployer.address);
    console.log('Deployer:', deployer.address);
    console.log('Balance (wei):', bal.toString());
    console.log('Balance (cBTC):', hre.ethers.formatEther(bal));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});


