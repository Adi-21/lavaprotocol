# Lava Protocol - Complete Codebase Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Smart Contracts](#smart-contracts)
4. [Frontend Application](#frontend-application)
5. [Deployment Scripts](#deployment-scripts)
6. [Configuration](#configuration)
7. [Development Workflow](#development-workflow)
8. [Testing](#testing)
9. [Security Considerations](#security-considerations)
10. [API Reference](#api-reference)

---

## Project Overview

**Lava Protocol** is a comprehensive Bitcoin yield farming platform built on Citrea testnet that provides multiple vault strategies for Bitcoin holders to earn yield. The protocol consists of smart contracts for vault management, a Next.js frontend for user interaction, and deployment/testing infrastructure.

### Key Features
- **Multi-Strategy Vaults**: Portfolio, Cross-Chain, Optimized, and Maximized vault types
- **Bitcoin Yield Generation**: Various strategies including lending, LP provision, and leveraged positions
- **Cross-Chain Integration**: Bridge functionality for yield farming across chains
- **Real-time Dashboard**: Live vault metrics, positions, and debugging tools
- **Strategy Adapters**: Modular architecture for different yield strategies

### Technology Stack
- **Smart Contracts**: Solidity 0.8.20, OpenZeppelin libraries
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Blockchain Interaction**: Viem, Wagmi, RainbowKit
- **Development**: Hardhat, TypeChain
- **Network**: Citrea Testnet (Bitcoin L2)

---

## Architecture

### System Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │  Smart Contracts │    │  External DeFi  │
│   (Next.js)     │◄──►│   (Solidity)     │◄──►│   Protocols     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
    User Interface         Vault Logic              Yield Sources
    - Wallet Connect       - Asset Management       - Zentra Pool
    - Real-time Data       - Strategy Routing       - Satsuma DEX
    - Debug Console        - Risk Management        - Cross-chain Bridges
```

### Core Components

1. **Vault Contracts**: Main entry points for user deposits/withdrawals
2. **Strategy Adapters**: Modular components for different yield strategies
3. **Mock Contracts**: Testing infrastructure for DeFi protocols
4. **Frontend Dashboard**: User interface for vault interactions
5. **Deployment Scripts**: Automated contract deployment and configuration

---

## Smart Contracts

### Core Vault Contracts

#### 1. LavaPortfolioVault.sol
**Purpose**: Multi-strategy portfolio vault with configurable allocations

**Key Features**:
- ERC-4626 compliant vault
- Multiple strategy support via adapters
- Configurable reserve and allocation percentages
- Automatic investment routing on deposits
- Proportional divestment on withdrawals

**Core Functions**:
```solidity
function deposit(address receiver) external payable
function withdraw(uint256 shares, address receiver) external
function addStrategy(uint256 id, IStrategy adapter, uint16 bps) external onlyOwner
function setReserveBps(uint16 bps) external onlyOwner
```

**Architecture**:
```
User Deposit (cBTC) → Portfolio Vault → Strategy Routing
                                    ├── Reserve (configurable %)
                                    ├── Zentra Strategy (via adapter)
                                    └── Satsuma Strategy (via adapter)
```

#### 2. LavaCrossChainVault.sol
**Purpose**: Cross-chain yield farming with institutional yield sources

**Strategy Flow**:
1. User deposits cBTC
2. Vault supplies cBTC as collateral to Zentra
3. Borrows USDC against collateral (20% LTV)
4. Bridges USDC to external chain
5. Forwards to institutional yield source
6. Harvests profits and repays debt

**Key Functions**:
```solidity
function deposit(address receiver) external payable
function harvestCrossChainYield() external onlyOwner
function totalAssets() public view returns (uint256) // NAV calculation
```

#### 3. LavaOptimizedVault.sol (ObsidianVault.sol)
**Purpose**: Low-risk optimized strategies

**Strategies**:
- **Strategy 1**: Zentra lending (supply cBTC, earn yield)
- **Strategy 2**: Satsuma LP provision

**Features**:
- Configurable allocation between strategies
- Rebalancing functionality
- ERC-4626 compliance

#### 4. LavaMaximizedVault.sol (MagmaVault.sol)
**Purpose**: High-risk leveraged strategies

**Strategy 3 - Zentra Leverage**:
1. Supply cBTC as collateral
2. Borrow USDC against collateral
3. Swap USDC for more cBTC via Satsuma
4. Re-supply as collateral (leverage loop)
5. Repeat for specified loops

**Risk Management**:
- Health factor monitoring
- Emergency deleveraging
- Liquidation protection

### Strategy Adapters

#### ZentraAdapter.sol
- Interfaces with Zentra lending pool
- Handles supply/withdraw operations
- Tracks invested balance

#### SatsumaAdapter.sol
- Interfaces with Satsuma LP vault
- Manages LP token deposits/withdrawals
- Yield farming integration

#### CrossChainAdapter.sol
- Manages cross-chain bridge operations
- Handles yield source interactions
- Profit harvesting logic

### Mock Contracts (Testing Infrastructure)

#### MockWcBTC.sol
- Wrapped cBTC implementation
- Deposit/withdraw functionality
- Testing token for development

#### MockZentraPoolV2.sol
- Simulates Zentra lending pool
- Supply, borrow, withdraw, repay functions
- Configurable interest rates and LTV

#### MockSatsumaLPVault.sol
- Simulates Satsuma LP vault
- Deposit/withdraw with yield simulation
- LP token management

#### MockBridge.sol & MockInstitutionalYieldSource.sol
- Cross-chain bridge simulation
- Institutional yield source mock
- Profit generation for testing

---

## Frontend Application

### Architecture
```
app/
├── layout.tsx          # Root layout with providers
├── page.tsx           # Main dashboard entry
├── providers.tsx      # Wagmi/Query providers
└── globals.css        # Global styles

components/
├── CrossChainDashboard.tsx    # Main vault interface
├── VaultCard.tsx             # Individual vault component
├── WalletConnectButton.tsx   # Wallet connection
├── NetworkStatus.tsx         # Network information
└── DebugConsole.tsx         # Development debugging

lib/
├── contracts.ts       # Contract addresses & config
├── types.ts          # TypeScript definitions
├── viem-config.ts    # Blockchain configuration
├── debug-console.ts  # Debug logging system
└── contract-utils.ts # Utility functions
```

### Key Components

#### CrossChainDashboard.tsx
**Purpose**: Main user interface for all vault interactions

**Features**:
- Real-time vault data display
- Deposit/withdrawal forms
- Strategy information
- User position tracking
- Debug console integration

**Key Functionality**:
```typescript
// Vault data fetching
const { data: totalAssets } = useReadContract({
  address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
  abi: crossAbi,
  functionName: 'totalAssets',
})

// Deposit transaction
const handleDeposit = async (amount: string) => {
  writeContract({
    address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
    abi: crossAbi,
    functionName: 'deposit',
    args: [address],
    value: parseEther(amount),
  })
}
```

#### DebugConsole.tsx
**Purpose**: Comprehensive debugging and logging system

**Features**:
- Transaction monitoring
- Error logging
- System information display
- Real-time updates
- Export functionality

### State Management
- **Wagmi**: Blockchain state management
- **TanStack Query**: Data fetching and caching
- **React State**: Local component state
- **Hot Toast**: User notifications

---

## Deployment Scripts

### Core Deployment Scripts

#### deploy_strategy6.js
**Purpose**: Complete deployment of cross-chain vault system

**Deployment Sequence**:
1. Deploy mock tokens (WcBTC, USDC)
2. Deploy mock protocols (Zentra, Satsuma)
3. Deploy yield source and bridge mocks
4. Deploy vault contracts
5. Configure ownership and permissions
6. Seed initial liquidity

**Key Features**:
- Retry logic for failed deployments
- Address persistence to JSON files
- Incremental deployment support
- Configuration validation

#### demo_strategy6.js
**Purpose**: Automated testing and demonstration

**Demo Flow**:
1. Load deployed contract addresses
2. Execute small test deposit
3. Simulate external yield generation
4. Harvest profits
5. Display NAV changes

#### Other Scripts
- `deploy_portfolio_local.js`: Portfolio vault deployment
- `test_crosschain.js`: Cross-chain functionality testing
- `ensure_profit_and_harvest.js`: Automated profit generation
- `diagnose_crosschain_citrea.js`: Network diagnostics

### Address Management
Scripts maintain deployment addresses in JSON files:
- `strategy6-addresses.json`: Cross-chain vault addresses
- `portfolio-addresses.json`: Portfolio vault addresses
- `crosschain-addresses.json`: Alternative address storage

---

## Configuration

### Network Configuration

#### Hardhat Config (hardhat.config.ts)
```typescript
networks: {
  hardhat: { chainId: 31337 },
  localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
  citrea: {
    url: process.env.CITREA_RPC_URL || "http://localhost:8545",
    accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    chainId: process.env.CITREA_CHAIN_ID ? Number(process.env.CITREA_CHAIN_ID) : 1337,
  },
}
```

#### Frontend Config (lib/contracts.ts)
```typescript
export const CONTRACT_ADDRESSES = {
  LAVA_CROSS_CHAIN_VAULT: '0x8e9C493D07FF9a37d136104D53b0Cf519B6764dE',
  LAVA_PORTFOLIO_VAULT: '0xd9d51BbeFadafF71bB36a94bDdda70f678fDd6c1',
  WC_BTC: '0x3173b5fB1509D68Ca5037b0B2066833B168Cb058',
  // ... other addresses
}

export const NETWORK_CONFIG = {
  chainId: 5115, // Citrea Testnet
  name: 'Citrea Testnet',
  rpcUrl: 'https://rpc.testnet.citrea.xyz',
  blockExplorer: 'https://explorer.testnet.citrea.xyz',
}
```

### Environment Variables
```bash
# Deployment
DEPLOYER_PK=your_private_key
CITREA_RPC_URL=https://rpc.testnet.citrea.xyz
CITREA_CHAIN_ID=5115

# Frontend
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_CHAIN_ID=5115
NEXT_PUBLIC_RPC_URL=https://rpc.testnet.citrea.xyz
```

---

## Development Workflow

### Setup Process
1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   ```bash
   cp env.example .env.local
   # Edit .env.local with your configuration
   ```

3. **Compile Contracts**:
   ```bash
   npm run hh:compile
   ```

4. **Deploy Locally**:
   ```bash
   npm run bun:node    # Start local node
   npm run bun:deploy  # Deploy contracts
   npm run bun:demo    # Run demo
   ```

5. **Start Frontend**:
   ```bash
   npm run dev
   ```

### Development Commands
```bash
# Contract Development
npm run hh:compile     # Compile contracts
npm run hh:deploy      # Deploy to hardhat network
npm run hh:demo        # Run demo script

# Local Development
npm run bun:node       # Start local Hardhat node
npm run bun:deploy     # Deploy to localhost
npm run bun:demo       # Demo on localhost

# Frontend Development
npm run dev            # Start Next.js dev server
npm run build          # Build for production
npm run start          # Start production server
```

### File Structure
```
lavaprotocol/
├── contracts/              # Smart contracts
│   ├── adapters/          # Strategy adapters
│   ├── interfaces/        # Contract interfaces
│   └── *.sol             # Main vault contracts
├── scripts/               # Deployment & utility scripts
├── app/                   # Next.js application
├── components/            # React components
├── lib/                   # Utility libraries
├── abis/                  # Contract ABIs
├── artifacts/             # Compiled contracts
├── typechain-types/       # Generated TypeScript types
└── config files
```

---

## Testing

### Contract Testing
- **Unit Tests**: Individual contract functionality
- **Integration Tests**: Multi-contract interactions
- **Demo Scripts**: End-to-end workflow testing

### Frontend Testing
- **Debug Console**: Real-time transaction monitoring
- **Error Handling**: Comprehensive error logging
- **User Flow Testing**: Complete deposit/withdrawal cycles

### Mock Environment
The codebase includes comprehensive mocks for:
- **DeFi Protocols**: Zentra, Satsuma
- **Cross-chain Infrastructure**: Bridges, yield sources
- **Token Contracts**: WcBTC, USDC
- **Price Oracles**: BTC/USD feeds

---

## Security Considerations

### Smart Contract Security
- **OpenZeppelin Libraries**: Battle-tested security primitives
- **Reentrancy Protection**: ReentrancyGuard on all external functions
- **Access Control**: Ownable pattern for admin functions
- **Pausable Contracts**: Emergency stop functionality

### Risk Management
- **Health Factor Monitoring**: Liquidation protection
- **Emergency Functions**: Deleveraging capabilities
- **Slippage Protection**: Minimum output amounts
- **Proportional Withdrawals**: Fair exit mechanisms

### Frontend Security
- **Wallet Integration**: Secure wallet connection
- **Transaction Validation**: Input sanitization
- **Error Handling**: Graceful failure management
- **Debug Information**: Comprehensive logging without sensitive data

---

## API Reference

### Core Vault Functions

#### Deposit Functions
```solidity
// Standard deposit (Portfolio, Cross-chain, Optimized)
function deposit(address receiver) external payable

// Leveraged deposit (Maximized vault)
function deposit(uint256 leverageLoops, address receiver) external payable
```

#### Withdrawal Functions
```solidity
// Standard withdrawal
function withdraw(uint256 shares, address receiver) external

// ERC-4626 compliant
function redeem(uint256 shares, address receiver, address owner) external
```

#### View Functions
```solidity
// Asset valuation
function totalAssets() external view returns (uint256)
function convertToShares(uint256 assets) external view returns (uint256)
function convertToAssets(uint256 shares) external view returns (uint256)

// Strategy information
function getStrategies() external view returns (uint256[] memory, StrategyInfo[] memory)
```

### Strategy Adapter Interface
```solidity
interface IStrategy {
    function vault() external view returns (address);
    function underlying() external view returns (address);
    function totalAssets() external view returns (uint256);
    function invest(uint256 amount) external;
    function divest(uint256 amount) external returns (uint256);
}
```

### Frontend Hooks
```typescript
// Wagmi hooks for contract interaction
const { data: totalAssets } = useReadContract({
  address: CONTRACT_ADDRESSES.LAVA_CROSS_CHAIN_VAULT,
  abi: crossAbi,
  functionName: 'totalAssets',
})

const { writeContract } = useWriteContract()
```

---

## Conclusion

Lava Protocol represents a comprehensive Bitcoin yield farming platform with:

- **Modular Architecture**: Extensible vault and strategy system
- **Multiple Risk Profiles**: From conservative lending to leveraged strategies
- **Cross-chain Capabilities**: Institutional yield source integration
- **Production-ready Frontend**: Full-featured user interface
- **Comprehensive Testing**: Mock environment and debugging tools
- **Security Focus**: Battle-tested patterns and risk management

The codebase is designed for extensibility, allowing new strategies and vaults to be added through the adapter pattern while maintaining security and user experience standards.

For deployment and usage instructions, see the individual README.md, INSTALLATION.md, and DEPLOYMENT.md files in the repository.
