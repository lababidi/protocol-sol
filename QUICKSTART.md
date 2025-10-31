# Quick Start Guide - Phase 1: Custody

This is the skeleton implementation showing pure custody (no token minting yet).

## Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli

# Install Node dependencies
npm install
```

## Setup for Testnet

### 1. Configure Solana CLI for Devnet

```bash
solana config set --url devnet
```

### 2. Create and Fund a Keypair

```bash
# Generate a new keypair (if you don't have one)
solana-keygen new

# Request airdrop (devnet only)
solana airdrop 2

# Check balance
solana balance
```

### 3. Build the Program

```bash
anchor build
```

### 4. Get Your Program ID

```bash
anchor keys list
# This will show: sol_option_protocol: <YOUR_PROGRAM_ID>
```

### 5. Update Program ID

Update the program ID in two places:

**File: `Anchor.toml`**
```toml
[programs.devnet]
sol_option_protocol = "<YOUR_PROGRAM_ID>"
```

**File: `programs/sol_option_protocol/src/lib.rs`**
```rust
declare_id!("<YOUR_PROGRAM_ID>");
```

### 6. Rebuild

```bash
anchor build
```

### 7. Deploy to Devnet

```bash
anchor deploy --provider.cluster devnet
```

### 8. Run Tests

```bash
# Run tests against devnet
anchor test --provider.cluster devnet --skip-local-validator
```

## What This Does

### 1. Create Option Series
Creates a vault that will hold collateral (e.g., BONK tokens).

### 2. Deposit Collateral
Users can deposit underlying tokens (e.g., BONK) into the vault. The protocol acts as custodian.

## Testing Manually with Anchor Client

```typescript
import * as anchor from "@coral-xyz/anchor";

// Connect to devnet
const connection = new anchor.web3.Connection("https://api.devnet.solana.com");
const wallet = anchor.Wallet.local();
const provider = new anchor.AnchorProvider(connection, wallet, {});
anchor.setProvider(provider);

// Load program
const programId = new anchor.web3.PublicKey("YOUR_PROGRAM_ID");
const idl = await anchor.Program.fetchIdl(programId, provider);
const program = new anchor.Program(idl, programId, provider);

// Create option series
const strikePrice = new anchor.BN(4_000_000); // $0.04
const expiration = new anchor.BN(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);

// ... derive PDAs and call instructions
```

## What's Next?

This is Phase 1 (custody only). Next phases will add:

- **Phase 2**: Option token mint + Redemption token mint (dual-token model)
- **Phase 3**: Mint options instruction (deposit → get paired tokens)
- **Phase 4**: Exercise instruction (burn option token, pay strike, get underlying)
- **Phase 5**: Redeem instruction (burn redemption token, get pro-rata share)
- **Phase 6**: Burn paired tokens (exit mechanism)

## Troubleshooting

### "Insufficient funds" error
```bash
solana airdrop 2
```

### "Program failed to deploy"
Check that you have enough SOL (deployment costs ~2-3 SOL on devnet).

### "Account already exists"
The program ID might conflict. Generate a new keypair:
```bash
anchor keys sync
anchor build
anchor deploy
```

## Useful Commands

```bash
# Check program info
solana program show <PROGRAM_ID> --url devnet

# Get program logs
solana logs <PROGRAM_ID> --url devnet

# Close program (reclaim rent)
solana program close <PROGRAM_ID> --url devnet
```

## File Structure

```
sol_option_protocol/
├── Anchor.toml              # Anchor configuration
├── Cargo.toml               # Workspace config
├── programs/
│   └── sol_option_protocol/
│       └── src/
│           ├── lib.rs       # Entry point
│           ├── state/       # OptionSeries account
│           ├── instructions/  # create_series, deposit
│           └── errors.rs    # Custom errors
└── tests/
    └── sol_option_protocol.ts  # Test suite
```

## Current Limitations

- ❌ No token minting (Phase 2)
- ❌ No exercise/redeem (Phase 4/5)
- ❌ Just custody demonstration

This skeleton proves the custody mechanism works before adding complexity!
