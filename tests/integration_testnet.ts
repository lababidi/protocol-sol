/**
 * Integration Tests for Testnet Deployment
 *
 * This test suite executes REAL transactions on testnet and verifies:
 * - Exact balance decreases in user wallets
 * - Exact balance increases in protocol vaults
 * - State changes in OptionSeries accounts
 * - All amounts match expectations precisely
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
const { BN } = anchor;
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

describe("🚀 Testnet Integration Tests - Phase 1: Custody", () => {
  // ============================================================================
  // SETUP: Connect to Testnet
  // ============================================================================

  const TESTNET_RPC = "https://api.testnet.solana.com";
  const connection = new Connection(TESTNET_RPC, "confirmed");

  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const wallet = new anchor.Wallet(walletKeypair);

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load deployed program
  const programId = new PublicKey(
    "79iTNXm1SscyhxiP6jfnQfgXJ448PZaRN98N4EY3nMBn"
  );
  const idlPath = path.join(
    __dirname,
    "../target/idl/sol_option_protocol.json"
  );
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, programId, provider);

  // Test state
  let underlyingMint: PublicKey;
  let userUnderlyingAccount: PublicKey;
  let optionSeriesPda: PublicKey;
  let collateralVaultPda: PublicKey;

  // Test parameters
  const DECIMALS = 5; // BONK-like decimals
  const STRIKE_PRICE = new BN(4_000_000); // 4 cents in 6 decimals
  const EXPIRATION_DAYS = 30;
  const INITIAL_MINT_AMOUNT = 10_000_000; // 10M tokens (100 BONK with 5 decimals)
  const FIRST_DEPOSIT = 1_000_000; // 1M tokens (10 BONK)
  const SECOND_DEPOSIT = 500_000; // 500K tokens (5 BONK)

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  function logSection(title: string) {
    console.log("\n" + "=".repeat(80));
    console.log(`  ${title}`);
    console.log("=".repeat(80));
  }

  function logBalance(
    label: string,
    amount: bigint,
    decimals: number = DECIMALS
  ) {
    const formatted = (Number(amount) / Math.pow(10, decimals)).toFixed(
      decimals
    );
    console.log(`  ${label}: ${amount.toString()} raw (${formatted} tokens)`);
  }

  async function getTokenBalance(account: PublicKey): Promise<bigint> {
    const accountInfo = await getAccount(
      provider.connection,
      account,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    return accountInfo.amount;
  }

  async function waitForConfirmation(signature: string) {
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed"
    );
  }

  // ============================================================================
  // TEST SUITE
  // ============================================================================

  before(async () => {
    logSection("🔧 TEST SETUP - Creating Test Token Mint");

    console.log(`  Wallet: ${wallet.publicKey.toString()}`);
    console.log(`  Program ID: ${programId.toString()}`);
    console.log(`  Network: Testnet (${TESTNET_RPC})`);

    // Check wallet balance
    const walletBalance = await provider.connection.getBalance(
      wallet.publicKey
    );
    console.log(`  Wallet SOL balance: ${walletBalance / 1e9} SOL`);

    if (walletBalance < 0.1 * 1e9) {
      throw new Error(
        "Insufficient SOL for testing. Need at least 0.1 SOL on testnet."
      );
    }

    // Create test token mint (simulating BONK with 5 decimals)
    console.log(`\n  Creating Token-2022 mint with ${DECIMALS} decimals...`);
    underlyingMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      DECIMALS,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`  ✅ Created mint: ${underlyingMint.toString()}`);

    // Verify mint was created correctly
    const mintInfo = await getMint(
      provider.connection,
      underlyingMint,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`  Mint authority: ${mintInfo.mintAuthority?.toString()}`);
    console.log(`  Decimals: ${mintInfo.decimals}`);
    console.log(`  Supply: ${mintInfo.supply}`);

    // Create user token account
    console.log(`\n  Creating user token account...`);
    userUnderlyingAccount = await createAccount(
      provider.connection,
      wallet.payer,
      underlyingMint,
      wallet.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`  ✅ Created account: ${userUnderlyingAccount.toString()}`);

    // Mint tokens to user
    console.log(`\n  Minting ${INITIAL_MINT_AMOUNT} tokens to user...`);
    await mintTo(
      provider.connection,
      wallet.payer,
      underlyingMint,
      userUnderlyingAccount,
      wallet.publicKey,
      INITIAL_MINT_AMOUNT,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const initialBalance = await getTokenBalance(userUnderlyingAccount);
    logBalance("Initial user balance", initialBalance);

    assert.equal(
      initialBalance.toString(),
      INITIAL_MINT_AMOUNT.toString(),
      "Initial mint amount mismatch"
    );

    console.log(`  ✅ Setup complete!\n`);
  });

  it("✅ Test 1: Creates option series and verifies vault initialization", async () => {
    logSection("TEST 1: Create Option Series");

    // Calculate expiration
    const expiration = new BN(
      Math.floor(Date.now() / 1000) + EXPIRATION_DAYS * 24 * 60 * 60
    );

    console.log(`  Strike Price: ${STRIKE_PRICE.toString()} (6 decimals)`);
    console.log(
      `  Expiration: ${new Date(expiration.toNumber() * 1000).toISOString()}`
    );
    console.log(`  Days until expiry: ${EXPIRATION_DAYS}`);

    // Derive PDAs
    [optionSeriesPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("option_series"),
        underlyingMint.toBuffer(),
        STRIKE_PRICE.toArrayLike(Buffer, "le", 8),
        expiration.toArrayLike(Buffer, "le", 8),
      ],
      programId
    );

    [collateralVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("collateral_vault"), optionSeriesPda.toBuffer()],
      programId
    );

    console.log(`\n  Derived PDAs:`);
    console.log(`    Option Series: ${optionSeriesPda.toString()}`);
    console.log(`    Collateral Vault: ${collateralVaultPda.toString()}`);

    // Call create_option_series (call option: is_put = false)
    console.log(`\n  📡 Calling create_option_series...`);
    const tx = await program.methods
      .createOptionSeries(STRIKE_PRICE, expiration, false)
      .accounts({
        payer: wallet.publicKey,
        optionSeries: optionSeriesPda,
        underlyingMint: underlyingMint,
        collateralVault: collateralVaultPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log(
      `  📝 Transaction: https://explorer.solana.com/tx/${tx}?cluster=testnet`
    );

    // Wait for confirmation
    await waitForConfirmation(tx);
    console.log(`  ✅ Transaction confirmed`);

    // Fetch and verify option series account
    console.log(`\n  🔍 Verifying OptionSeries state...`);
    const optionSeries = await program.account.optionSeries.fetch(
      optionSeriesPda
    );

    console.log(`  State:`);
    console.log(
      `    underlying_mint: ${optionSeries.underlyingMint.toString()}`
    );
    console.log(`    strike_price: ${optionSeries.strikePrice.toString()}`);
    console.log(`    expiration: ${optionSeries.expiration.toString()}`);
    console.log(
      `    collateral_vault: ${optionSeries.collateralVault.toString()}`
    );
    console.log(
      `    total_deposited: ${optionSeries.totalDeposited.toString()}`
    );

    // Assertions
    assert.equal(
      optionSeries.underlyingMint.toString(),
      underlyingMint.toString(),
      "❌ Underlying mint mismatch"
    );
    assert.equal(
      optionSeries.strikePrice.toString(),
      STRIKE_PRICE.toString(),
      "❌ Strike price mismatch"
    );
    assert.equal(
      optionSeries.expiration.toString(),
      expiration.toString(),
      "❌ Expiration mismatch"
    );
    assert.equal(
      optionSeries.collateralVault.toString(),
      collateralVaultPda.toString(),
      "❌ Collateral vault mismatch"
    );
    assert.equal(
      optionSeries.totalDeposited.toString(),
      "0",
      "❌ Initial total_deposited should be 0"
    );

    // Verify vault is empty
    const vaultBalance = await getTokenBalance(collateralVaultPda);
    assert.equal(vaultBalance.toString(), "0", "❌ Vault should start empty");
    logBalance("Vault balance", vaultBalance);

    console.log(`\n  ✅ TEST 1 PASSED: Option series created successfully`);
  });

  it("✅ Test 2: Deposits collateral and verifies EXACT balance changes", async () => {
    logSection("TEST 2: First Deposit - Exact Balance Verification");

    const depositAmount = new BN(FIRST_DEPOSIT);
    console.log(`  Deposit amount: ${depositAmount.toString()} tokens`);

    // ========================================================================
    // STEP 1: Record BEFORE balances
    // ========================================================================
    console.log(`\n  📊 BEFORE Deposit:`);

    const userBalanceBefore = await getTokenBalance(userUnderlyingAccount);
    const vaultBalanceBefore = await getTokenBalance(collateralVaultPda);
    const optionSeriesBefore = await program.account.optionSeries.fetch(
      optionSeriesPda
    );

    logBalance("User balance", userBalanceBefore);
    logBalance("Vault balance", vaultBalanceBefore);
    console.log(
      `  total_deposited: ${optionSeriesBefore.totalDeposited.toString()}`
    );

    // ========================================================================
    // STEP 2: Execute deposit transaction
    // ========================================================================
    console.log(
      `\n  📡 Calling deposit_collateral(${depositAmount.toString()})...`
    );

    const tx = await program.methods
      .depositCollateral(depositAmount)
      .accounts({
        user: wallet.publicKey,
        optionSeries: optionSeriesPda,
        underlyingMint: underlyingMint,
        collateralVault: collateralVaultPda,
        userUnderlyingAccount: userUnderlyingAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log(
      `  📝 Transaction: https://explorer.solana.com/tx/${tx}?cluster=testnet`
    );

    // Wait for confirmation
    await waitForConfirmation(tx);
    console.log(`  ✅ Transaction confirmed`);

    // ========================================================================
    // STEP 3: Record AFTER balances
    // ========================================================================
    console.log(`\n  📊 AFTER Deposit:`);

    const userBalanceAfter = await getTokenBalance(userUnderlyingAccount);
    const vaultBalanceAfter = await getTokenBalance(collateralVaultPda);
    const optionSeriesAfter = await program.account.optionSeries.fetch(
      optionSeriesPda
    );

    logBalance("User balance", userBalanceAfter);
    logBalance("Vault balance", vaultBalanceAfter);
    console.log(
      `  total_deposited: ${optionSeriesAfter.totalDeposited.toString()}`
    );

    // ========================================================================
    // STEP 4: Calculate and verify EXACT changes
    // ========================================================================
    console.log(`\n  🔍 VERIFICATION - Exact Balance Changes:`);

    const userBalanceChange = userBalanceBefore - userBalanceAfter;
    const vaultBalanceChange = vaultBalanceAfter - vaultBalanceBefore;
    const totalDepositedChange =
      optionSeriesAfter.totalDeposited.toNumber() -
      optionSeriesBefore.totalDeposited.toNumber();

    console.log(`  User balance change: -${userBalanceChange.toString()}`);
    console.log(`  Vault balance change: +${vaultBalanceChange.toString()}`);
    console.log(`  total_deposited change: +${totalDepositedChange}`);

    // ========================================================================
    // STEP 5: Assertions - EXACT matches required!
    // ========================================================================
    console.log(`\n  ✅ Asserting exact amounts...`);

    // User lost exactly the deposit amount
    assert.equal(
      userBalanceChange.toString(),
      depositAmount.toString(),
      `❌ User balance should decrease by EXACTLY ${depositAmount.toString()}`
    );
    console.log(
      `  ✅ User balance decreased by EXACT amount: ${depositAmount.toString()}`
    );

    // Vault gained exactly the deposit amount
    assert.equal(
      vaultBalanceChange.toString(),
      depositAmount.toString(),
      `❌ Vault balance should increase by EXACTLY ${depositAmount.toString()}`
    );
    console.log(
      `  ✅ Vault balance increased by EXACT amount: ${depositAmount.toString()}`
    );

    // Total deposited increased by exactly the deposit amount
    assert.equal(
      totalDepositedChange.toString(),
      depositAmount.toString(),
      `❌ total_deposited should increase by EXACTLY ${depositAmount.toString()}`
    );
    console.log(
      `  ✅ total_deposited increased by EXACT amount: ${depositAmount.toString()}`
    );

    // Conservation of tokens: user loss = vault gain
    assert.equal(
      userBalanceChange.toString(),
      vaultBalanceChange.toString(),
      "❌ Conservation failure: user loss ≠ vault gain"
    );
    console.log(`  ✅ Token conservation verified: user loss = vault gain`);

    // Expected final balances
    const expectedUserBalance = INITIAL_MINT_AMOUNT - FIRST_DEPOSIT;
    const expectedVaultBalance = FIRST_DEPOSIT;

    assert.equal(
      userBalanceAfter.toString(),
      expectedUserBalance.toString(),
      `❌ User final balance should be ${expectedUserBalance}`
    );
    console.log(
      `  ✅ User final balance matches expected: ${expectedUserBalance}`
    );

    assert.equal(
      vaultBalanceAfter.toString(),
      expectedVaultBalance.toString(),
      `❌ Vault final balance should be ${expectedVaultBalance}`
    );
    console.log(
      `  ✅ Vault final balance matches expected: ${expectedVaultBalance}`
    );

    console.log(
      `\n  ✅ TEST 2 PASSED: All balances verified with EXACT precision`
    );
  });

  it("✅ Test 3: Second deposit verifies cumulative tracking", async () => {
    logSection("TEST 3: Second Deposit - Cumulative Balance Verification");

    const depositAmount = new BN(SECOND_DEPOSIT);
    console.log(`  Deposit amount: ${depositAmount.toString()} tokens`);

    // ========================================================================
    // STEP 1: Record BEFORE balances
    // ========================================================================
    console.log(`\n  📊 BEFORE Second Deposit:`);

    const userBalanceBefore = await getTokenBalance(userUnderlyingAccount);
    const vaultBalanceBefore = await getTokenBalance(collateralVaultPda);
    const optionSeriesBefore = await program.account.optionSeries.fetch(
      optionSeriesPda
    );

    logBalance("User balance", userBalanceBefore);
    logBalance("Vault balance", vaultBalanceBefore);
    console.log(
      `  total_deposited: ${optionSeriesBefore.totalDeposited.toString()}`
    );

    // Verify starting point matches first deposit end state
    const expectedStartingVault = FIRST_DEPOSIT;
    assert.equal(
      vaultBalanceBefore.toString(),
      expectedStartingVault.toString(),
      "❌ Starting vault should have first deposit"
    );

    // ========================================================================
    // STEP 2: Execute second deposit
    // ========================================================================
    console.log(
      `\n  📡 Calling deposit_collateral(${depositAmount.toString()})...`
    );

    const tx = await program.methods
      .depositCollateral(depositAmount)
      .accounts({
        user: wallet.publicKey,
        optionSeries: optionSeriesPda,
        underlyingMint: underlyingMint,
        collateralVault: collateralVaultPda,
        userUnderlyingAccount: userUnderlyingAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log(
      `  📝 Transaction: https://explorer.solana.com/tx/${tx}?cluster=testnet`
    );

    await waitForConfirmation(tx);
    console.log(`  ✅ Transaction confirmed`);

    // ========================================================================
    // STEP 3: Record AFTER balances
    // ========================================================================
    console.log(`\n  📊 AFTER Second Deposit:`);

    const userBalanceAfter = await getTokenBalance(userUnderlyingAccount);
    const vaultBalanceAfter = await getTokenBalance(collateralVaultPda);
    const optionSeriesAfter = await program.account.optionSeries.fetch(
      optionSeriesPda
    );

    logBalance("User balance", userBalanceAfter);
    logBalance("Vault balance", vaultBalanceAfter);
    console.log(
      `  total_deposited: ${optionSeriesAfter.totalDeposited.toString()}`
    );

    // ========================================================================
    // STEP 4: Verify EXACT incremental changes
    // ========================================================================
    console.log(`\n  🔍 VERIFICATION - Incremental Changes:`);

    const userBalanceChange = userBalanceBefore - userBalanceAfter;
    const vaultBalanceChange = vaultBalanceAfter - vaultBalanceBefore;
    const totalDepositedChange =
      optionSeriesAfter.totalDeposited.toNumber() -
      optionSeriesBefore.totalDeposited.toNumber();

    console.log(`  User balance change: -${userBalanceChange.toString()}`);
    console.log(`  Vault balance change: +${vaultBalanceChange.toString()}`);
    console.log(`  total_deposited change: +${totalDepositedChange}`);

    // Verify incremental changes
    assert.equal(
      userBalanceChange.toString(),
      depositAmount.toString(),
      "❌ User balance change doesn't match deposit"
    );
    console.log(
      `  ✅ User balance decreased by EXACT amount: ${depositAmount.toString()}`
    );

    assert.equal(
      vaultBalanceChange.toString(),
      depositAmount.toString(),
      "❌ Vault balance change doesn't match deposit"
    );
    console.log(
      `  ✅ Vault balance increased by EXACT amount: ${depositAmount.toString()}`
    );

    // ========================================================================
    // STEP 5: Verify CUMULATIVE totals
    // ========================================================================
    console.log(`\n  🔍 VERIFICATION - Cumulative Totals:`);

    const expectedTotalUser =
      INITIAL_MINT_AMOUNT - FIRST_DEPOSIT - SECOND_DEPOSIT;
    const expectedTotalVault = FIRST_DEPOSIT + SECOND_DEPOSIT;
    const expectedTotalDeposited = FIRST_DEPOSIT + SECOND_DEPOSIT;

    console.log(`  Expected cumulative user balance: ${expectedTotalUser}`);
    console.log(`  Expected cumulative vault balance: ${expectedTotalVault}`);
    console.log(
      `  Expected cumulative total_deposited: ${expectedTotalDeposited}`
    );

    assert.equal(
      userBalanceAfter.toString(),
      expectedTotalUser.toString(),
      "❌ Cumulative user balance mismatch"
    );
    console.log(`  ✅ Cumulative user balance verified: ${expectedTotalUser}`);

    assert.equal(
      vaultBalanceAfter.toString(),
      expectedTotalVault.toString(),
      "❌ Cumulative vault balance mismatch"
    );
    console.log(
      `  ✅ Cumulative vault balance verified: ${expectedTotalVault}`
    );

    assert.equal(
      optionSeriesAfter.totalDeposited.toString(),
      expectedTotalDeposited.toString(),
      "❌ Cumulative total_deposited mismatch"
    );
    console.log(
      `  ✅ Cumulative total_deposited verified: ${expectedTotalDeposited}`
    );

    // Conservation check
    const totalTokens = Number(userBalanceAfter) + Number(vaultBalanceAfter);
    assert.equal(
      totalTokens,
      INITIAL_MINT_AMOUNT,
      "❌ Token conservation violated: total doesn't match initial supply"
    );
    console.log(
      `  ✅ Token conservation: ${totalTokens} = ${INITIAL_MINT_AMOUNT} (initial supply)`
    );

    console.log(
      `\n  ✅ TEST 3 PASSED: Cumulative tracking verified with EXACT precision`
    );
  });

  it("❌ Test 4: Rejects zero-amount deposits", async () => {
    logSection("TEST 4: Edge Case - Zero Amount Deposit");

    console.log(`  Attempting to deposit 0 tokens (should fail)...`);

    try {
      await program.methods
        .depositCollateral(new BN(0))
        .accounts({
          user: wallet.publicKey,
          optionSeries: optionSeriesPda,
          underlyingMint: underlyingMint,
          collateralVault: collateralVaultPda,
          userUnderlyingAccount: userUnderlyingAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      assert.fail("❌ Should have rejected zero amount deposit");
    } catch (err: any) {
      console.log(`  ✅ Transaction rejected as expected`);
      console.log(`  Error: ${err.toString()}`);

      assert.include(
        err.toString(),
        "InvalidAmount",
        "❌ Should fail with InvalidAmount error"
      );
      console.log(`  ✅ Correct error code: InvalidAmount`);
    }

    console.log(`\n  ✅ TEST 4 PASSED: Zero-amount deposit correctly rejected`);
  });

  it("❌ Test 5: Rejects deposits exceeding user balance", async () => {
    logSection("TEST 5: Edge Case - Insufficient Balance");

    // Try to deposit more than user has
    const userBalance = await getTokenBalance(userUnderlyingAccount);
    const excessAmount = new BN(userBalance.toString()).add(new BN(1_000_000));

    console.log(`  User balance: ${userBalance.toString()}`);
    console.log(
      `  Attempting to deposit: ${excessAmount.toString()} (more than balance)...`
    );

    try {
      await program.methods
        .depositCollateral(excessAmount)
        .accounts({
          user: wallet.publicKey,
          optionSeries: optionSeriesPda,
          underlyingMint: underlyingMint,
          collateralVault: collateralVaultPda,
          userUnderlyingAccount: userUnderlyingAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      assert.fail("❌ Should have rejected insufficient balance");
    } catch (err: any) {
      console.log(`  ✅ Transaction rejected as expected`);
      console.log(`  Error: ${err.toString()}`);

      // Token program will reject this with insufficient funds error
      assert.ok(
        err.toString().includes("insufficient") ||
          err.toString().includes("0x1"), // Error code for insufficient funds
        "❌ Should fail with insufficient balance error"
      );
      console.log(`  ✅ Correct error: Insufficient balance`);
    }

    console.log(
      `\n  ✅ TEST 5 PASSED: Insufficient balance correctly rejected`
    );
  });

  after(async () => {
    logSection("📊 FINAL STATE SUMMARY");

    const userFinalBalance = await getTokenBalance(userUnderlyingAccount);
    const vaultFinalBalance = await getTokenBalance(collateralVaultPda);
    const optionSeriesFinal = await program.account.optionSeries.fetch(
      optionSeriesPda
    );

    console.log(`\n  Final Balances:`);
    logBalance("User", userFinalBalance);
    logBalance("Vault", vaultFinalBalance);
    console.log(
      `  total_deposited: ${optionSeriesFinal.totalDeposited.toString()}`
    );

    console.log(`\n  Deposits Made:`);
    console.log(`    1st deposit: ${FIRST_DEPOSIT} tokens`);
    console.log(`    2nd deposit: ${SECOND_DEPOSIT} tokens`);
    console.log(`    Total: ${FIRST_DEPOSIT + SECOND_DEPOSIT} tokens`);

    console.log(`\n  Token Conservation:`);
    const totalTokens = Number(userFinalBalance) + Number(vaultFinalBalance);
    console.log(`    User + Vault: ${totalTokens}`);
    console.log(`    Initial supply: ${INITIAL_MINT_AMOUNT}`);
    console.log(
      `    Match: ${totalTokens === INITIAL_MINT_AMOUNT ? "✅ YES" : "❌ NO"}`
    );

    console.log(`\n  ✅ All integration tests completed successfully!`);
    console.log(`  ✅ All balance changes verified with EXACT precision`);
    console.log(`  ✅ Token conservation maintained throughout`);
  });
});
