# Quick Reference Guide

## 🚀 What Is This?

A **fully collateralized American options protocol** on Solana for SPL tokens.

**One sentence**: Deposit BONK, get option + redemption tokens, sell options for premium, redeem mixed assets after expiry.

---

## 📊 Key Concept

### Dual-Token Model

```
YOU DEPOSIT: 100 BONK
YOU GET: 100 Option Tokens + 100 Redemption Tokens

Option Token = Right to BUY at strike (before expiry)
Redemption Token = Claim on vault (after expiry)
```

---

## 🎯 5 Core Instructions

| Instruction | What It Does | When | Effect on total_supply |
|-------------|--------------|------|----------------------|
| **create_option_series** | Create new market | Anytime | - |
| **mint_options** | Deposit BONK, get tokens | Pre-expiry | ↑ Increases |
| **exercise_option** | Pay strike, get BONK | Pre-expiry | - |
| **redeem** | Get pro-rata BONK+USDC | Post-expiry | - |
| **burn_paired_tokens** | Burn both, get BONK back | **Anytime** | ↓ **Decreases** |

---

## 📁 Important Files

```
programs/sol_option_protocol/src/
├── lib.rs                    ← Entry point (5 instructions)
├── state/option_series.rs    ← Core data structure
├── instructions/
│   ├── create_series.rs      ← Initialize market
│   ├── mint_options.rs       ← Deposit collateral
│   ├── exercise.rs           ← Exercise options
│   ├── redeem.rs             ← Post-expiry claim
│   └── burn_paired.rs        ← 1:1 refund
└── errors.rs                 ← Error codes
```

---

## 🔑 OptionSeries Account

```rust
pub struct OptionSeries {
    // What
    pub underlying_mint: Pubkey,      // BONK
    pub strike_price: u64,            // 4 cents
    pub strike_currency: Pubkey,      // USDC
    pub expiration: i64,              // Unix time
    
    // Where
    pub option_mint: Pubkey,          // Option token mint (PDA)
    pub redemption_mint: Pubkey,      // Redemption token mint (PDA)
    pub collateral_vault: Pubkey,     // BONK vault (PDA)
    pub cash_vault: Pubkey,           // USDC vault (PDA)
    
    // Stats
    pub total_supply: u64,            // Total options minted
    pub exercised_amount: u64,        // Total exercised
    
    // Performance (saves 60K CU!)
    pub bump: u8,
    pub option_mint_bump: u8,
    pub redemption_mint_bump: u8,
    pub collateral_vault_bump: u8,
    pub cash_vault_bump: u8,
}
```

---

## 🔄 State Flow

```
CREATE → MINT → EXERCISE → EXPIRE → REDEEM
  ↓       ↓        ↓         ↓        ↓
Empty   Active   Mixed    Expired  Drained
        
BURN works at ANY stage (except drained)
```

---

## 🎓 Common Patterns

### Create Series

```rust
create_option_series(
    strike_price: 4_000_000,  // $0.04
    expiration: 1735689600     // Dec 31, 2025
)
```

### Mint Options

```rust
mint_options(amount: 100_000)
// Deposits 100 BONK (5 decimals)
// Mints 100 option + 100 redemption tokens
```

### Exercise Options

```rust
exercise_option(amount: 100_000)
// Burns 100 option tokens
// Pays $4 USDC (100 * $0.04)
// Receives 100 BONK
```

### Redeem (Post-Expiry)

```rust
redeem(amount: 100_000)
// Burns 100 redemption tokens
// Receives pro-rata BONK + USDC
```

### Burn Paired

```rust
burn_paired_tokens(amount: 100_000)
// Burns 100 option + 100 redemption tokens
// Receives 100 BONK (1:1 refund)
```

---

## 🛡️ Security Features

1. **PDA Vaults**: No private keys, program-controlled
2. **has_one Constraints**: Validates account relationships
3. **Checked Math**: Prevents overflow/underflow
4. **Canonical Bumps**: Stored for security + performance
5. **Time Checks**: Clock sysvar for expiry validation
6. **Token-2022**: Future-proof with InterfaceAccount

---

## 🧪 Testing

```bash
# Run all tests
anchor test

# Run specific phase
anchor test -- --grep "phase3"

# Deploy to devnet
anchor deploy --provider.cluster devnet

# View logs
solana logs <program-id>
```

---

## 📈 Example Scenario

```
Alice (Writer):
  1. Deposits 1000 BONK
  2. Gets 1000 option + 1000 redemption tokens
  3. Sells 100 option tokens to Bob for $10 premium
  4. Keeps 900 option + 1000 redemption tokens

Bob (Buyer):
  1. Buys 100 option tokens for $10
  2. BONK pumps to $0.12 (strike is $0.04)
  3. Exercises: pays $4, gets 100 BONK worth $12
  4. Sells BONK, nets $12 - $4 - $10 = -$2 loss
     (would profit if BONK > $0.14)

At Expiry:
  Vaults: 900 BONK + $4 USDC
  Alice redeems 1000 tokens:
    - Gets 900 BONK + $4 USDC
    - Net: Lost 100 BONK, gained $14
```

---

## 🔍 Key Insights

1. **total_supply** tracks outstanding claims (increases on mint, decreases ONLY on burn)
2. **exercised_amount** tracks exercise activity (never decreases)
3. **Redemption tokens** stay with writer after selling option tokens
4. **Pro-rata formula**: `payout = (vault_balance × user_tokens) / total_supply`
5. **Burn** is the only anytime operation that decreases total_supply

---

## 📚 Documentation

- **CODEBASE_EXPLANATION.md**: Comprehensive deep dive
- **README.md**: User-facing overview
- **DESIGN.md**: Technical specification
- **This file**: Quick reference

---

## 🎯 When to Use What

| You Want To... | Use This |
|----------------|----------|
| Understand the concept | README.md → Core Innovation |
| Learn the architecture | CODEBASE_EXPLANATION.md |
| Implement integration | DESIGN.md → Instructions |
| Quick lookup | This file |
| See examples | tests/*.ts |

---

## 💡 Pro Tips

1. **Always store PDA bumps** on init (saves 15K CU per PDA!)
2. **Use `has_one`** for account validation
3. **Use checked arithmetic** for all math operations
4. **Use `InterfaceAccount`** for Token-2022 compatibility
5. **Burn decreases supply**, redeem does not

---

**Need Help?**
- Check `/tests` for working examples
- Read `CODEBASE_EXPLANATION.md` for details
- Review `DESIGN.md` for API reference
