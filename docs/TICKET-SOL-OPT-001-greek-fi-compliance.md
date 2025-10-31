# 🎫 ENGINEERING TICKET: Implement Greek.fi Specification Compliance

## 📋 Ticket ID: `SOL-OPT-001`
## Priority: **CRITICAL** | Type: **Feature Implementation**
## Effort: **8-12 hours**

---

## 🎯 Problem Statement

Current implementation deviates from Greek.fi protocol specification in two critical areas:

1. **Missing `is_put` parameter** in option series creation (spec requirement: `(Collateral, Consideration, Strike, Expiration, isPut)`)
2. **Missing `redeemConsideration()` instruction** - SHORT token holders cannot claim strike payments before expiry, blocking capital efficiency

### Impact
- ❌ Non-compliant with Greek.fi whitepaper specification
- ❌ SHORT tokens lack capital efficiency (writers locked until expiry)
- ❌ Cannot use SHORT tokens as loan collateral (missing pre-expiry value extraction)
- ❌ Market makers cannot rotate capital efficiently

---

## 📊 Current State Analysis

### ✅ What Works Correctly
- **Architecture**: Single program with PDA-based mints (Solana-native, not contract cloning) ✅
- **Deposit mechanism**: Automatic collateral deposit in `mint_options` (no separate instruction needed) ✅
- **Core operations**: create_series, mint_options, exercise, redeem (post-expiry), burn_paired ✅

### ❌ Gaps vs Greek.fi Spec

**From Greek.fi Technical Spec:**
> "Each option pair is represented by a tuple: `(Collateral, Consideration, Strike, Expiration, isPut)`"

**Current Implementation:**
```rust
// programs/sol_option_protocol/src/state/option_series.rs:6-51
pub struct OptionSeries {
    pub underlying_mint: Pubkey,      // ✅ Collateral
    pub strike_price: u64,            // ✅ Strike
    pub strike_currency: Pubkey,      // ✅ Consideration
    pub expiration: i64,              // ✅ Expiration
    // ❌ MISSING: pub is_put: bool
}
```

**From Greek.fi Whitepaper (PDF page 3):**
> "prior to expiration, the SHORT token provides the ability to **redeem the consideration asset after LONG holders exercise**"

**Current Implementation:**
- ❌ No `redeem_consideration` instruction exists
- ❌ Strike payments accumulate in `cash_vault` but SHORT holders cannot access until expiry
- ❌ No per-user tracking of consideration claims

---

## 🔧 Required Changes

### **1. Add `is_put` Parameter to State**

**File: `programs/sol_option_protocol/src/state/option_series.rs`**

**Current (Line 6-51):**
```rust
#[account]
pub struct OptionSeries {
    pub underlying_mint: Pubkey,
    pub strike_price: u64,
    pub strike_currency: Pubkey,
    pub expiration: i64,
    pub option_mint: Pubkey,
    pub redemption_mint: Pubkey,
    pub collateral_vault: Pubkey,
    pub cash_vault: Pubkey,
    pub total_supply: u64,
    pub exercised_amount: u64,
    pub bump: u8,
    pub option_mint_bump: u8,
    pub redemption_mint_bump: u8,
    pub collateral_vault_bump: u8,
    pub cash_vault_bump: u8,
}
```

**Required Change:**
```rust
#[account]
pub struct OptionSeries {
    pub underlying_mint: Pubkey,
    pub strike_price: u64,
    pub strike_currency: Pubkey,
    pub expiration: i64,
    pub is_put: bool,                           // ADD THIS (decorative flag for UI)
    pub total_consideration_withdrawn: u64,     // ADD THIS (track total claimed consideration)
    pub option_mint: Pubkey,
    pub redemption_mint: Pubkey,
    pub collateral_vault: Pubkey,
    pub cash_vault: Pubkey,
    pub total_supply: u64,
    pub exercised_amount: u64,
    pub bump: u8,
    pub option_mint_bump: u8,
    pub redemption_mint_bump: u8,
    pub collateral_vault_bump: u8,
    pub cash_vault_bump: u8,
}

impl OptionSeries {
    // UPDATE THIS (Line 56-71)
    pub const LEN: usize = 8 +   // discriminator
        32 +  // underlying_mint
        8 +   // strike_price
        32 +  // strike_currency
        8 +   // expiration
        1 +   // is_put (ADD)
        8 +   // total_consideration_withdrawn (ADD)
        32 +  // option_mint
        32 +  // redemption_mint
        32 +  // collateral_vault
        32 +  // cash_vault
        8 +   // total_supply
        8 +   // exercised_amount
        1 +   // bump
        1 +   // option_mint_bump
        1 +   // redemption_mint_bump
        1 +   // collateral_vault_bump
        1;    // cash_vault_bump
    // New total: 196 bytes (was 187)
}
```

---

### **2. Create ConsiderationClaim Account Structure**

**File: `programs/sol_option_protocol/src/state/consideration_claim.rs` (NEW FILE)**

```rust
use anchor_lang::prelude::*;

/// Tracks per-user consideration withdrawals for a specific option series
/// PDA seeds: ["consideration_claim", option_series, user]
#[account]
pub struct ConsiderationClaim {
    /// The option series this claim belongs to
    pub option_series: Pubkey,

    /// The user who owns this claim
    pub user: Pubkey,

    /// Total amount of consideration this user has withdrawn
    pub amount_withdrawn: u64,

    /// PDA bump
    pub bump: u8,
}

impl ConsiderationClaim {
    pub const LEN: usize = 8 +  // discriminator
        32 +  // option_series
        32 +  // user
        8 +   // amount_withdrawn
        1;    // bump
    // Total: 81 bytes
}
```

**File: `programs/sol_option_protocol/src/state/mod.rs`**

**Current (Line 1-3):**
```rust
pub mod option_series;

pub use option_series::*;
```

**Required Change:**
```rust
pub mod option_series;
pub mod consideration_claim;  // ADD THIS

pub use option_series::*;
pub use consideration_claim::*;  // ADD THIS
```

---

### **3. Update create_option_series to Accept is_put**

**File: `programs/sol_option_protocol/src/lib.rs`**

**Current (Line 17-23):**
```rust
pub fn create_option_series(
    ctx: Context<CreateOptionSeries>,
    strike_price: u64,
    expiration: i64,
) -> Result<()> {
    instructions::create_series::handler(ctx, strike_price, expiration)
}
```

**Required Change:**
```rust
pub fn create_option_series(
    ctx: Context<CreateOptionSeries>,
    strike_price: u64,
    expiration: i64,
    is_put: bool,  // ADD THIS
) -> Result<()> {
    instructions::create_series::handler(ctx, strike_price, expiration, is_put)
}
```

**File: `programs/sol_option_protocol/src/instructions/create_series.rs`**

**Current Handler (Line 94-130):**
```rust
pub fn handler(
    ctx: Context<CreateOptionSeries>,
    strike_price: u64,
    expiration: i64,
) -> Result<()> {
    // ... validation ...

    let option_series = &mut ctx.accounts.option_series;
    option_series.underlying_mint = ctx.accounts.underlying_mint.key();
    option_series.strike_price = strike_price;
    option_series.strike_currency = ctx.accounts.strike_currency_mint.key();
    option_series.expiration = expiration;
    // ... rest of initialization ...
}
```

**Required Change:**
```rust
pub fn handler(
    ctx: Context<CreateOptionSeries>,
    strike_price: u64,
    expiration: i64,
    is_put: bool,  // ADD THIS
) -> Result<()> {
    // ... validation ...

    let option_series = &mut ctx.accounts.option_series;
    option_series.underlying_mint = ctx.accounts.underlying_mint.key();
    option_series.strike_price = strike_price;
    option_series.strike_currency = ctx.accounts.strike_currency_mint.key();
    option_series.expiration = expiration;
    option_series.is_put = is_put;                              // ADD THIS
    option_series.total_consideration_withdrawn = 0;             // ADD THIS
    // ... rest of initialization ...
}
```

---

### **4. Update exercise to Track Consideration**

**File: `programs/sol_option_protocol/src/instructions/exercise.rs`**

**Current (Line 168-182):**
```rust
// 4. Update exercised amount
let option_series = &mut ctx.accounts.option_series;
option_series.exercised_amount = option_series.exercised_amount
    .checked_add(amount)
    .ok_or(ErrorCode::MathOverflow)?;

msg!(
    "Exercised {} options. Strike payment: {}. Total exercised: {}",
    amount,
    strike_payment,
    option_series.exercised_amount
);

Ok(())
```

**Required Change:**
```rust
// 4. Update exercised amount AND track total consideration received
let option_series = &mut ctx.accounts.option_series;
option_series.exercised_amount = option_series.exercised_amount
    .checked_add(amount)
    .ok_or(ErrorCode::MathOverflow)?;

// ADD THIS: Track total consideration in cash vault
// Note: total_consideration_withdrawn tracks claims, not deposits
// The difference is the claimable amount

msg!(
    "Exercised {} options. Strike payment: {}. Total exercised: {}",
    amount,
    strike_payment,
    option_series.exercised_amount
);

Ok(())
```

---

### **5. Create initialize_consideration_claim Instruction**

**File: `programs/sol_option_protocol/src/instructions/initialize_consideration_claim.rs` (NEW FILE)**

```rust
use anchor_lang::prelude::*;
use crate::state::{OptionSeries, ConsiderationClaim};

/// Initializes a ConsiderationClaim PDA for a user
#[derive(Accounts)]
pub struct InitializeConsiderationClaim<'info> {
    /// User initializing their claim account
    #[account(mut)]
    pub user: Signer<'info>,

    /// The option series
    pub option_series: Account<'info, OptionSeries>,

    /// The consideration claim PDA
    #[account(
        init,
        payer = user,
        space = ConsiderationClaim::LEN,
        seeds = [
            b"consideration_claim",
            option_series.key().as_ref(),
            user.key().as_ref()
        ],
        bump
    )]
    pub consideration_claim: Account<'info, ConsiderationClaim>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeConsiderationClaim>) -> Result<()> {
    let consideration_claim = &mut ctx.accounts.consideration_claim;
    consideration_claim.option_series = ctx.accounts.option_series.key();
    consideration_claim.user = ctx.accounts.user.key();
    consideration_claim.amount_withdrawn = 0;
    consideration_claim.bump = ctx.bumps.consideration_claim;

    msg!(
        "Initialized consideration claim for user {} on series {}",
        ctx.accounts.user.key(),
        ctx.accounts.option_series.key()
    );

    Ok(())
}
```

---

### **6. Create redeem_consideration Instruction (CRITICAL)**

**File: `programs/sol_option_protocol/src/instructions/redeem_consideration.rs` (NEW FILE)**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};
use crate::state::{OptionSeries, ConsiderationClaim};
use crate::errors::ErrorCode;

/// Allows SHORT token holders to claim consideration before expiry
/// This is THE critical capital efficiency feature from Greek.fi spec
#[derive(Accounts)]
pub struct RedeemConsideration<'info> {
    /// User redeeming consideration (SHORT token holder)
    #[account(mut)]
    pub user: Signer<'info>,

    /// The option series
    #[account(
        mut,
        has_one = strike_currency @ ErrorCode::InvalidStrikeCurrency,
        has_one = cash_vault @ ErrorCode::InvalidCashVault,
        has_one = redemption_mint @ ErrorCode::InvalidRedemptionMint,
    )]
    pub option_series: Account<'info, OptionSeries>,

    /// Strike currency mint (USDC)
    pub strike_currency: InterfaceAccount<'info, Mint>,

    /// Redemption token mint (SHORT token)
    #[account(
        seeds = [b"redemption_mint", option_series.key().as_ref()],
        bump = option_series.redemption_mint_bump,
    )]
    pub redemption_mint: InterfaceAccount<'info, Mint>,

    /// Cash vault holding consideration
    #[account(
        mut,
        seeds = [b"cash_vault", option_series.key().as_ref()],
        bump = option_series.cash_vault_bump,
    )]
    pub cash_vault: InterfaceAccount<'info, TokenAccount>,

    /// User's SHORT token account
    #[account(
        token::mint = redemption_mint,
        token::authority = user,
    )]
    pub user_redemption_account: InterfaceAccount<'info, TokenAccount>,

    /// User's strike currency account (receives USDC)
    #[account(
        mut,
        token::mint = strike_currency,
        token::authority = user,
    )]
    pub user_strike_account: InterfaceAccount<'info, TokenAccount>,

    /// User's consideration claim tracking
    #[account(
        mut,
        seeds = [
            b"consideration_claim",
            option_series.key().as_ref(),
            user.key().as_ref()
        ],
        bump = consideration_claim.bump,
        has_one = option_series @ ErrorCode::InvalidOptionSeries,
        has_one = user @ ErrorCode::InvalidUser,
    )]
    pub consideration_claim: Account<'info, ConsiderationClaim>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<RedeemConsideration>) -> Result<()> {
    let option_series = &ctx.accounts.option_series;

    // Get user's SHORT token balance
    let user_short_balance = ctx.accounts.user_redemption_account.amount;
    require!(user_short_balance > 0, ErrorCode::NoShortTokens);

    // Get current cash vault balance (total consideration available)
    let cash_vault_balance = ctx.accounts.cash_vault.amount;
    require!(cash_vault_balance > 0, ErrorCode::NoCashAvailable);

    // Calculate user's pro-rata share of total consideration in vault
    // Formula: (user_short_balance / total_supply) × cash_vault_balance
    let total_supply = option_series.total_supply;
    require!(total_supply > 0, ErrorCode::NoTokensIssued);

    let user_total_share = cash_vault_balance
        .checked_mul(user_short_balance)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(total_supply)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate claimable amount (what they haven't withdrawn yet)
    let already_withdrawn = ctx.accounts.consideration_claim.amount_withdrawn;
    let claimable = user_total_share
        .checked_sub(already_withdrawn)
        .ok_or(ErrorCode::NoClaimableConsideration)?;

    require!(claimable > 0, ErrorCode::NoClaimableConsideration);

    // Transfer consideration from cash vault to user (PDA signs)
    let underlying_mint_key = option_series.underlying_mint;
    let strike_price_bytes = option_series.strike_price.to_le_bytes();
    let expiration_bytes = option_series.expiration.to_le_bytes();
    let bump = option_series.bump;

    let signer_seeds: &[&[&[u8]]] = &[&[
        b"option_series",
        underlying_mint_key.as_ref(),
        strike_price_bytes.as_ref(),
        expiration_bytes.as_ref(),
        &[bump],
    ]];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.cash_vault.to_account_info(),
                mint: ctx.accounts.strike_currency.to_account_info(),
                to: ctx.accounts.user_strike_account.to_account_info(),
                authority: option_series.to_account_info(),
            },
            signer_seeds,
        ),
        claimable,
        ctx.accounts.strike_currency.decimals,
    )?;

    // Update withdrawn amount
    let consideration_claim = &mut ctx.accounts.consideration_claim;
    consideration_claim.amount_withdrawn = user_total_share;

    // Update global tracking
    let option_series = &mut ctx.accounts.option_series;
    option_series.total_consideration_withdrawn = option_series
        .total_consideration_withdrawn
        .checked_add(claimable)
        .ok_or(ErrorCode::MathOverflow)?;

    msg!(
        "Redeemed {} consideration. User share: {}/{} ({}%). Already withdrawn: {}",
        claimable,
        user_short_balance,
        total_supply,
        (user_short_balance as f64 / total_supply as f64 * 100.0) as u64,
        already_withdrawn
    );

    Ok(())
}
```

---

### **7. Update Instruction Exports**

**File: `programs/sol_option_protocol/src/instructions/mod.rs`**

**Current:**
```rust
pub mod create_series;
pub mod mint_options;
pub mod exercise;
pub mod redeem;
pub mod burn_paired;

#[allow(ambiguous_glob_reexports)]
pub use create_series::*;
#[allow(ambiguous_glob_reexports)]
pub use mint_options::*;
#[allow(ambiguous_glob_reexports)]
pub use exercise::*;
#[allow(ambiguous_glob_reexports)]
pub use redeem::*;
#[allow(ambiguous_glob_reexports)]
pub use burn_paired::*;
```

**Required Change:**
```rust
pub mod create_series;
pub mod mint_options;
pub mod exercise;
pub mod redeem;
pub mod burn_paired;
pub mod initialize_consideration_claim;  // ADD
pub mod redeem_consideration;            // ADD

#[allow(ambiguous_glob_reexports)]
pub use create_series::*;
#[allow(ambiguous_glob_reexports)]
pub use mint_options::*;
#[allow(ambiguous_glob_reexports)]
pub use exercise::*;
#[allow(ambiguous_glob_reexports)]
pub use redeem::*;
#[allow(ambiguous_glob_reexports)]
pub use burn_paired::*;
#[allow(ambiguous_glob_reexports)]
pub use initialize_consideration_claim::*;  // ADD
#[allow(ambiguous_glob_reexports)]
pub use redeem_consideration::*;            // ADD
```

---

### **8. Register Instructions in Program**

**File: `programs/sol_option_protocol/src/lib.rs`**

**Add after `burn_paired_tokens` (after line 59):**
```rust
/// Initializes consideration claim tracking for a user
pub fn initialize_consideration_claim(
    ctx: Context<InitializeConsiderationClaim>,
) -> Result<()> {
    instructions::initialize_consideration_claim::handler(ctx)
}

/// Allows SHORT holders to claim consideration before expiry
/// This is the capital efficiency mechanism from Greek.fi spec
pub fn redeem_consideration(
    ctx: Context<RedeemConsideration>,
) -> Result<()> {
    instructions::redeem_consideration::handler(ctx)
}
```

---

### **9. Add Error Codes**

**File: `programs/sol_option_protocol/src/errors.rs`**

**Add after line 48 (after `NoTokensIssued`):**
```rust
#[error_code]
pub enum ErrorCode {
    // ... existing errors ...

    #[msg("No SHORT tokens held")]
    NoShortTokens,

    #[msg("No consideration available in vault")]
    NoCashAvailable,

    #[msg("No claimable consideration (already withdrawn all)")]
    NoClaimableConsideration,

    #[msg("Invalid option series")]
    InvalidOptionSeries,

    #[msg("Invalid user")]
    InvalidUser,
}
```

---

### **10. Remove Unused deposit.rs (Code Cleanup)**

**File: `programs/sol_option_protocol/src/instructions/deposit.rs`**

**Action:** DELETE THIS FILE
- Not integrated in lib.rs (unreachable code)
- References non-existent `total_deposited` field
- Functionality already handled by `mint_options`

---

## 🧪 Testing Requirements

### **New Test File: `tests/greek_fi_compliance.ts`**

Must verify:

1. **isPut Parameter Storage**
   - Create series with `is_put: true` → verify stored
   - Create series with `is_put: false` → verify stored
   - Verify isPut doesn't affect any operation logic

2. **Consideration Claim Flow**
   - Writer mints 100 options
   - Writer sells 50 LONG tokens to Buyer
   - Buyer exercises 50 options (pays $2 USDC to vault)
   - **Writer immediately claims $2 USDC using SHORT tokens** (before expiry!)
   - Verify: writer's USDC balance increased by $2
   - Verify: cash_vault decreased by $2
   - Verify: ConsiderationClaim.amount_withdrawn = $2

3. **Multiple Claims**
   - After partial withdrawal, more exercises happen
   - Writer claims again
   - Verify: only NEW consideration is claimable
   - Verify: amount_withdrawn tracks cumulative

4. **Multi-User Pro-Rata**
   - Writer1 mints 60 options (60 SHORT)
   - Writer2 mints 40 options (40 SHORT)
   - Total: 100 options, 100 SHORT tokens
   - 50 options exercised → $2 USDC to vault
   - Writer1 claims: should get $1.20 (60% of $2)
   - Writer2 claims: should get $0.80 (40% of $2)

5. **Error Cases**
   - Claim with 0 SHORT tokens → `NoShortTokens` error
   - Claim with no exercises yet → `NoCashAvailable` error
   - Claim after fully withdrawn → `NoClaimableConsideration` error

### **Update Existing Tests**

**File: `tests/phase*_testnet.ts`**
- Update `create_option_series` calls to include `is_put` parameter
- Example: `await program.methods.createOptionSeries(strikePrice, expiration, false).rpc()`

---

## 📚 Technical Specifications

### **PDA Derivation**

**ConsiderationClaim:**
```
seeds: [
  b"consideration_claim",
  option_series.key(),
  user.key()
]
```

### **Calculation Formulas**

**User's Total Share:**
```
user_total_share = (cash_vault_balance × user_short_balance) / total_supply
```

**Claimable Amount:**
```
claimable = user_total_share - already_withdrawn
```

### **State Size Changes**

**OptionSeries:** 187 bytes → 196 bytes (+9 bytes)
- `is_put: bool` (+1 byte)
- `total_consideration_withdrawn: u64` (+8 bytes)

**ConsiderationClaim:** 81 bytes (new account type)

---

## ✅ Acceptance Criteria

- [ ] OptionSeries includes `is_put: bool` field
- [ ] OptionSeries includes `total_consideration_withdrawn: u64` field
- [ ] ConsiderationClaim account structure created
- [ ] `initialize_consideration_claim` instruction implemented
- [ ] `redeem_consideration` instruction implemented
- [ ] `create_option_series` accepts `is_put` parameter
- [ ] All error codes added
- [ ] `deposit.rs` file removed
- [ ] All tests updated with `is_put` parameter
- [ ] New `greek_fi_compliance.ts` test file passes
- [ ] `anchor build` succeeds without warnings
- [ ] TypeScript type generation succeeds
- [ ] All existing tests still pass
- [ ] Documentation updated with new instructions

---

## 🚨 Breaking Changes

**Client Impact:**
- `create_option_series` now requires `is_put: bool` parameter
- Existing test scripts must be updated

**State Migration:**
- New deployments only (no migration needed for existing series)
- OptionSeries account size increased by 9 bytes

---

## 📖 References

- **Greek.fi PDF Whitepaper:** Page 1 (isPut), Page 3 (redeemConsideration)
- **Greek.fi Technical Spec:** [GitHub technical.md](https://github.com/greekfi/whitepaper/blob/main/technical.md)
- **Greek.fi Whitepaper:** [GitHub wp.md](https://github.com/greekfi/whitepaper/blob/main/wp.md)
- **Solana Program:** `/Users/danial/CursorProjects/sol_option_protocol/programs/sol_option_protocol/`

---

**END OF TICKET**
