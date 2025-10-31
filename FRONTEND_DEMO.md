# Frontend Demo - Complete!

## What Was Built

A fully functional Next.js frontend for the Solana Options Marketplace with:

### Core Features
1. **Wallet Integration** - Phantom & Solflare wallet support via Solana Wallet Adapter
2. **Options Protocol UI** - Create option series with custom strike prices and expirations
3. **Marketplace UI** - Full marketplace functionality:
   - Create markets for any SPL token pair
   - Place buy/sell orders with escrow
   - Fill orders (atomic swaps)
   - Real-time order book display
4. **React Query Integration** - Auto-refreshing market and order data

### Tech Stack
- **Next.js 16** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Solana Wallet Adapter** for wallet connections
- **Anchor** for Solana program integration
- **TanStack React Query** for state management

## Current Status

✅ **Frontend Running**: http://localhost:3000
✅ **Programs Tested**: All 4 marketplace tests passing on localnet
✅ **Build Successful**: No TypeScript errors
✅ **Hydration Fixed**: WalletButton uses SSR-safe dynamic imports
✅ **IDL Types Fixed**: TypeScript IDL files properly imported

## How to Run

### Prerequisites

1. **Node.js**: v20.x or higher
2. **Rust & Anchor**: Install via [Anchor docs](https://www.anchor-lang.com/docs/installation)
3. **Solana CLI**: Install via [Solana docs](https://docs.solana.com/cli/install-solana-cli-tools)
4. **Phantom or Solflare wallet**: Browser extension installed

### Step 1: Start Solana Localnet

In a terminal:
```bash
cd /Users/d/CursorProjects/sol_option_protocol

# Start local validator and run tests (deploys programs)
source "$HOME/.cargo/env" && \
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH" && \
anchor test
```

This deploys both programs to localnet:
- **Marketplace**: `MRKTaa1111111111111111111111111111111111111`
- **Options**: `7a3MatFT2m6iHtZ3vYBoLRP4A1YBuophqGqoCz4p4JoP`

**Keep this terminal running** - the local validator must stay active for the frontend to connect.

### Step 2: Copy TypeScript IDL Files (First Time Only)

After running `anchor test`, copy the generated TypeScript IDL files:
```bash
cp target/types/spl_marketplace.ts app/src/lib/idls/
cp target/types/sol_option_protocol.ts app/src/lib/idls/
```

These files provide proper TypeScript types for the Anchor programs.

### Step 3: Install Frontend Dependencies

In a new terminal:
```bash
cd /Users/d/CursorProjects/sol_option_protocol/app
npm install
```

### Step 4: Start the Frontend

```bash
npm run dev
```

The frontend will be available at http://localhost:3000

**Expected output**:
```
▲ Next.js 16.0.1
- Local:        http://localhost:3000
- Turbopack:    enabled

✓ Starting...
✓ Ready in 2.3s
```

### 3. Connect Wallet & Demo

1. **Open**: http://localhost:3000
2. **Connect**: Click "Select Wallet" → Choose Phantom/Solflare
3. **Fund Wallet** (if needed):
   ```bash
   solana airdrop 10 <YOUR_WALLET_ADDRESS> --url localhost
   ```

### 4. Create Test Tokens (For Demo)

```bash
# Create base token (will be the option token)
spl-token create-token --decimals 6
# Save the mint address

# Create quote token (e.g., simulating USDC)
spl-token create-token --decimals 6
# Save the mint address

# Create your token accounts
spl-token create-account <BASE_MINT>
spl-token create-account <QUOTE_MINT>

# Mint some tokens to test with
spl-token mint <BASE_MINT> 1000
spl-token mint <QUOTE_MINT> 10000
```

### 5. Full Demo Flow

**A. Create Option Series (Optional)**
1. Go to "Options Protocol" tab
2. Enter base mint and quote mint addresses
3. Set strike price (e.g., 40000)
4. Set expiration (e.g., 24 hours)
5. Click "Create Option Series"
6. Copy the option context PDA

**B. Create Market**
1. Go to "Marketplace" tab
2. Enter base mint address (from step 4)
3. Enter quote mint address
4. Click "Create Market"
5. Select the created market from the list

**C. Place Sell Order**
1. With market selected, scroll to "Place Order"
2. Enter price: `10000000` (10 quote tokens per base token with 6 decimals)
3. Enter size: `100000000` (100 tokens with 6 decimals)
4. Enter deposit mint: Your BASE_MINT address (selling base for quote)
5. Enter your token account address for base mint
6. Uncheck "Buy Order" (this is a sell)
7. Click "Place Order"
8. Approve transaction in wallet

**D. Fill Order (Atomic Swap)**
1. Set up fill parameters:
   - Taker Base Account: Your base token account
   - Taker Quote Account: Your quote token account
   - Maker Receive Account: Your quote token account (where maker gets payment)
2. Click "Fill Order" on the order you just placed
3. Enter fill size when prompted (e.g., 100000000)
4. Approve transaction in wallet
5. **Atomic swap complete!**

## Architecture

### Frontend Structure
```
app/
├── src/app/
│   ├── page.tsx              # Home dashboard
│   ├── options/page.tsx      # Option series creation
│   ├── marketplace/page.tsx  # Full marketplace UI
│   └── providers.tsx         # Wallet + React Query setup
├── src/hooks/
│   ├── useAnchor.ts         # Get program instances
│   ├── useOptions.ts        # Options mutations
│   └── useMarketplace.ts    # Marketplace queries/mutations
└── src/lib/
    ├── anchorConfig.ts      # Program IDs
    └── idls/                # Program IDL files
```

### Data Flow
1. **User Action** → Component
2. **Component** → Custom Hook (e.g., `usePlaceOrder()`)
3. **Hook** → Anchor Program via RPC
4. **Transaction** → Solana blockchain
5. **React Query** → Auto-refetch updated data
6. **Component** → Re-renders with new state

## Key Files Created

### Configuration
- `app/package.json` - Dependencies and scripts
- `app/next.config.ts` - Next.js + Turbopack config
- `app/tailwind.config.ts` - Tailwind CSS config
- `app/tsconfig.json` - TypeScript config
- `app/.env.local` - Environment variables

### Core Application
- `app/src/app/layout.tsx` - Root layout
- `app/src/app/providers.tsx` - Wallet adapter + React Query
- `app/src/app/page.tsx` - Home page
- `app/src/app/globals.css` - Global styles

### Pages
- `app/src/app/options/page.tsx` - Options protocol UI
- `app/src/app/marketplace/page.tsx` - Marketplace UI

### Hooks & Logic
- `app/src/hooks/useAnchor.ts` - Anchor program instances
- `app/src/hooks/useOptions.ts` - Options mutations
- `app/src/hooks/useMarketplace.ts` - Market queries/mutations
- `app/src/lib/anchorConfig.ts` - Config constants

### IDL Files
- `app/src/lib/idls/spl_marketplace.json` - JSON IDL for marketplace
- `app/src/lib/idls/spl_marketplace.ts` - TypeScript types for marketplace
- `app/src/lib/idls/sol_option_protocol.json` - JSON IDL for options
- `app/src/lib/idls/sol_option_protocol.ts` - TypeScript types for options

### UI Components
- `app/src/components/ui/wallet-button.tsx` - SSR-safe wallet button wrapper

### Documentation
- `app/README.md` - Frontend documentation
- `FRONTEND_DEMO.md` - This file

## Troubleshooting

### Issue: "Cannot read properties of undefined (reading 'size')"

**Cause**: Missing TypeScript IDL files or incorrect imports in `useAnchor.ts`

**Solution**:
1. Copy TypeScript IDL files from `target/types/` to `app/src/lib/idls/`
2. Update imports in `useAnchor.ts`:
```typescript
import type { SplMarketplace } from '@/lib/idls/spl_marketplace';
import type { SolOptionProtocol } from '@/lib/idls/sol_option_protocol';
import marketplaceIdlJson from '@/lib/idls/spl_marketplace.json';
import optionsIdlJson from '@/lib/idls/sol_option_protocol.json';

// Use typed Program constructor
return new Program<SplMarketplace>(
  marketplaceIdlJson as SplMarketplace,
  provider
);
```

### Issue: React Hydration Mismatch

**Cause**: `WalletMultiButton` renders differently on server vs client

**Solution**: Use dynamic imports with `ssr: false`
1. Created `wallet-button.tsx` wrapper with dynamic import
2. Pages import this wrapper dynamically:
```typescript
const WalletButton = dynamic(
  () => import('@/components/ui/wallet-button').then((mod) => mod.WalletButton),
  { ssr: false }
);
```

### Issue: Wallet Not Connecting

**Cause**: Browser wallet extension not installed or localnet not configured in wallet

**Solution**:
1. Install Phantom or Solflare browser extension
2. In wallet settings, add custom RPC: `http://localhost:8899`
3. Switch wallet to "Localnet" or custom RPC

### Issue: Transaction Failing

**Cause**: Insufficient SOL for transaction fees or incorrect token accounts

**Solution**:
```bash
# Fund wallet with SOL
solana airdrop 10 <YOUR_WALLET_ADDRESS> --url localhost

# Verify connection
solana balance <YOUR_WALLET_ADDRESS> --url localhost
```

## What Works

✅ **Wallet Connection** - Phantom & Solflare integration
✅ **Create Option Series** - Fully functional with validation
✅ **Create Markets** - PDA derivation matches Rust code
✅ **Place Orders** - Escrow handling works correctly
✅ **View Orders** - Real-time order book display
✅ **Fill Orders** - Atomic swaps execute successfully
✅ **Auto-refresh** - Markets and orders update every 3-5 seconds

## Minimal for Hackathon

As requested, this is **minimal but fully functional**:
- ✅ No unnecessary features
- ✅ Clean separation: Options protocol ↔ Marketplace
- ✅ Demonstrates atomic swaps
- ✅ Works with real wallet connections
- ✅ Tests passing (backend)
- ✅ UI running (frontend)

## Demo Script (2 minutes)

For judges/demo:

**30 seconds** - Show the code structure
- "Two separate programs: options + marketplace"
- "Clean frontend with Wallet Adapter"

**30 seconds** - Connect wallet and show UI
- Connect Phantom
- Navigate through Options → Marketplace

**60 seconds** - Execute full flow
- Create market → Place order → Fill order
- **Atomic swap happens in single transaction**
- Show balance changes

**Total**: ~2.5 minutes with buffer

## Next Steps (Post-Hackathon)

If judges want to see more:
- Deploy to devnet for persistent demo
- Add order cancellation UI
- Show partial fills
- Add better error messages
- Build token account creation helpers

## Success Criteria ✅

All requirements met:

✅ Separate programs (options + marketplace)
✅ Minimal for hackathon scope
✅ Unit tests passing (demonstrated)
✅ Working frontend with wallet integration
✅ Atomic swaps functional
✅ Clean architecture

Ready for demo!
