/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function retry(label, fn, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      console.log(`[retry] ${label} failed (attempt ${i + 1}/${retries})`, e.message || e);
      if (i === retries - 1) throw e;
      await sleep(delayMs);
    }
  }
}

function loadExisting(addrsPath) {
  try {
    if (fs.existsSync(addrsPath)) {
      const j = JSON.parse(fs.readFileSync(addrsPath, 'utf8'));
      return j || {};
    }
  } catch {}
  return {};
}

async function ensureDeployed(name, factoryName, deployArgs, overrides, out, addrsPath) {
  if (out[name]) {
    const code = await hre.ethers.provider.getCode(out[name]);
    if (code && code !== '0x') {
      console.log(name + ':', out[name], '(exists)');
      return await hre.ethers.getContractAt(factoryName, out[name]);
    }
  }
  const Factory = await hre.ethers.getContractFactory(factoryName);
  const instance = await retry('deploy ' + factoryName, () => Factory.deploy(...deployArgs, overrides));
  await instance.waitForDeployment();
  out[name] = instance.target;
  fs.writeFileSync(addrsPath, JSON.stringify(out, null, 2));
  console.log(name + ':', instance.target);
  return instance;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const gasPriceGwei = process.env.CITREA_GAS_PRICE ? BigInt(process.env.CITREA_GAS_PRICE) : undefined;
  const maxFee = process.env.CITREA_MAX_FEE_GWEI ? hre.ethers.parseUnits(process.env.CITREA_MAX_FEE_GWEI, 'gwei') : undefined;
  const maxPrio = process.env.CITREA_PRIORITY_GWEI ? hre.ethers.parseUnits(process.env.CITREA_PRIORITY_GWEI, 'gwei') : undefined;
  const overrides = maxFee && maxPrio ? { maxFeePerGas: maxFee, maxPriorityFeePerGas: maxPrio } : (gasPriceGwei ? { gasPrice: hre.ethers.parseUnits(process.env.CITREA_GAS_PRICE, 'gwei') } : {});

  const outPath = path.join(__dirname, 'crosschain-addresses.json');
  const out = loadExisting(outPath);
  out.network = hre.network.name;
  out.deployer = deployer.address;

  const wc = await ensureDeployed('MockWcBTC', 'MockWcBTC', [], overrides, out, outPath);
  const usdc = await ensureDeployed('MockUSDC', 'MockUSDC', [], overrides, out, outPath);
  const pool = await ensureDeployed('MockZentraPoolV2', 'MockZentraPoolV2', [wc.target, usdc.target], overrides, out, outPath);
  const ys = await ensureDeployed('MockInstitutionalYieldSource', 'MockInstitutionalYieldSource', [deployer.address], overrides, out, outPath);
  const bridge = await ensureDeployed('MockBridge', 'MockBridge', [deployer.address], overrides, out, outPath);

  // Wire only if needed
  const currentYS = await bridge.yieldSource();
  if (currentYS.toLowerCase() !== ys.target.toLowerCase()) {
    const tx1 = await retry('bridge.setYieldSource', () => bridge.setYieldSource(ys.target));
    await tx1.wait();
  }
  const ownerYS = await ys.owner();
  if (ownerYS.toLowerCase() !== bridge.target.toLowerCase()) {
    const tx2 = await retry('ys.transferOwnership', () => ys.transferOwnership(bridge.target));
    await tx2.wait();
  }

  // Seed minimal pool liquidity once (skip if already funded sufficiently)
  const poolUsdcBal = await usdc.balanceOf(pool.target);
  if (poolUsdcBal < hre.ethers.parseUnits('1000', 6)) {
    const seedTx = await retry('usdc.mint(pool)', () => usdc.mint(pool.target, hre.ethers.parseUnits('1000', 6)));
    await seedTx.wait();
  }

  const vault = await ensureDeployed('LavaCrossChainVault', 'LavaCrossChainVault', [wc.target, usdc.target, pool.target, bridge.target, ys.target], overrides, out, outPath);

  const bridgeOwner = await bridge.owner();
  if (bridgeOwner.toLowerCase() !== vault.target.toLowerCase()) {
    const tx3 = await retry('bridge.transferOwnership', () => bridge.transferOwnership(vault.target));
    await tx3.wait();
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Saved addresses to', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


