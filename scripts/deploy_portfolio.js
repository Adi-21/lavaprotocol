/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const addrsPath = path.join(__dirname, 'portfolio-addresses.json');
  const base = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
  const { MockWcBTC, MockZentraPoolV2, MockInstitutionalYieldSource, MockBridge, MockUSDC } = base;

  // Deploy LavaPortfolioVault
  const Vault = await hre.ethers.getContractFactory('LavaPortfolioVault');
  const portfolio = await Vault.deploy(MockWcBTC, 2000); // 20% reserve
  await portfolio.waitForDeployment();
  console.log('LavaPortfolioVault:', portfolio.target);

  // Deploy adapters
  const ZentraAdapter = await hre.ethers.getContractFactory('ZentraAdapter');
  const zAdapter = await ZentraAdapter.deploy(portfolio.target, MockWcBTC, MockZentraPoolV2);
  await zAdapter.waitForDeployment();
  console.log('ZentraAdapter:', zAdapter.target);

  // Deploy MockSatsumaLPVault and adapter
  const MockSatsumaLPVault = await hre.ethers.getContractFactory('MockSatsumaLPVault');
  const mockLp = await MockSatsumaLPVault.deploy(MockWcBTC);
  await mockLp.waitForDeployment();
  console.log('MockSatsumaLPVault:', mockLp.target);

  const SatsumaAdapter = await hre.ethers.getContractFactory('SatsumaAdapter');
  const sAdapter = await SatsumaAdapter.deploy(portfolio.target, MockWcBTC, mockLp.target);
  await sAdapter.waitForDeployment();
  console.log('SatsumaAdapter:', sAdapter.target);

  const CrossChainAdapter = await hre.ethers.getContractFactory('CrossChainAdapter');
  const cAdapter = await CrossChainAdapter.deploy(portfolio.target, MockWcBTC, MockUSDC, MockBridge, MockInstitutionalYieldSource);
  await cAdapter.waitForDeployment();
  console.log('CrossChainAdapter:', cAdapter.target);

  // Register strategies with allocations: 30 / 25 / 25 (keep 20% reserve, sum 80)
  await (await portfolio.addStrategy(1, zAdapter.target, 3000)).wait();
  await (await portfolio.addStrategy(2, sAdapter.target, 2500)).wait();
  await (await portfolio.addStrategy(3, cAdapter.target, 2500)).wait();

  const out = { ...base, LavaPortfolioVault: portfolio.target, ZentraAdapter: zAdapter.target, SatsumaAdapter: sAdapter.target, CrossChainAdapter: cAdapter.target, SATSUMA_LP_VAULT: mockLp.target };
  fs.writeFileSync(addrsPath, JSON.stringify(out, null, 2));
  console.log('Saved addresses to', addrsPath);
}

main().catch((e) => { console.error(e); process.exit(1); });


