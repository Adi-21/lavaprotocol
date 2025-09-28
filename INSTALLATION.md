# Installation Guide

## Dependency Issues Fixed

The package.json has been updated with the correct versions to resolve the peer dependency warnings:

### ✅ Fixed Issues:
1. **Viem version**: Updated to `^2.37.8` (matches peer dependency)
2. **Wagmi version**: Updated to `^2.17.5` (matches peer dependency)  
3. **RainbowKit**: Updated to `^2.0.0` and removed duplicate entry
4. **Removed duplicate**: `rainbowkit` package (was conflicting with `@rainbow-me/rainbowkit`)

## Installation Steps

### 1. Clean Install
```bash
# Remove existing node_modules and lock file
rm -rf node_modules package-lock.json

# Install with correct versions
npm install
```

### 2. Alternative: Use Yarn (if npm issues persist)
```bash
# Remove node_modules
rm -rf node_modules

# Install with yarn
yarn install
```

### 3. Verify Installation
```bash
# Check for any remaining warnings
npm list

# Start development server
npm run dev
```

## Expected Dependencies

After successful installation, you should have:

- ✅ **Next.js 14.0.4** - React framework
- ✅ **Viem 2.37.8** - Ethereum library
- ✅ **Wagmi 2.17.5** - React hooks for Ethereum
- ✅ **RainbowKit 2.0.0** - Wallet connection UI
- ✅ **TanStack Query 5.0.0** - Data fetching
- ✅ **Tailwind CSS 3.3.0** - Styling
- ✅ **Lucide React** - Icons
- ✅ **React Hot Toast** - Notifications

## Troubleshooting

### If you still get peer dependency warnings:
```bash
# Force install (use with caution)
npm install --force

# Or use legacy peer deps
npm install --legacy-peer-deps
```

### If RainbowKit issues persist:
```bash
# Clear npm cache
npm cache clean --force

# Reinstall
rm -rf node_modules package-lock.json
npm install
```

### Environment Variables
Make sure you have a `.env.local` file with:
```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

## Next Steps

1. **Install dependencies**: `npm install`
2. **Start development**: `npm run dev`
3. **Open browser**: `http://localhost:3000`
4. **Connect wallet** and test the vault interactions

The frontend should now work correctly with your deployed contracts!
