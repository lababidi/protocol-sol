# Solana Options Protocol - Codebase Explanation

## 📖 Table of Contents

1. [Overview](#overview)
2. [Core Concept](#core-concept)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Key Components](#key-components)
6. [Instruction Flow](#instruction-flow)
7. [State Management](#state-management)
8. [Security Model](#security-model)
9. [Testing Strategy](#testing-strategy)
10. [Development Workflow](#development-workflow)

---

## Overview

### What is This Project?

The Solana Options Protocol is a **fully collateralized American options protocol** built on Solana using the Anchor framework. It enables users to create, trade, and exercise call options on SPL tokens (like meme coins such as BONK) with complete trustlessness and 1:1 collateral backing.

### Key Innovation: Dual-Token Model

Unlike traditional options protocols, this system creates **TWO tokens** for every option position:

```
Deposit 100 BONK
       ↓
    Protocol
       ↓
   ┌───┴───┐
   ↓       ↓
Option   Redemption
Token    Token
(100)    (100)
```

- **Option Token**: Right to buy underlying at strike price (exercisable before expiry)
- **Redemption Token**: Claim on pro-rata vault share (redeemable after expiry)

### Why This Matters

1. **No Counterparty Risk**: Full 1:1 collateralization eliminates default risk
2. **Flexibility**: Option writers can sell options while keeping redemption claims
3. **Fair Settlement**: Pro-rata distribution ensures fair treatment of all participants
4. **Composability**: Tokens are standard SPL tokens, tradable on any DEX

---

## Core Concept

### The Option Writer Journey

1. **Mint Options** (Pre-Expiry)
   - Deposit 100 BONK as collateral
   - Receive 100 option tokens + 100 redemption tokens
   - Sell option tokens on DEX for premium
   - Keep redemption tokens for post-expiry claim

2. **Wait for Expiry**
   - Some buyers exercise options (pay strike, receive BONK)
   - Vault now contains: remaining BONK + USDC from exercises
   
3. **Redeem** (Post-Expiry)
   - Burn redemption tokens
   - Receive pro-rata share of BOTH BONK + USDC

### The Option Buyer Journey

1. **Buy Options**
   - Purchase option tokens on DEX (pay premium to seller)
   
2. **Exercise** (If Profitable)
   - Burn option tokens
   - Pay strike price in USDC
   - Receive underlying BONK
   
3. **Profit**
   - Sell BONK on market for profit (if price > strike + premium)

### Example Scenario

```
Initial:
- Alice deposits 1000 BONK
- Receives 1000 option tokens + 1000 redemption tokens
- Sells 100 option tokens to Bob for $10 premium

During Life:
- Bob exercises 100 options @ $0.04 strike
- Bob pays $4 USDC, receives 100 BONK
- Vaults now: 900 BONK + $4 USDC

At Expiry:
- Alice redeems 1000 redemption tokens
- Alice receives: 900 BONK + $4 USDC (pro-rata share)
- Net result: Lost 100 BONK, gained $14 ($10 premium + $4 from vault)
```

---

## Architecture

### High-Level Design

```
┌────────────────────────────────────────────────────┐
│              Solana Blockchain                      │
│  ┌──────────────────────────────────────────────┐ │
│  │      Sol Options Protocol (Anchor)            │ │
│  │                                               │ │
│  │  ┌────────────────────────────────────────┐  │ │
│  │  │      OptionSeries #1                   │  │ │
│  │  │  (BONK @ $0.04, Dec 2025)             │  │ │
│  │  │                                        │  │ │
│  │  │  ┌──────────┐  ┌──────────┐          │  │ │
│  │  │  │ Option   │  │Redemption│          │  │ │
│  │  │  │  Mint    │  │  Mint    │          │  │ │
│  │  │  │  (PDA)   │  │  (PDA)   │          │  │ │
│  │  │  └──────────┘  └──────────┘          │  │ │
│  │  │                                        │  │ │
│  │  │  ┌──────────┐  ┌──────────┐          │  │ │
│  │  │  │Collateral│  │   Cash   │          │  │ │
│  │  │  │  Vault   │  │  Vault   │          │  │ │
│  │  │  │  (BONK)  │  │  (USDC)  │          │  │ │
│  │  │  │  (PDA)   │  │  (PDA)   │          │  │ │
│  │  │  └──────────┘  └──────────┘          │  │ │
│  │  └────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

### PDA (Program Derived Address) Strategy

All vaults and mints are PDAs, ensuring:
- No private keys (protocol controls everything)
- Deterministic addresses (reproducible)
- Canonical derivation (security)

**PDA Seeds:**

```rust
// Option Series (unique per market)
["option_series", underlying_mint, strike_price, expiration]

// Token Mints (unique per series)
["option_mint", option_series]
["redemption_mint", option_series]

// Vaults (unique per series)
["collateral_vault", option_series]
["cash_vault", option_series]
```

---

## Project Structure

```
sol_option_protocol/
│
├── programs/sol_option_protocol/src/
│   ├── lib.rs                    # Program entry point (5 instructions)
│   │
│   ├── state/
│   │   ├── mod.rs
│   │   └── option_series.rs      # Core account structure
│   │
│   ├── instructions/
│   │   ├── mod.rs
│   │   ├── create_series.rs      # Creates new option market
│   │   ├── mint_options.rs       # Deposits collateral, mints tokens
│   │   ├── exercise.rs           # Exercises options pre-expiry
│   │   ├── redeem.rs             # Redeems post-expiry
│   │   └── burn_paired.rs        # Burns paired tokens anytime
│   │
│   └── errors.rs                 # Custom error codes
│
├── tests/
│   ├── simple_test.ts            # Basic functionality
│   ├── phase2_testnet.ts         # Mint + burn tests
│   ├── phase3_testnet.ts         # Exercise tests
│   ├── phase4_testnet.ts         # Redemption tests
│   └── phase5_testnet.ts         # Full lifecycle tests
│
├── README.md                     # User-facing documentation
├── DESIGN.md                     # Technical specification
└── Anchor.toml                   # Anchor configuration
```

---

## Key Components

### 1. OptionSeries Account (`state/option_series.rs`)

The central data structure storing all option metadata:

```rust
#[account]
pub struct OptionSeries {
    // Core parameters
    pub underlying_mint: Pubkey,      // e.g., BONK
    pub strike_price: u64,            // e.g., 4 cents (6 decimals)
    pub strike_currency: Pubkey,      // USDC mint
    pub expiration: i64,              // Unix timestamp

    // Associated accounts (all PDAs)
    pub option_mint: Pubkey,          // Option token mint
    pub redemption_mint: Pubkey,      // Redemption token mint
    pub collateral_vault: Pubkey,     // Holds BONK
    pub cash_vault: Pubkey,           // Holds USDC

    // State tracking
    pub total_supply: u64,            // Total options minted
    pub exercised_amount: u64,        // Cumulative exercised

    // PDA bumps (performance optimization)
    pub bump: u8,
    pub option_mint_bump: u8,
    pub redemption_mint_bump: u8,
    pub collateral_vault_bump: u8,
    pub cash_vault_bump: u8,
}
```

**Why Store Bumps?**

Bump storage is an Anchor best practice that saves ~15,000 compute units (CU) per PDA. With 4 PDAs per instruction, this saves 60,000 CU — crucial for staying under Solana's 200K CU limit!

### 2. Instructions

#### `create_option_series`

**Purpose**: Initialize a new option market

**What It Does**:
1. Creates OptionSeries account (PDA)
2. Creates option mint (PDA)
3. Creates redemption mint (PDA)
4. Creates collateral vault (PDA)
5. Creates cash vault (PDA)
6. Stores all metadata and bumps

**Key Code**:
```rust
// Unique per market: underlying + strike + expiry
seeds = [
    b"option_series",
    underlying_mint.key().as_ref(),
    strike_price.to_le_bytes().as_ref(),
    expiration.to_le_bytes().as_ref()
]
```

#### `mint_options`

**Purpose**: Deposit collateral and receive paired tokens

**Flow**:
```
User → Collateral Vault: Transfer BONK
Protocol → User: Mint option tokens
Protocol → User: Mint redemption tokens
Update: total_supply += amount
```

**Key Code**:
```rust
// Transfer collateral
token_interface::transfer_checked(...)

// Mint option tokens (PDA signs)
token_interface::mint_to(
    CpiContext::new_with_signer(..., signer_seeds),
    amount
)

// Mint redemption tokens (PDA signs)
token_interface::mint_to(
    CpiContext::new_with_signer(..., signer_seeds),
    amount
)

// Update state
option_series.total_supply += amount
```

#### `exercise_option`

**Purpose**: Pay strike, receive underlying (pre-expiry only)

**Flow**:
```
User → Burn option tokens
User → Cash Vault: Pay strike price (USDC)
Collateral Vault → User: Transfer underlying (BONK)
Update: exercised_amount += amount
```

**Key Code**:
```rust
// Burn option tokens
token_interface::burn(user_option_account, amount)

// Collect strike payment
token_interface::transfer_checked(
    user_strike_account → cash_vault,
    strike_payment
)

// Deliver underlying (PDA signs)
token_interface::transfer_checked(
    CpiContext::new_with_signer(
        collateral_vault → user_underlying_account,
        ...
    ),
    amount
)

// Track exercises
option_series.exercised_amount += amount
```

**Note**: `total_supply` does NOT change — redemption tokens still exist!

#### `redeem`

**Purpose**: Claim pro-rata vault share (post-expiry only)

**Flow**:
```
Calculate pro-rata shares:
  bonk_payout = (collateral_vault × amount) / total_supply
  usdc_payout = (cash_vault × amount) / total_supply

User → Burn redemption tokens
Collateral Vault → User: Transfer BONK (pro-rata)
Cash Vault → User: Transfer USDC (pro-rata)
```

**Key Code**:
```rust
// Pro-rata calculation
let underlying_payout = collateral_balance
    .checked_mul(amount)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(total_supply)
    .ok_or(ErrorCode::MathOverflow)?;

let cash_payout = cash_balance
    .checked_mul(amount)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(total_supply)
    .ok_or(ErrorCode::MathOverflow)?;

// Burn claim
token_interface::burn(user_redemption_account, amount)

// Distribute assets (PDA signs both)
if underlying_payout > 0 {
    token_interface::transfer_checked(
        collateral_vault → user, underlying_payout
    )
}
if cash_payout > 0 {
    token_interface::transfer_checked(
        cash_vault → user, cash_payout
    )
}
```

**Note**: `total_supply` does NOT change — it's a permanent record of issuance!

#### `burn_paired_tokens`

**Purpose**: Burn both tokens for 1:1 collateral refund (anytime)

**Flow**:
```
User → Burn option tokens
User → Burn redemption tokens
Collateral Vault → User: Refund BONK (1:1)
Update: total_supply -= amount
```

**Key Code**:
```rust
// Burn both tokens
token_interface::burn(user_option_account, amount)
token_interface::burn(user_redemption_account, amount)

// Refund collateral 1:1 (PDA signs)
token_interface::transfer_checked(
    CpiContext::new_with_signer(
        collateral_vault → user,
        ...
    ),
    amount
)

// Decrease supply (ONLY operation that does this!)
option_series.total_supply -= amount
```

**Why This Matters**: Burning decreases total_supply, making remaining redemption tokens worth MORE (larger pro-rata share).

### 3. Error Handling (`errors.rs`)

```rust
#[error_code]
pub enum ErrorCode {
    ExpirationInPast,           // Can't create expired options
    InvalidStrikePrice,         // Strike must be > 0
    InvalidAmount,              // Amount must be > 0
    MathOverflow,               // Arithmetic overflow
    InvalidUnderlyingMint,      // Wrong token
    InvalidCollateralVault,     // Wrong vault
    OptionExpired,              // Can't mint/exercise after expiry
    InvalidOptionMint,          // Wrong option mint
    InvalidRedemptionMint,      // Wrong redemption mint
    InvalidStrikeCurrency,      // Wrong strike currency
    InvalidCashVault,           // Wrong cash vault
    InsufficientCollateral,     // Vault empty
    OptionNotExpired,           // Can't redeem before expiry
    NoTokensIssued,             // Division by zero protection
}
```

---

## Instruction Flow

### State Transition Diagram

```
┌─────────────┐
│   CREATED   │  create_option_series()
│  (Empty)    │  - All vaults empty
│             │  - total_supply = 0
└──────┬──────┘
       │
       │ mint_options()
       ↓
┌─────────────┐
│   ACTIVE    │  Pre-Expiry Phase
│  (Trading)  │  ✅ Mint allowed
│             │  ✅ Exercise allowed
│             │  ✅ Burn allowed
│             │  ❌ Redeem blocked
└──────┬──────┘
       │
       │ exercise_option()
       ↓
┌─────────────┐
│   MIXED     │  Pre-Expiry (Exercises)
│ (Partial)   │  - Collateral: BONK
│             │  - Cash: USDC
│             │  - Both vaults populated
└──────┬──────┘
       │
       │ Clock >= expiration
       ↓
┌─────────────┐
│   EXPIRED   │  Post-Expiry Phase
│  (Settled)  │  ❌ Mint blocked
│             │  ❌ Exercise blocked
│             │  ✅ Burn allowed
│             │  ✅ Redeem allowed
└──────┬──────┘
       │
       │ redeem() for all tokens
       ↓
┌─────────────┐
│   DRAINED   │  Final State
│  (Closed)   │  - Vaults empty
│             │  - No more activity
└─────────────┘
```

### Operation Availability Matrix

| Operation | Pre-Expiry | Post-Expiry | Expiry Check | Changes total_supply? |
|-----------|------------|-------------|--------------|----------------------|
| **Mint** | ✅ Yes | ❌ No | `Clock < expiration` | ✅ Increases |
| **Exercise** | ✅ Yes | ❌ No | `Clock < expiration` | ❌ No |
| **Burn Paired** | ✅ Yes | ✅ Yes | None (anytime!) | ✅ Decreases |
| **Redeem** | ❌ No | ✅ Yes | `Clock >= expiration` | ❌ No |

**Key Insight**: Burn is the ONLY operation that:
1. Works in both states
2. Decreases total_supply

---

## State Management

### OptionSeries Lifecycle

```rust
// Creation
total_supply: 0
exercised_amount: 0
collateral_vault: 0 BONK
cash_vault: 0 USDC

// After minting 1000 options
total_supply: 1000
exercised_amount: 0
collateral_vault: 1000 BONK
cash_vault: 0 USDC

// After exercising 400 options
total_supply: 1000          // Unchanged!
exercised_amount: 400       // Tracked
collateral_vault: 600 BONK  // 400 paid out
cash_vault: $16 USDC        // From exercises

// After burning 100 paired tokens
total_supply: 900           // DECREASED!
exercised_amount: 400
collateral_vault: 500 BONK  // 100 refunded
cash_vault: $16 USDC

// After redemption completes
total_supply: 900           // Unchanged
exercised_amount: 400
collateral_vault: 0 BONK    // All distributed
cash_vault: 0 USDC          // All distributed
```

### Vault Balance Evolution

```
Time →

                Collateral Vault              Cash Vault
Init            │ 0 BONK                      │ $0 USDC
                │
Mint 1000       │ 1000 BONK ←─────────────────┤
                │
Exercise 400    │ 600 BONK (↓400)             │ $16 USDC (↑$16)
                │
Burn 100        │ 500 BONK (↓100)             │ $16 USDC
                │
Redeem 900      │ 0 BONK (↓500)               │ $0 USDC (↓$16)
                │
Final           │ 0 BONK                      │ $0 USDC
```

---

## Security Model

### Defense in Depth

#### Layer 1: Anchor Type Safety

Automatic validation by Anchor framework:
- Account ownership (program owns it)
- Account discriminator (correct type)
- Signer validation (user authorized)

#### Layer 2: `has_one` Constraints

Validates relationships between accounts:

```rust
#[account(
    mut,
    has_one = option_mint,
    has_one = redemption_mint,
    has_one = collateral_vault,
    has_one = cash_vault,
)]
pub option_series: Account<'info, OptionSeries>,
```

Prevents attackers from passing wrong vaults/mints from other series.

#### Layer 3: Custom Constraints

Runtime validation:

```rust
// Pre-expiry check
constraint = Clock::get()?.unix_timestamp < option_series.expiration
    @ ErrorCode::OptionExpired

// Post-expiry check
constraint = Clock::get()?.unix_timestamp >= option_series.expiration
    @ ErrorCode::OptionNotExpired

// Sufficient collateral
constraint = collateral_vault.amount >= amount
    @ ErrorCode::InsufficientCollateral
```

#### Layer 4: PDA Canonical Bumps

Stored on init, reused later:

```rust
// On init: discover canonical bump
#[account(
    init,
    seeds = [b"collateral_vault", option_series.key().as_ref()],
    bump,  // Anchor finds canonical bump
)]

// Later use: enforce stored bump
#[account(
    mut,
    seeds = [b"collateral_vault", option_series.key().as_ref()],
    bump = option_series.collateral_vault_bump,  // Must match stored!
)]
```

Benefits:
- Saves 15K CU per PDA (60K total!)
- Enforces canonical PDA (prevents malicious PDAs)

#### Layer 5: Checked Arithmetic

All math uses checked operations:

```rust
let payout = vault_balance
    .checked_mul(amount)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(total_supply)
    .ok_or(ErrorCode::MathOverflow)?;
```

Prevents integer overflow/underflow attacks.

### Security Checklist

- ✅ No private keys (all vaults are PDAs)
- ✅ Full collateralization (1:1 backing)
- ✅ Integer overflow protection (checked math)
- ✅ Account validation (has_one + constraints)
- ✅ PDA uniqueness (unique seeds per series)
- ✅ Time manipulation resistant (Clock sysvar)
- ✅ Reentrancy safe (Anchor single-threaded)
- ✅ Token-2022 compatible (InterfaceAccount)

---

## Testing Strategy

### Test Suite Overview

```
tests/
├── simple_test.ts           # Basic devnet test
├── phase2_testnet.ts        # Mint + burn
├── phase3_testnet.ts        # Exercise mechanism
├── phase4_testnet.ts        # Redemption with expiry
└── phase5_testnet.ts        # Full lifecycle
```

### Phase 2: Mint & Burn

Tests:
- Create option series
- Mint options (deposit collateral)
- Verify token balances
- Verify vault balances
- Burn paired tokens
- Verify 1:1 refund
- Verify total_supply decrease

### Phase 3: Exercise

Tests:
- Mint options
- Exercise options
- Verify strike payment
- Verify underlying transfer
- Verify vault balances
- Verify exercised_amount tracking
- Token conservation checks

### Phase 4: Redemption

Tests:
- Create with short expiry (15 seconds)
- Mint options
- Wait for expiry
- Redeem tokens
- Verify pro-rata distribution
- Handle 0% exercised case
- Handle 100% exercised case

### Phase 5: Full Lifecycle

Tests:
- Pre-expiry burn
- Exercise scenarios
- Post-expiry burn
- Post-expiry redemption
- Mixed vault distribution
- Edge cases

### Test Patterns

```typescript
// 1. Create series
const tx = await program.methods
    .createOptionSeries(strikePrice, expiration)
    .accounts({...})
    .rpc();

// 2. Mint options
await program.methods
    .mintOptions(new BN(amount))
    .accounts({...})
    .rpc();

// 3. Verify balances
const vault = await getAccount(connection, vaultPda);
assert.equal(vault.amount, expectedAmount);

// 4. Exercise
await program.methods
    .exerciseOption(new BN(amount))
    .accounts({...})
    .rpc();

// 5. Redeem
await program.methods
    .redeem(new BN(amount))
    .accounts({...})
    .rpc();
```

---

## Development Workflow

### Setup

```bash
# Install dependencies
npm install

# Build program
anchor build

# Update program ID
anchor keys list
# Copy program ID to Anchor.toml and lib.rs

# Rebuild
anchor build
```

### Testing

```bash
# Run all tests
anchor test

# Run specific test
anchor test -- --grep "phase3"

# Test on devnet
anchor test --provider.cluster devnet

# Verbose logs
RUST_LOG=debug anchor test
```

### Deployment

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet (requires SOL)
anchor deploy --provider.cluster mainnet
```

### Common Commands

```bash
# Check program logs
solana logs <program-id>

# Get account info
solana account <address>

# Check balance
solana balance

# Airdrop (devnet only)
solana airdrop 2
```

---

## Key Takeaways

### For Developers

1. **Anchor Best Practices**: Store PDA bumps, use `has_one`, checked arithmetic
2. **Token-2022 Compatibility**: Use `InterfaceAccount` for future-proofing
3. **State Management**: Track total_supply separately from vault balances
4. **Security**: Multiple layers of validation prevent attacks
5. **Testing**: Phase-based testing mirrors development stages

### For Users

1. **Option Writers**: Deposit collateral, sell options, redeem mixed assets
2. **Option Buyers**: Pay premium, exercise if profitable
3. **Market Makers**: Flexible inventory with burn mechanism
4. **No Counterparty Risk**: Full collateralization guarantees payment

### For Auditors

1. **PDA Security**: All vaults use canonical bumps
2. **Math Safety**: Checked arithmetic everywhere
3. **Access Control**: Comprehensive constraint validation
4. **State Consistency**: Clear lifecycle with invariants
5. **Token Safety**: Token-2022 compatible, uses Interface types

---

## Resources

- **Code**: `programs/sol_option_protocol/src/`
- **Tests**: `tests/`
- **Docs**: `README.md`, `DESIGN.md`
- **Anchor**: https://www.anchor-lang.com/
- **Solana**: https://solana.com/docs

---

**Last Updated**: January 2025
**Version**: 1.0
