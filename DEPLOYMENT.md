# Lava Protocol Frontend - Deployment Guide

This guide covers deploying the Lava Protocol frontend to various platforms.

## Prerequisites

1. **Deployed Smart Contracts**: Ensure your Lava Protocol contracts are deployed and verified
2. **Contract ABIs**: Compile your contracts and have the ABIs ready
3. **Environment Variables**: Prepare all required environment variables
4. **WalletConnect Project ID**: Get a project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/)

## Pre-Deployment Checklist

### 1. Contract Configuration

Update `lib/contracts.ts` with your deployed contract addresses:

```typescript
export const CONTRACT_ADDRESSES = {
  LAVA_OPTIMIZED_VAULT: '0x...' as Address, // Your deployed address
  LAVA_MAXIMIZED_VAULT: '0x...' as Address, // Your deployed address
  ZENTRA_STRATEGY: '0x...' as Address,
  SATSUMA_STRATEGY: '0x...' as Address,
  WC_BTC: '0x...' as Address,
  USDC: '0x...' as Address,
  ZENTRA_POOL: '0x...' as Address,
  SATSUMA_ROUTER: '0x...' as Address,
  BTC_USD_ORACLE: '0x...' as Address,
}
```

### 2. Network Configuration

Update network settings in `lib/contracts.ts`:

```typescript
export const NETWORK_CONFIG = {
  chainId: 1234, // Your network chain ID
  name: 'Citrea Testnet',
  rpcUrl: 'https://rpc.citrea.xyz',
  blockExplorer: 'https://explorer.citrea.xyz',
}
```

### 3. Contract ABIs

Add your compiled contract ABIs to the `abis/` folder and update imports in `components/VaultCard.tsx`.

### 4. Environment Variables

Create `.env.local` with all required variables:

```bash
# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Network
NEXT_PUBLIC_CHAIN_ID=1234
NEXT_PUBLIC_RPC_URL=https://rpc.citrea.xyz
NEXT_PUBLIC_BLOCK_EXPLORER=https://explorer.citrea.xyz

# Contracts (optional - can be set in code)
NEXT_PUBLIC_LAVA_OPTIMIZED_VAULT=0x...
NEXT_PUBLIC_LAVA_MAXIMIZED_VAULT=0x...
# ... other contracts
```

## Deployment Options

### Option 1: Vercel (Recommended)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```

4. **Set Environment Variables**
   - Go to your project dashboard on Vercel
   - Navigate to Settings > Environment Variables
   - Add all variables from your `.env.local`

5. **Redeploy**
   ```bash
   vercel --prod
   ```

### Option 2: Netlify

1. **Build the project**
   ```bash
   npm run build
   ```

2. **Deploy to Netlify**
   - Connect your GitHub repository to Netlify
   - Set build command: `npm run build`
   - Set publish directory: `.next`
   - Add environment variables in Netlify dashboard

3. **Configure redirects**
   Create `public/_redirects`:
   ```
   /*    /index.html   200
   ```

### Option 3: AWS Amplify

1. **Connect Repository**
   - Connect your GitHub repository to AWS Amplify
   - Select the main branch

2. **Configure Build Settings**
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - npm install
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: .next
       files:
         - '**/*'
     cache:
       paths:
         - node_modules/**/*
   ```

3. **Set Environment Variables**
   - Add all required environment variables in Amplify console

### Option 4: Railway

1. **Connect Repository**
   - Connect your GitHub repository to Railway

2. **Configure Environment**
   - Add all environment variables
   - Railway will automatically detect Next.js

3. **Deploy**
   - Railway will automatically build and deploy

## Post-Deployment

### 1. Verify Deployment

- Check that the site loads correctly
- Test wallet connection
- Verify contract interactions work
- Check debug console for any errors

### 2. Update DNS (if using custom domain)

- Point your domain to the deployment URL
- Configure SSL certificate (usually automatic)

### 3. Monitor Performance

- Use the debug console to monitor transactions
- Check for any console errors
- Monitor gas usage and transaction success rates

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**
   - Ensure variables are prefixed with `NEXT_PUBLIC_`
   - Check that variables are set in deployment platform
   - Redeploy after adding variables

2. **Contract Interaction Failures**
   - Verify contract addresses are correct
   - Check that contracts are deployed and verified
   - Ensure ABIs are properly imported

3. **Wallet Connection Issues**
   - Verify WalletConnect Project ID is correct
   - Check network configuration
   - Ensure RPC URL is accessible

4. **Build Failures**
   - Check for TypeScript errors
   - Verify all dependencies are installed
   - Check for missing environment variables

### Debug Console

The debug console is your best friend for troubleshooting:
- All errors are logged with detailed information
- Transaction status is tracked in real-time
- System information helps identify configuration issues

## Security Considerations

1. **Environment Variables**
   - Never commit `.env.local` to version control
   - Use deployment platform's environment variable system
   - Rotate sensitive keys regularly

2. **Contract Verification**
   - Verify all contracts on block explorer
   - Use audited contract libraries
   - Test thoroughly on testnet first

3. **Access Control**
   - Implement proper access controls
   - Use HTTPS in production
   - Consider rate limiting for API calls

## Monitoring and Analytics

1. **Error Tracking**
   - The debug console provides comprehensive error logging
   - Consider integrating with error tracking services

2. **Performance Monitoring**
   - Monitor transaction success rates
   - Track gas usage patterns
   - Monitor user interaction patterns

3. **User Analytics**
   - Track vault usage patterns
   - Monitor deposit/withdrawal volumes
   - Analyze user behavior

## Maintenance

1. **Regular Updates**
   - Keep dependencies updated
   - Monitor for security vulnerabilities
   - Update contract addresses if redeployed

2. **Backup Strategy**
   - Keep backups of environment variables
   - Document all configuration changes
   - Maintain deployment logs

3. **Testing**
   - Test all functionality after updates
   - Use the debug console to verify operations
   - Test with multiple wallet providers

## Support

For deployment issues:
1. Check the debug console for error details
2. Verify all configuration is correct
3. Test locally before deploying
4. Check deployment platform logs
5. Review this guide for common issues

---

## Strategy 6 (Cross-Chain) – Mock Contracts Deployment

Follow this sequence to deploy and wire the mock cross-chain flow for demos/tests:

1. Deploy `MockWcBTC` (wrapped cBTC mock)
2. Deploy `MockUSDC`
3. Deploy `MockZentraPoolV2` with `(MockWcBTC, MockUSDC)`
4. Deploy `MockInstitutionalYieldSource` with constructor owner = your EOA (temporary)
5. Deploy `MockBridge` with constructor owner = your EOA (temporary)
6. Call `MockBridge.setYieldSource(address(MockInstitutionalYieldSource))`
7. Seed liquidity: `MockUSDC.mint(MockZentraPoolV2, 1_000_000e6)`
8. Deploy `LavaCrossChainVault` with `(
   MockWcBTC,
   MockUSDC,
   MockZentraPoolV2,
   MockBridge,
   MockInstitutionalYieldSource
)`
9. Transfer ownerships to the vault:
   - `MockBridge.transferOwnership(vault)`
   - `MockInstitutionalYieldSource.transferOwnership(vault)`
10. Demo flow:
   - Deposit: call `vault.deposit(receiver)` sending native cBTC
   - Simulate yield: mint USDC directly to `MockInstitutionalYieldSource` using `MockUSDC.mint(MockInstitutionalYieldSource, X)` (this simulates off-chain profit)
   - Harvest: `vault.harvestCrossChainYield()` to import profit and increase NAV
   - Withdraw: `vault.withdraw(shares, receiver)`

Notes:
- Fixed BTC price is 119,670; no oracle needed.
- Borrow ratio set conservatively to 20% of initial deposit for fast, safe testing.
