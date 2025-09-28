/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const addrsPath = fs.existsSync(path.join(__dirname, 'crosschain-addresses.json'))
    ? path.join(__dirname, 'crosschain-addresses.json')
    : path.join(__dirname, 'strategy6-addresses.json')
  const addrs = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const [user] = await hre.ethers.getSigners();
  console.log('User:', user.address);

  const wc = await hre.ethers.getContractAt('MockWcBTC', addrs.MockWcBTC);
  const usdc = await hre.ethers.getContractAt('MockUSDC', addrs.MockUSDC);
  const ys = await hre.ethers.getContractAt('MockInstitutionalYieldSource', addrs.MockInstitutionalYieldSource);
  const vault = await hre.ethers.getContractAt('LavaCrossChainVault', addrs.LavaCrossChainVault);

  const code = await hre.ethers.provider.getCode(vault.target);
  console.log('Vault code size:', (code.length - 2) / 2);

  // Sanity checks
  const sym = await vault.symbol();
  const own = await vault.owner();
  console.log('Vault symbol:', sym, 'owner:', own);

  
  // Deposit tiny amount: 0.0002 cBTC
  const depositVal = hre.ethers.parseUnits('0.0002', 8);
  const tx1 = await vault.deposit(user.address, { value: depositVal });
  await tx1.wait();
  const totalSupply = await vault.totalSupply();
  const bal = await vault.balanceOf(user.address);
  console.log('Supply:', totalSupply.toString(), 'User shares:', bal.toString());
  const nav1 = await vault.totalAssets();
  console.log('NAV after deposit (WcBTC 8d):', nav1.toString());

  // Simulate profit: mint 250 USDC to yield source directly
  const ptx = await usdc.mint(ys.target, hre.ethers.parseUnits('250', 6));
  await ptx.wait();

  // Harvest as current signer (should be deployer/owner on live networks)
  const tx2 = await vault.harvestCrossChainYield();
  await tx2.wait();
  const nav2 = await vault.totalAssets();
  console.log('NAV after harvest (WcBTC 8d):', nav2.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


