# Lava Protocol Frontend

A comprehensive Next.js frontend for the Lava Protocol Bitcoin yield vaults, built with TypeScript, Tailwind CSS, and Viem.

## Features

- 🔗 **Wallet Connection**: Support for MetaMask, WalletConnect, and injected wallets
- 🏦 **Dual Vault System**: Optimized (low-risk) and Maximized (high-risk) vaults
- 📊 **Real-time Data**: Live vault metrics, share prices, and user positions
- 🐛 **Debug Console**: Comprehensive logging and debugging for all operations
- 📱 **Responsive Design**: Mobile-first design with Tailwind CSS
- ⚡ **Type Safety**: Full TypeScript implementation
- 🔄 **Real-time Updates**: Automatic data refetching and state management

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Blockchain**: Viem + Wagmi
- **State Management**: TanStack Query
- **Wallet Connection**: RainbowKit
- **UI Components**: Custom components with Lucide React icons
- **Notifications**: React Hot Toast

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Deployed Lava Protocol contracts
- WalletConnect Project ID

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd lava-protocol-frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env.local
   ```
   
   Update `.env.local` with your configuration:
   - Get a WalletConnect Project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/)
   - Update contract addresses with your deployed contracts
   - Configure network settings for Citrea Testnet

4. **Update contract addresses**
   
   Edit `lib/contracts.ts` and update the contract addresses with your deployed contracts:
   ```typescript
   export const CONTRACT_ADDRESSES = {
     LAVA_OPTIMIZED_VAULT: '0x...' as Address, // Your deployed address
     LAVA_MAXIMIZED_VAULT: '0x...' as Address, // Your deployed address
     // ... other addresses
   }
   ```

5. **Update contract ABIs**
   
   Copy your compiled contract ABIs to the `abis/` folder and update the imports in `components/VaultCard.tsx`.

6. **Run the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

7. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Main dashboard page
│   ├── providers.tsx      # Wagmi and Query providers
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── VaultCard.tsx      # Main vault interaction component
│   ├── WalletConnectButton.tsx
│   ├── NetworkStatus.tsx
│   └── DebugConsole.tsx   # Comprehensive debug logging
├── lib/                   # Utility libraries
│   ├── contracts.ts       # Contract addresses and config
│   ├── types.ts           # TypeScript type definitions
│   ├── viem-config.ts     # Wagmi/Viem configuration
│   ├── debug-console.ts   # Debug logging system
│   └── contract-utils.ts  # Contract interaction utilities
├── abis/                  # Contract ABIs (add your compiled ABIs here)
└── contracts/             # Smart contracts (your Solidity files)
```

## New Contracts (Cross-Chain Demo)

- `contracts/LavaCrossChainVault.sol`
- `contracts/MockBridge.sol`
- `contracts/MockInstitutionalYieldSource.sol`
- `contracts/MockZentraPoolV2.sol`
- `contracts/MockWcBTC.sol`
- `contracts/MockUSDC.sol`

See `DEPLOYMENT.md` for wiring and demo steps.

## Key Features

### 🏦 Vault Management

- **Optimized Vault (ocBTC)**: Low-risk strategies with Zentra lending and Satsuma LP
- **Maximized Vault (mcBTC)**: High-risk leveraged strategies
- Real-time share price calculation
- Proportional deposit and withdrawal
- Strategy allocation management

### 🐛 Debug Console

The debug console provides comprehensive logging for:
- All wallet connections and disconnections
- Transaction submissions and confirmations
- Contract interactions and state changes
- Error handling and debugging information
- Real-time system information

### 🔗 Wallet Integration

- Support for multiple wallet providers
- Automatic network detection and switching
- Real-time balance updates
- Transaction status tracking

### 📊 Real-time Data

- Live vault metrics (TVL, share price, total supply)
- User position tracking
- Strategy performance monitoring
- Network status and gas price information

## Configuration

### Network Configuration

Update `lib/contracts.ts` to configure your network:

```typescript
export const NETWORK_CONFIG = {
  chainId: 1234, // Your network chain ID
  name: 'Citrea Testnet',
  rpcUrl: 'https://rpc.citrea.xyz',
  blockExplorer: 'https://explorer.citrea.xyz',
}
```

### Contract Addresses

Update contract addresses in `lib/contracts.ts`:

```typescript
export const CONTRACT_ADDRESSES = {
  LAVA_OPTIMIZED_VAULT: '0x...' as Address,
  LAVA_MAXIMIZED_VAULT: '0x...' as Address,
  // ... other contracts
}
```

## Development

### Adding New Features

1. **New Vault Types**: Extend the `VaultInfo` interface in `lib/types.ts`
2. **New Strategies**: Add strategy interfaces and update vault components
3. **New Networks**: Update `lib/viem-config.ts` with new chain configurations

### Debugging

The debug console provides comprehensive logging. All contract interactions are automatically logged with:
- Transaction type and parameters
- Success/failure status
- Error messages and stack traces
- Gas usage and block information

### Testing

1. **Local Testing**: Use the debug console to monitor all operations
2. **Contract Testing**: Deploy contracts to testnet and update addresses
3. **Wallet Testing**: Test with multiple wallet providers

## Deployment

### Vercel Deployment

1. **Connect to Vercel**
   ```bash
   npm i -g vercel
   vercel
   ```

2. **Set environment variables** in Vercel dashboard

3. **Deploy**
   ```bash
   vercel --prod
   ```

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- AWS Amplify
- Railway
- DigitalOcean App Platform

## Troubleshooting

### Common Issues

1. **Wallet Connection Issues**
   - Check WalletConnect Project ID
   - Verify network configuration
   - Check browser console for errors

2. **Contract Interaction Issues**
   - Verify contract addresses are correct
   - Check ABI imports
   - Ensure contracts are deployed and verified

3. **Network Issues**
   - Verify RPC URL is accessible
   - Check chain ID configuration
   - Ensure network is added to wallet

### Debug Console

Use the debug console to troubleshoot issues:
- All errors are logged with detailed information
- Transaction status is tracked in real-time
- System information helps identify configuration issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly using the debug console
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions:
- Check the debug console for error details
- Review contract deployment and configuration
- Ensure all environment variables are set correctly
