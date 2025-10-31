# Solana Options Protocol

> **A fully collateralized American options protocol for SPL tokens on Solana**

[![Anchor Version](https://img.shields.io/badge/Anchor-0.30.1-blueviolet)](https://www.anchor-lang.com/)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-green)](https://solana.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A trustless, fully collateralized options protocol enabling American call options for meme coins and SPL tokens. Unlike existing protocols, this eliminates counterparty risk through 1:1 collateralization and a novel dual-token model.

---

## 🎯 Key Features

- ✅ **Fully Collateralized** - 1:1 backing eliminates counterparty risk
- ✅ **American Options** - Exercise anytime before expiry (maximum flexibility)
- ✅ **Dual-Token Model** - Separates optionality from collateral claims
- ✅ **Trustless Custody** - PDA-based vaults (no private keys)
- ✅ **Composable Tokens** - SPL-standard, DEX-tradable option tokens
- ✅ **Pro-Rata Redemption** - Fair post-expiry mixed-asset distribution
- ✅ **Anchor Framework** - Built with Solana's premier development framework
- ✅ **Token-2022 Compatible** - Future-proof with Token Extensions support

---

## 📚 Table of Contents

- [Quick Start](#-quick-start)
- [Core Innovation](#-core-innovation)
- [Architecture Overview](#️-architecture-overview)
- [Repository Structure](#-repository-structure)
- [User Flows](#-user-flows)
  - [Option Writer](#1️⃣-option-writer-flow)
  - [Option Buyer](#2️⃣-option-buyer-flow)
  - [Market Maker](#3️⃣-market-maker-flow)
- [Complete Example](#-complete-user-journey-example)
- [Token Flow](#-token-flow-diagram)
- [Account Architecture](#️-account-architecture--pda-relationships)
- [State Machine](#-state-transitions)
- [Security](#-security-architecture)
- [Development](#-development-setup)
- [Documentation](#-documentation)

---

## 🚀 Quick Start

// TODO: set an expiration date and a price and an amount; create marketplace

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli
```

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/sol_option_protocol.git
cd sol_option_protocol

# Install dependencies
npm install

# Build the program
anchor build

# Run tests
anchor test
```

### Basic Usage

```typescript
import * as anchor from "@coral-xyz/anchor";

// Mint options by depositing collateral
await program.methods
    .mintOptions(new anchor.BN(1000))
    .accounts({
        user: wallet.publicKey,
        optionSeries: optionSeriesPda,
        // ... other accounts
    })
    .rpc();

// Exercise options (pay strike, receive underlying)
await program.methods
    .exerciseOption(new anchor.BN(100))
    .accounts({
        user: wallet.publicKey,
        optionSeries: optionSeriesPda,
        // ... other accounts
    })
    .rpc();
```

For complete documentation, see [DESIGN.md](./DESIGN.md).

---

## 💡 Core Innovation

### Dual-Token Model

Every option mint creates **TWO tokens**:

```
┌─────────────────────────────────────────────────┐
│  Deposit 100 BONK as collateral                 │
└─────────────────────────────────────────────────┘
                    │
                    │ mint_options(100)
                    ↓
        ┌───────────┴───────────┐
        │                       │
        ↓                       ↓
┌──────────────┐        ┌──────────────┐
│ OPTION TOKEN │        │ REDEMPTION   │
│   100        │        │ TOKEN 100    │
│              │        │              │
│ • Tradable   │        │ • Tradable   │
│ • Exercisable│        │ • Redeemable │
│ • Burns on   │        │ • Claims     │
│   exercise   │        │   vault      │
└──────────────┘        └──────────────┘
```

**Why both?**
- **Option Token**: Right to buy underlying at strike (burns on exercise)
- **Redemption Token**: Claim on pro-rata vault share (burns on redeem)

This separation allows:
- Writers to sell option tokens while keeping redemption tokens
- Buyers to speculate without claiming collateral
- Fair distribution of exercise proceeds to all token holders

---

## 🏗️ Architecture Overview

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOLANA OPTIONS PROTOCOL                       │
│                   (Anchor Program on Solana)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Creates & Manages
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      OPTION SERIES                               │
│  (BONK Call @ $0.04, expires Dec 31, 2025)                      │
│  ─────────────────────────────────────────────────────────────  │
│  Metadata: strike, expiry, underlying, strike currency          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Controls
                              ↓
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ↓                     ↓                     ↓
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  TOKEN      │      │   VAULTS    │      │  TOKEN      │
│  MINTS      │      │  (PDAs)     │      │  MINTS      │
├─────────────┤      ├─────────────┤      ├─────────────┤
│ Option      │      │ Collateral  │      │ Redemption  │
│ Token       │      │ Vault       │      │ Token       │
│ (tradable)  │      │ (BONK)      │      │ (tradable)  │
│             │      │             │      │             │
│             │      │ Cash Vault  │      │             │
│             │      │ (USDC)      │      │             │
└─────────────┘      └─────────────┘      └─────────────┘
```

### Core Data Structure
// TODO: IS creating PDAs free or do we have to pay rent?
// TODO: maybe PDA needs to be created per underlying / stable pair. in ETH we want each option to be a token but solana solves this via SPL, are we doing it correctly?
```rust
#[account]
pub struct OptionSeries {
    // Core parameters
    pub underlying_mint: Pubkey,     // e.g., BONK
    pub strike_price: u64,            // e.g., 4 cents (4_000_000 in 6 decimals)
    pub strike_currency: Pubkey,      // USDC mint 
    pub expiration: i64,              // Unix timestamp
    // TODO: should there be is_put? BOOL

    // Associated accounts (all PDAs)
    pub option_mint: Pubkey,          // American option token
    pub redemption_mint: Pubkey,      // Redemption token
    pub collateral_vault: Pubkey,     // Holds underlying (BONK) // TODO: shouldn't this be the same as the underyling mint? why would it be different? is it? why do you need the collateral mint?
    pub cash_vault: Pubkey,           // Holds USDC from exercises // TODO: shouldn't this be the same?

    // State tracking
    pub total_supply: u64,            // Total option tokens minted
    pub exercised_amount: u64,        // Cumulative exercised

    // PDA bumps (Anchor best practice: store bumps to save 60K CU!)
    pub bump: u8,
    pub option_mint_bump: u8,
    pub redemption_mint_bump: u8,
    pub collateral_vault_bump: u8,
    pub cash_vault_bump: u8,
}
```

---

## 📁 Repository Structure

```
sol_option_protocol/
│
├── README.md                        # This file
├── DESIGN.md                        # Comprehensive technical specification
├── Anchor.toml                      # Anchor configuration
├── Cargo.toml                       # Rust workspace config
│
├── programs/
│   └── sol_option_protocol/
│       ├── Cargo.toml               # Program-specific dependencies
│       └── src/
│           ├── lib.rs               # Program entrypoint
│           │   ├── declare_id!()
│           │   ├── #[program] module
│           │   └── Re-exports all instructions
│           │
│           ├── instructions/        # All instruction handlers
│           │   ├── mod.rs
│           │   ├── initialize.rs        # One-time protocol setup
│           │   ├── create_option_series.rs  # Create new option market
│           │   ├── mint_options.rs      # Deposit collateral, get tokens
│           │   ├── exercise.rs          # Exercise option pre-expiry
│           │   ├── redeem.rs            # Redeem post-expiry
│           │   └── burn_paired.rs       # Burn tokens anytime for 1:1 refund
│           │
│           ├── state/               # Account structures
│           │   ├── mod.rs
│           │   ├── protocol_state.rs    # Global protocol state
│           │   └── option_series.rs     # Per-series metadata
│           │
│           ├── errors.rs            # Custom error codes
│           └── utils.rs             # Helper functions
│
├── tests/
│   ├── integration/                 # TypeScript integration tests
│   │   ├── test_mint.ts
│   │   ├── test_exercise.ts
│   │   ├── test_redeem.ts
│   │   └── test_edge_cases.ts
│   └── fixtures/                    # Test data
│
└── app/                             # Frontend (future)
    └── sdk/                         # TypeScript SDK
```

### Key Files

| File | Purpose |
|------|---------|
| `lib.rs` | Program entry point with `#[program]` module |
| `state/option_series.rs` | Core OptionSeries struct with all metadata |
| `instructions/mint_options.rs` | Deposit collateral, mint paired tokens |
| `instructions/exercise.rs` | Exercise option pre-expiry (burn option token, pay strike, get underlying) |
| `instructions/redeem.rs` | Redeem post-expiry (burn redemption token, get pro-rata vault share) |
| `instructions/burn_paired.rs` | Burn both tokens anytime for 1:1 refund |

---

## 👥 User Flows

### 1️⃣ Option Writer Flow

**Goal**: Earn premium by providing collateral for options

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: MINT OPTIONS (Deposit Collateral)                  │
└─────────────────────────────────────────────────────────────┘

User starts with: 1000 BONK

User calls: mint_options(1000)

Protocol actions:
  1. Transfer 1000 BONK to collateral_vault (custody)
  2. Mint 1000 option tokens → user
  3. Mint 1000 redemption tokens → user
  4. total_supply += 1000

User now has:
  ✅ 0 BONK (deposited)
  ✅ 1000 option tokens (can sell for premium)
  ✅ 1000 redemption tokens (claim on vault)
```

**TypeScript Example:**

```typescript
import * as anchor from "@coral-xyz/anchor";

async function mintOptions(amount: number) {
    const tx = await program.methods
        .mintOptions(new anchor.BN(amount))
        .accounts({
            user: wallet.publicKey,
            optionSeries: optionSeriesPda,
            underlyingMint: bonkMint,
            optionMint: optionMintPda,
            redemptionMint: redemptionMintPda,
            collateralVault: collateralVaultPda,
            userUnderlyingAccount: userBonkAccount,
            userOptionAccount: userOptionAccount,
            userRedemptionAccount: userRedemptionAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

    console.log("Minted", amount, "options. Tx:", tx);
}
```

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: SELL OPTION TOKENS (Earn Premium)                  │
└─────────────────────────────────────────────────────────────┘

User lists 1000 option tokens on Raydium DEX for $100

Buyer purchases option tokens for $100

User now has:
  ✅ $100 premium (earned immediately!)
  ✅ 0 option tokens (sold)
  ✅ 1000 redemption tokens (still holds)
  ⏳ Waits for expiry to redeem
```

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: REDEEM (Post-Expiry)                               │
└─────────────────────────────────────────────────────────────┘

Scenario: 400 options were exercised by buyers

Vaults now contain:
  - Collateral: 600 BONK (400 exercised out)
  - Cash: $16 USDC (from 400 exercises @ $0.04)

User calls: redeem(1000)

Protocol calculates pro-rata share:
  - BONK payout: 600 × (1000/1000) = 600 BONK
  - USDC payout: $16 × (1000/1000) = $16 USDC

User receives:
  ✅ 600 BONK
  ✅ $16 USDC

Net P&L:
  - Deposited: 1000 BONK
  - Received: 600 BONK + $16 + $100 premium
  - Result: Lost 400 BONK, gained $116
```

### 2️⃣ Option Buyer Flow

**Goal**: Buy right to purchase BONK at fixed price

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: BUY OPTION TOKENS (Pay Premium)                    │
└─────────────────────────────────────────────────────────────┘

User buys 100 option tokens on DEX for $10 premium

User now has:
  ✅ 100 option tokens
  ✅ 0 redemption tokens (seller keeps those)
```

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: EXERCISE OPTION (If In-The-Money)                  │
└─────────────────────────────────────────────────────────────┘

Market scenario: BONK pumps to $0.10 (strike is $0.04)

User calls: exercise_option(100)

Protocol calculates:
  - Strike payment: 100 × $0.04 = $4 USDC required

Protocol actions:
  1. Burn 100 option tokens
  2. Transfer $4 USDC from user → cash_vault
  3. Transfer 100 BONK from collateral_vault → user

User now has:
  ✅ 100 BONK (market value: $10)
  ✅ Spent: $10 premium + $4 strike = $14
  ✅ Received: $10 worth of BONK
  ✅ Loss in this case, but would profit if BONK > $0.14
```

**TypeScript Example:**

```typescript
async function exerciseOption(amount: number) {
    // Calculate required strike payment
    const strikePayment = (amount * strikePrice) / 10**decimals;

    console.log(`Exercising ${amount} options`);
    console.log(`Strike payment required: $${strikePayment} USDC`);

    const tx = await program.methods
        .exerciseOption(new anchor.BN(amount))
        .accounts({
            user: wallet.publicKey,
            optionSeries: optionSeriesPda,
            underlyingMint: bonkMint,
            strikeCurrency: usdcMint,
            optionMint: optionMintPda,
            collateralVault: collateralVaultPda,
            cashVault: cashVaultPda,
            userOptionAccount: userOptionAccount,
            userStrikeAccount: userUsdcAccount,
            userUnderlyingAccount: userBonkAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

    console.log("Exercise successful! Tx:", tx);
}
```

### 3️⃣ Market Maker Flow

**Goal**: Provide two-sided liquidity, earn bid-ask spread

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: MINT LARGE POSITION                                │
└─────────────────────────────────────────────────────────────┘

MM deposits: 10,000 BONK

Receives:
  ✅ 10,000 option tokens
  ✅ 10,000 redemption tokens

┌─────────────────────────────────────────────────────────────┐
│  STEP 2: PROVIDE LIQUIDITY                                  │
└─────────────────────────────────────────────────────────────┘

MM creates Raydium pool:
  - Bid: Buy option tokens @ $0.09
  - Ask: Sell option tokens @ $0.11
  - Spread: $0.02 per token

Keeps redemption tokens as hedge

┌─────────────────────────────────────────────────────────────┐
│  STEP 3: REBALANCE INVENTORY                                │
└─────────────────────────────────────────────────────────────┘

If inventory gets too long (too many paired tokens):
  → burn_paired_tokens() for 1:1 BONK refund

If inventory gets too short (sold too many options):
  → mint_options() to create more tokens
```

---

## 🎬 Complete User Journey Example

Let me walk through a **real-world scenario** step by step:

### Scenario Setup
- **BONK current price**: $0.03
- **Option strike**: $0.04
- **Option expiry**: 30 days
- **Premium**: $0.10 per option token

### 🎭 Cast of Characters

1. **Alice** (Option Writer) - Has 1000 BONK, wants to earn premium
2. **Bob** (Option Buyer) - Bullish on BONK, wants leverage

---

### Day 1: Option Creation & Minting

**Alice mints options:**
```typescript
await program.methods.mintOptions(new BN(1000)).rpc();
```

**Result:**
```
Alice's Wallet:
  - BONK: 0 (deposited as collateral)
  - Option tokens: 1000
  - Redemption tokens: 1000

Alice lists 1000 option tokens on Raydium for $100
```

---

### Day 5: Bob Buys Options

**Bob buys from DEX:**
```
Bob's purchase: 100 option tokens for $10

Bob's Wallet:
  - USDC: $190 (spent $10 on premium)
  - Option tokens: 100
  - Redemption tokens: 0 (Alice keeps these)

Alice's Wallet:
  - BONK: 0
  - USDC: $10 (earned premium)
  - Option tokens: 900 (sold 100)
  - Redemption tokens: 1000 (keeps all)
```

---

### Day 15: BONK Pumps to $0.12

**Market Update:**
- BONK price: $0.12 (was $0.03)
- Strike price: $0.04
- Intrinsic value: $0.12 - $0.04 = $0.08 per option
- Bob's 100 options intrinsic value: $8

**Bob exercises:**
```typescript
await program.methods.exerciseOption(new BN(100)).rpc();
```

**Protocol actions:**
1. Burns Bob's 100 option tokens
2. Transfers $4 USDC from Bob → cash vault
3. Transfers 100 BONK from collateral vault → Bob

**Bob's Final Result:**
```
Bob's Wallet:
  - BONK: 100 (market value: $12)
  - USDC: $186 ($190 - $4 strike)

Bob's P&L:
  Spent: $10 premium + $4 strike = $14
  Received: 100 BONK worth $12
  Net: -$2 loss (would profit if BONK > $0.14)
```

**Vault State After Exercise:**
```
Collateral vault: 900 BONK (was 1000, paid out 100)
Cash vault: $4 USDC (received from Bob)
```

---

### Day 30: Expiry - Alice Redeems

**Alice redeems:**
```typescript
await program.methods.redeem(new BN(1000)).rpc();
```

**Protocol calculation:**
```
Total supply: 1000 redemption tokens outstanding
Alice has: 1000 tokens (100% ownership)

BONK payout: 900 × (1000/1000) = 900 BONK
USDC payout: $4 × (1000/1000) = $4 USDC
```

**Alice's Final Result:**
```
Alice's Wallet:
  - BONK: 900 (redeemed from vault)
  - USDC: $14 ($10 premium + $4 from vault)

Alice's P&L:
  Started with: 1000 BONK
  Ended with: 900 BONK + $14 USDC

  Net: Lost 100 BONK (exercised by Bob), gained $14
  At $0.12 BONK price: Lost $12 of BONK, gained $14 = +$2 profit
```

---

## 🔄 Token Flow Diagram

```
                    OPTION WRITER
                         │
                         │ deposits 1000 BONK
                         ↓
              ┌──────────────────────┐
              │  COLLATERAL VAULT    │
              │   1000 BONK          │
              └──────────────────────┘
                         │
                         │ protocol mints
                         ↓
        ┌────────────────┴────────────────┐
        │                                  │
        ↓                                  ↓
┌──────────────┐                  ┌──────────────┐
│ OPTION TOKEN │                  │ REDEMPTION   │
│   1000       │                  │ TOKEN 1000   │
└──────────────┘                  └──────────────┘
        │                                  │
        │ sells on DEX                     │ holds
        ↓                                  │
   OPTION BUYER                            │
        │                                  │
        │ exercises                        │
        │ (pays USDC)                      │
        ↓                                  │
┌──────────────────────┐                  │
│  CASH VAULT          │                  │
│   $40 USDC           │                  │
└──────────────────────┘                  │
        │                                  │
        │ collateral vault                 │
        │ sends BONK out                   │
        ↓                                  │
   BUYER GETS BONK                         │
                                           │
                                           │ after expiry
                                           ↓
                                   WRITER REDEEMS
                                           │
                                           │ gets pro-rata
                                           ↓
                        ┌──────────────────┴──────────────────┐
                        │                                      │
                        ↓                                      ↓
                  REMAINING BONK                          USDC FROM
                  (from vault)                         EXERCISES (from vault)
```

---

## 🏛️ Account Architecture & PDA Relationships

```
┌─────────────────────────────────────────────────────────────┐
│              PROTOCOL STATE (Singleton PDA)                  │
│  Seeds: ["protocol_state"]                                  │
│  Data: admin, paused, version                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ has many
                              ↓
┌─────────────────────────────────────────────────────────────┐
│           OPTION SERIES #1 (PDA per market)                  │
│  Seeds: ["option_series", BONK_mint, 4000000, 1735689600]  │
│  Data: strike=$0.04, expiry=Dec31, total_supply, bumps      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─────────────┬─────────────┬─────────────┐
                              │             │             │             │
                              ↓             ↓             ↓             ↓
                    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                    │ OPTION MINT  │ │ REDEMPTION   │ │ COLLATERAL   │ │ CASH VAULT   │
                    │   (PDA)      │ │ MINT (PDA)   │ │ VAULT (PDA)  │ │   (PDA)      │
                    ├──────────────┤ ├──────────────┤ ├──────────────┤ ├──────────────┤
                    │ Seeds:       │ │ Seeds:       │ │ Seeds:       │ │ Seeds:       │
                    │ ["option_    │ │ ["redemption│ │ ["collateral│ │ ["cash_vault"│
                    │  mint",      │ │  _mint",    │ │  _vault",   │ │  series]     │
                    │  series]     │ │  series]    │ │  series]    │ │              │
                    │              │ │              │ │              │ │              │
                    │ Authority:   │ │ Authority:   │ │ Authority:   │ │ Authority:   │
                    │ option_series│ │ option_series│ │ option_series│ │ option_series│
                    └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### PDA Derivation Examples

**Option Series PDA:**
```rust
// Makes each market unique
seeds = [
    b"option_series",
    BONK_MINT.as_ref(),           // DezXAZ8z7Pnrn...
    4_000_000_u64.to_le_bytes(),  // Strike: 4 cents
    1735689600_i64.to_le_bytes()  // Expiry: Dec 31, 2025
]
// Result: Unique address for "BONK $0.04 Dec2025 calls"
```

**Vault PDA:**
```rust
// Tied to specific series
seeds = [
    b"collateral_vault",
    option_series_pda.as_ref()  // The series address
]
// Result: Unique vault for this series only
```

---

## 🔄 State Transitions

```
PROTOCOL STATE MACHINE:

┌─────────────┐
│  CREATED    │  create_option_series()
│  (Init)     │  - All vaults empty
│             │  - total_supply = 0
└──────┬──────┘
       │
       │ mint_options()
       ↓
┌─────────────┐
│  ACTIVE     │  Pre-expiry phase
│  (Trading)  │  - Minting allowed
│             │  - Exercise allowed
│             │  - Burn allowed
└──────┬──────┘
       │
       │ Some exercises occur
       ↓
┌─────────────┐
│  MIXED      │  Pre-expiry (with exercises)
│  (Partial)  │  - Collateral vault: BONK
│             │  - Cash vault: USDC
│             │  - Both vaults have balances
└──────┬──────┘
       │
       │ Clock >= expiration
       ↓
┌─────────────┐
│  EXPIRED    │  Post-expiry phase
│  (Settled)  │  - Minting blocked
│             │  - Exercise blocked
│             │  - Redeem allowed
│             │  - Burn still allowed
└──────┬──────┘
       │
       │ All redemptions complete
       ↓
┌─────────────┐
│  DRAINED    │  Final state
│  (Closed)   │  - Vaults empty
│             │  - total_supply unchanged
│             │  - No more activity
└─────────────┘
```

### Operation Availability

| Operation | Pre-Expiry | Post-Expiry | Expiry Check | Impact on total_supply |
|-----------|------------|-------------|--------------|------------------------|
| **Mint** | ✅ Yes | ❌ No | `Clock < expiration` | Increases (+amount) |
| **Exercise** | ✅ Yes | ❌ No | `Clock < expiration` | No change |
| **Burn Paired** | ✅ Yes | ✅ Yes | None (anytime!) | Decreases (-amount) |
| **Redeem** | ❌ No | ✅ Yes | `Clock >= expiration` | No change |

**Key Insight**: Burn is the **only** operation that:
- Works in both pre-expiry and post-expiry states
- Decreases total_supply (all others increase or maintain it)

---

## 🔐 Security Architecture

### Defense in Depth

**Layer 1: Anchor Type Safety**
```rust
// Automatic checks by Anchor:
- Account ownership (program owns it)
- Account discriminator (correct account type)
- Signer validation (user authorized)
```

**Layer 2: has_one Constraints**
```rust
#[account(
    mut,
    has_one = option_mint,          // Validates mint belongs to series
    has_one = collateral_vault,      // Validates vault belongs to series
)]
pub option_series: Account<'info, OptionSeries>,
```

**Layer 3: Custom Constraints**
```rust
constraint = Clock::get()?.unix_timestamp < option_series.expiration @ ErrorCode::OptionExpired,
constraint = collateral_vault.amount >= amount @ ErrorCode::InsufficientCollateral,
```

**Layer 4: PDA Canonical Bumps**
```rust
// Stored on init, reused later (saves 60K CU + enforces canonical PDA)
bump = option_series.collateral_vault_bump,
```

**Layer 5: Checked Arithmetic**
```rust
// All math uses checked operations
let payout = vault_balance
    .checked_mul(amount)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(total_supply)
    .ok_or(ErrorCode::MathOverflow)?;
```

### Security Audit Checklist

- ✅ **No private keys** (all vaults are PDAs)
- ✅ **Full collateralization** (1:1 backing)
- ✅ **Integer overflow protection** (checked arithmetic)
- ✅ **Account validation** (has_one + custom constraints)
- ✅ **PDA uniqueness** (unique seeds per series/vault)
- ✅ **Time manipulation resistant** (Clock sysvar validated by Anchor)
- ✅ **Reentrancy safe** (Anchor single-threaded execution)

---

## 💻 Development Setup

### Build

```bash
# Build the program
anchor build

# Get the program ID
anchor keys list

# Update program ID in Anchor.toml and lib.rs
# Then rebuild
anchor build
```

### Test

```bash
# Run all tests
anchor test

# Run specific test
anchor test -- --test test_mint

# Run with detailed logs
RUST_LOG=debug anchor test
```

### Deploy

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet (requires SOL)
anchor deploy --provider.cluster mainnet
```

---

## 🎯 Key Takeaways

### Architecture Highlights

1. **Dual-Token Model** - Separates exercisability from vault claims
2. **Full Collateralization** - 1:1 backing eliminates counterparty risk
3. **PDA Vaults** - No private keys, fully trustless custody
4. **American Options** - Exercise anytime pre-expiry (max flexibility)
5. **Pro-Rata Redemption** - Fair post-expiry distribution

### User Benefits

- **Writers**: Earn premiums, keep redemption tokens, get mixed-asset redemption
- **Buyers**: Leverage with fixed downside (premium paid upfront)
- **Market Makers**: Flexible inventory management with burn mechanism

### Protocol Economics

- ✅ **No liquidations** (fully collateralized)
- ✅ **No oracle risk** (strike fixed at creation)
- ✅ **No counterparty risk** (protocol custody)
- ✅ **Composable tokens** (SPL standard, DEX tradable)
- ✅ **Solana-native** (high TPS, low fees)

---

## 📖 Documentation

- **[DESIGN.md](./DESIGN.md)** - Comprehensive technical specification
  - Complete instruction implementations
  - Security analysis
  - Account structures
  - TypeScript examples
  - Edge cases and validations

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Security Disclosure

If you discover a security vulnerability, please email security@example.com. Do not open a public issue.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Anchor Framework](https://www.anchor-lang.com/) - The foundation of this project
- [Solana Labs](https://solana.com/) - For the high-performance blockchain
- [Zeta Markets](https://zeta.markets/) - Inspiration for options on Solana
- The Solana developer community

---

## 📞 Contact

- Twitter: [@yourusername](https://twitter.com/yourusername)
- Discord: [Your Discord](https://discord.gg/yourserver)
- Email: contact@example.com

---

<div align="center">

**Built with ❤️ on Solana**

[Documentation](./DESIGN.md) • [Report Bug](https://github.com/yourusername/sol_option_protocol/issues) • [Request Feature](https://github.com/yourusername/sol_option_protocol/issues)

</div>
