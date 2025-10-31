# Setup & Run Guide

## Prerequisites

You need Anchor framework installed to run the tests.

### Install Anchor (if not already installed)

```bash
# Install Anchor Version Manager (avm)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# Install Anchor 0.32.0
avm install 0.32.0
avm use 0.32.0

# Verify installation
anchor --version
# Should output: anchor-cli 0.32.0
```

### Alternative: Use Docker

If you have issues with local Anchor installation:

```bash
# Pull Anchor image
docker pull projectserum/build:v0.32.0

# Run tests in container
docker run -v $(pwd):/workspace -w /workspace projectserum/build:v0.32.0 anchor test
```

---

## Quick Start

### 1. Build Programs

```bash
anchor build
```

This compiles both:
- `/programs/sol_option_protocol/` - Options protocol
- `/programs/spl_marketplace/` - SPL marketplace

### 2. Run Tests

```bash
anchor test
```

This will:
1. Start a local Solana validator
2. Deploy both programs
3. Run `/tests/spl_marketplace_demo.ts`
4. Show results
5. Cleanup

**Expected runtime**: ~30-60 seconds

---

## What the Tests Do

### Test 1: Create Market
- Creates a market for token pair (base/quote)
- Verifies Market PDA is initialized

### Test 2: Place Order
- User places sell order (100 tokens @ 10 each)
- Verifies 100 tokens are escrowed

### Test 3: Fill Order (THE DEMO)
- Buyer fills seller's order
- **Atomic swap happens:**
  - Seller gets payment
  - Buyer gets tokens
- Verifies token balances changed correctly

### Test 4: Integration
- Creates option series via options protocol
- Shows marketplace can trade those options
- Proves clean separation of concerns

---

## Expected Output

```
🚀 SPL Marketplace Demo

🔧 Setting up demo environment...
✅ Base token created: [8-char address]
✅ Quote token created: [8-char address]
✅ Minted 1000 base tokens to user
✅ Minted 10000 quote tokens to user

📊 TEST 1: Creating Market
Market PDA: [8-char address]
✅ Market created successfully
   Next order ID: 0
    ✓ Demo 1: Creates market for token pair (XXXms)

📝 TEST 2: Placing Sell Order
Initial base balance: 1000.00
Order PDA: [8-char address]
Placing sell order: 100 base @ 10 quote each
✅ Order placed successfully
   Order ID: 0
   Tokens escrowed: 100.00
    ✓ Demo 2: Places sell order (XXXms)

💱 TEST 3: Filling Order (Atomic Swap)
Before fill:
  Base balance: 900.00
  Quote balance: 10000.00

After fill:
  Base balance: 1000.00
  Quote balance: 9000.00

✅ Atomic swap completed!
   Order filled: 100
   💰 Swapped: 100 base tokens
    ✓ Demo 3: Fills order (atomic swap) (XXXms)

🎯 TEST 4: Integration with Options Protocol
Creating option series...
✅ Option series created
   Collateral mint: [8-char address]
   Strike price: 40000

✅ Integration verified!
   Options can now be minted and traded on marketplace
    ✓ Demo 4: Integration with options protocol (XXXms)

============================================================
📊 DEMO SUMMARY
============================================================

Market Statistics:
  Total orders placed: 1
  Next order ID: 1

✅ All demo tests passed!
🎉 SPL Marketplace is working!

  4 passing (Xs)
```

---

## Troubleshooting

### Issue: "anchor: command not found"
**Solution**: Install Anchor (see prerequisites above)

### Issue: "Error: ANCHOR_PROVIDER_URL is not defined"
**Solution**: Use `anchor test` not `npm run test:marketplace` directly

### Issue: "Error: Failed to get recent blockhash"
**Solution**: Make sure local validator is running (anchor test does this automatically)

### Issue: Program compilation errors
**Solution**:
```bash
# Clean and rebuild
anchor clean
anchor build
```

### Issue: Tests timeout
**Solution**: Increase timeout in package.json (already set to 300s)

### Issue: "Account does not exist"
**Solution**: Make sure both programs deployed successfully
```bash
anchor test --skip-build  # Runs tests without rebuilding
```

---

## Running Individual Programs

### Options Protocol Only
```bash
anchor test --skip-build -- --grep "option"
```

### Marketplace Only
```bash
anchor test --skip-build -- --grep "marketplace"
```

---

## Development Workflow

### Make changes to Rust code
```bash
# Edit programs/spl_marketplace/src/*.rs
anchor build
anchor test
```

### Make changes to tests
```bash
# Edit tests/spl_marketplace_demo.ts
# No need to rebuild Rust
anchor test --skip-build
```

### Check program compiles without running tests
```bash
cargo check --manifest-path programs/spl_marketplace/Cargo.toml
```

---

## For Hackathon Demo

### Live Demo Script

1. **Show the code** (~30 seconds)
   ```bash
   # Show marketplace program
   cat programs/spl_marketplace/src/lib.rs | head -40
   ```
   Point out: "Just 4 instructions for a working CLOB"

2. **Run tests live** (~60 seconds)
   ```bash
   anchor test
   ```
   Watch it pass in real-time

3. **Highlight the swap** (~30 seconds)
   - Point to Test 3 output
   - Show: "Before: 900 base → After: 1000 base"
   - Explain: "Atomic swap in single transaction"

4. **Show integration** (~30 seconds)
   - Point to Test 4
   - Explain: "Marketplace works with ANY SPL token"
   - "Here it's trading option tokens"

**Total demo time**: ~2.5 minutes

---

## Key Talking Points

1. **"We built a generic SPL marketplace"**
   - Not hardcoded to options
   - Works with any token pair

2. **"Atomic swaps in a single transaction"**
   - No intermediary needed
   - All or nothing

3. **"Clean separation of concerns"**
   - Options protocol creates tokens
   - Marketplace trades tokens
   - Completely decoupled

4. **"Actually works - not vaporware"**
   - Tests prove it
   - Can run live

---

## File Structure Reference

```
sol_option_protocol/
├── programs/
│   ├── sol_option_protocol/     # Options protocol (unchanged)
│   └── spl_marketplace/          # NEW: Marketplace
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs            # 4 instructions
│           ├── errors.rs         # Error definitions
│           ├── state/
│           │   ├── market.rs     # Market account
│           │   └── order.rs      # Order account
│           └── instructions/
│               ├── create_market.rs
│               ├── place_order.rs
│               ├── cancel_order.rs
│               └── fill_order.rs
├── tests/
│   └── spl_marketplace_demo.ts   # NEW: Demo tests
├── Anchor.toml                   # Updated: Added marketplace
├── package.json                  # Updated: Added test scripts
├── MARKETPLACE_DEMO.md           # Demo guide
└── SETUP.md                      # This file
```

---

## Success Checklist

Before your demo:
- [ ] Anchor installed and working
- [ ] `anchor build` completes successfully
- [ ] `anchor test` passes all 4 tests
- [ ] Understand what Test 3 proves (atomic swap)
- [ ] Can explain architecture (2 separate programs)
- [ ] Know total runtime (~30 seconds)

---

## Support

If you run into issues:

1. Check Anchor version: `anchor --version` (should be 0.32.0)
2. Check Solana version: `solana --version` (should be 1.18+)
3. Try clean build: `anchor clean && anchor build`
4. Check logs in `.anchor/` directory
5. Verify both programs in `/target/deploy/`

---

## Next Steps (Post-Hackathon)

**If judges want to see more**:
- Add partial fill demo
- Show order cancellation
- Add error case tests
- Deploy to devnet live

**For production**:
- Add comprehensive test suite
- Implement price-time priority
- Add maker/taker fees
- Build frontend UI
- Security audit

---

## Questions Judges Might Ask

**Q: How do you prevent double-spending?**
A: Escrow PDAs own the tokens. Only the program can move them via PDA signatures.

**Q: What if the market crashes mid-swap?**
A: Atomicity guarantees - either entire swap succeeds or entire swap fails. No partial state.

**Q: Can users cancel orders?**
A: Yes, `cancel_order` instruction returns escrow. (Not in demo for time)

**Q: How do you handle slippage?**
A: Maker sets price. Taker accepts or rejects. No surprise prices.

**Q: Is this production-ready?**
A: Core mechanics yes. Would add features (partial fills, better matching, fees) for mainnet.

**Q: How long did this take to build?**
A: ~1 day for marketplace, building on existing options protocol.
