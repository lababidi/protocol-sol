# Solana Options Marketplace Frontend

Minimal Next.js frontend for demonstrating the Solana Options Protocol and Marketplace.

## Features

- **Wallet Integration**: Phantom & Solflare wallet support
- **Options Protocol**: Create option series with custom parameters
- **Marketplace**: Create markets, place orders, and fill orders (atomic swaps)
- **Real-time Updates**: Auto-refreshing market and order data

## Quick Start

### 1. Prerequisites

- Node.js 18+ installed
- Phantom or Solflare wallet extension
- Local Solana test validator running with deployed programs

### 2. Start Local Validator & Deploy Programs

```bash
# From the project root
source "$HOME/.cargo/env" && \
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH" && \
anchor test
```

This will:
- Start a local Solana validator
- Deploy both programs (options + marketplace)
- Run the test suite

### 3. Run Frontend

```bash
# From the app directory
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Fund Your Wallet

Get your wallet address and airdrop some SOL:

```bash
solana airdrop 10 <YOUR_WALLET_ADDRESS> --url localhost
```

## Demo Flow

### Step 1: Connect Wallet
Click "Select Wallet" and connect Phantom or Solflare.

### Step 2: Create Tokens (Optional)
For testing, you can create test SPL tokens:

```bash
# Create base mint
spl-token create-token --decimals 6

# Create quote mint
spl-token create-token --decimals 6

# Create token accounts
spl-token create-account <BASE_MINT>
spl-token create-account <QUOTE_MINT>

# Mint some tokens
spl-token mint <BASE_MINT> 1000
spl-token mint <QUOTE_MINT> 10000
```

### Step 3: Create Option Series (Optional)
Navigate to the **Options** tab:
- Enter base and quote mint addresses
- Set strike price (e.g., 40000)
- Set expiration (e.g., 24 hours)
- Click "Create Option Series"

### Step 4: Create Market
Navigate to the **Marketplace** tab:
- Enter base mint address
- Enter quote mint address
- Click "Create Market"
- Note the market address from the result

### Step 5: Place Order
Select the market you just created:
- Enter price (in lamports, e.g., 10000000 = 10 quote per base)
- Enter size (in lamports, e.g., 100000000 = 100 tokens)
- Enter deposit mint (base for sell, quote for buy)
- Enter your token account address
- Check/uncheck "Buy Order"
- Click "Place Order"

### Step 6: Fill Order
In the "Fill Order Setup" section:
- Enter your taker base account address
- Enter your taker quote account address
- Enter maker receive account address
- Click "Fill Order" on any order
- Enter fill size when prompted

## Configuration

### RPC Endpoint
Edit `.env.local` to change the RPC endpoint:
```
NEXT_PUBLIC_RPC_ENDPOINT=http://127.0.0.1:8899  # localnet
# NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com  # devnet
```

### Program IDs
Edit `src/lib/anchorConfig.ts` if program IDs change:
```typescript
export const MARKETPLACE_PROGRAM_ID = new PublicKey('MRKTaa1111111111111111111111111111111111111');
export const OPTIONS_PROGRAM_ID = new PublicKey('7a3MatFT2m6iHtZ3vYBoLRP4A1YBuophqGqoCz4p4JoP');
```

## Architecture

```
app/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with providers
│   │   ├── page.tsx            # Home page
│   │   ├── providers.tsx       # Wallet + Query providers
│   │   ├── options/page.tsx    # Options creation UI
│   │   └── marketplace/page.tsx # Marketplace UI
│   ├── hooks/
│   │   ├── useAnchor.ts        # Anchor program instances
│   │   ├── useOptions.ts       # Options mutations
│   │   └── useMarketplace.ts   # Marketplace queries/mutations
│   └── lib/
│       ├── anchorConfig.ts     # Program IDs & RPC config
│       └── idls/               # Program IDL files
└── package.json
```

## Key Components

### Providers
- **WalletProvider**: Manages wallet connection state
- **QueryClientProvider**: React Query for data fetching/caching

### Hooks
- `useMarketplaceProgram()`: Get Anchor program instance
- `useMarkets()`: Fetch all markets
- `useOrders(marketId)`: Fetch orders for a market
- `useCreateMarket()`: Create new market mutation
- `usePlaceOrder()`: Place order mutation
- `useFillOrder()`: Fill order mutation

## Troubleshooting

### "Wallet not connected"
- Make sure you've clicked "Select Wallet" and approved the connection
- Check that your wallet extension is unlocked

### "Insufficient funds"
- Run `solana airdrop 10 <YOUR_ADDRESS> --url localhost`

### "Transaction simulation failed"
- Check that token accounts exist
- Verify you have enough tokens in the deposit account
- Ensure mint addresses match the market

### "Program not deployed"
- Run `anchor test` to deploy programs
- Check RPC endpoint in `.env.local` matches where programs are deployed

## Production Notes

This is a **minimal hackathon demo**. For production:
- Add input validation and error handling
- Implement proper token account creation
- Add slippage protection
- Add order cancellation
- Implement pagination for large datasets
- Add comprehensive testing
- Security audit

## Links

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Wallet Adapter](https://github.com/solana-labs/wallet-adapter)
- [Next.js Documentation](https://nextjs.org/docs)
