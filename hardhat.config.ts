import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
// Load .env.local first (if present), then fallback to .env
dotenv.config({ path: ".env.local" });
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: "contracts",
    tests: "test",
    cache: ".hh-cache",
    artifacts: "artifacts",
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    citrea: {
      url: process.env.CITREA_RPC_URL || "http://localhost:8545",
      accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
      chainId: process.env.CITREA_CHAIN_ID ? Number(process.env.CITREA_CHAIN_ID) : 1337,
    },
  },
};

export default config;


