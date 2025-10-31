/**
 * Phase 3 Testnet Integration Tests - Exercise Mechanism
 *
 * Tests the exercise functionality:
 * - Create option series (Phase 2)
 * - Mint options (Phase 2)
 * - Exercise options (Phase 3 NEW!)
 * - Verify dual vault updates (collateral & cash)
 * - Verify exact balance tracking
 */

import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
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
import { Connection } from "@solana/web3.js";
import BN from "bn.js";

describe("🚀 Phase 3 Testnet Integration - Exercise Mechanism", () => {
  const TESTNET_RPC = "https://api.testnet.solana.com";
  const connection = new Connection(TESTNET_RPC, "confirmed");

  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const programId = new PublicKey(
    "7a3MatFT2m6iHtZ3vYBoLRP4A1YBuophqGqoCz4p4JoP"
  );

  // Test state
  let underlyingMint: PublicKey; // BONK-like token
  let strikeCurrencyMint: PublicKey; // USDC-like token
  let writerUnderlyingAccount: PublicKey; // Option writer's BONK account
  let writerStrikeAccount: PublicKey; // Option writer's USDC account
  let buyerUnderlyingAccount: PublicKey; // Option buyer's BONK account
  let buyerStrikeAccount: PublicKey; // Option buyer's USDC account
  let optionSeriesPda: PublicKey;
  let optionMintPda: PublicKey;
  let redemptionMintPda: PublicKey;
  let collateralVaultPda: PublicKey;
  let cashVaultPda: PublicKey;
  let writerOptionAccount: PublicKey;
  let writerRedemptionAccount: PublicKey;
  let buyerOptionAccount: PublicKey;

  const UNDERLYING_DECIMALS = 5; // BONK has 5 decimals
  const STRIKE_DECIMALS = 6; // USDC has 6 decimals
  const STRIKE_PRICE = 4_000_000; // $0.04 in 6 decimals
  const EXPIRATION_DAYS = 30;
  const INITIAL_WRITER_AMOUNT = 10_000_000; // 100 BONK
  const MINT_AMOUNT = 5_000_000; // Writer mints 50 options (50 BONK collateral)
  const BUYER_USDC_AMOUNT = 1_000_000_000; // Buyer has $1000 USDC
  const EXERCISE_AMOUNT = 2_000_000; // Buyer exercises 20 options (20 BONK worth)

  function logSection(title: string) {
    console.log("\n" + "=".repeat(80));
    console.log(`  ${title}`);
    console.log("=".repeat(80));
  }

  function logBalance(label: string, amount: bigint, decimals: number) {
    const formatted = (Number(amount) / Math.pow(10, decimals)).toFixed(
      decimals
    );
    console.log(`  ${label}: ${amount.toString()} raw (${formatted} tokens)`);
  }

  async function getTokenBalance(account: PublicKey): Promise<bigint> {
    const accountInfo = await getAccount(
      connection,
      account,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    return accountInfo.amount;
  }

  async function getOptionSeriesData(address: PublicKey) {
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) throw new Error("Account not found");

    const data = accountInfo.data;
    let offset = 8; // Skip discriminator

    const underlyingMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const strikePrice = Number(data.readBigUInt64LE(offset));
    offset += 8;

    const strikeCurrency = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const expiration = Number(data.readBigInt64LE(offset));
    offset += 8;

    const isPut = data.readUInt8(offset) === 1;
    offset += 1;

    const totalConsiderationWithdrawn = Number(data.readBigUInt64LE(offset));
    offset += 8;

    const optionMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const redemptionMint = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const collateralVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const cashVault = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const totalSupply = Number(data.readBigUInt64LE(offset));
    offset += 8;

    const exercisedAmount = Number(data.readBigUInt64LE(offset));
    offset += 8;

    return {
      underlyingMint,
      strikePrice,
      strikeCurrency,
      expiration,
      isPut,
      totalConsiderationWithdrawn,
      optionMint,
      redemptionMint,
      collateralVault,
      cashVault,
      totalSupply,
      exercisedAmount,
    };
  }

  before(async () => {
    logSection("🔧 TEST SETUP");

    console.log(`  Wallet: ${walletKeypair.publicKey.toString()}`);
    console.log(`  Program: ${programId.toString()}`);
    console.log(`  Network: Testnet`);

    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log(`  SOL Balance: ${balance / 1e9} SOL`);

    if (balance < 1 * 1e9) {
      throw new Error("Need at least 1 SOL for Phase 3 testing");
    }

    // Create underlying mint (BONK-like token)
    console.log(`\n  Creating Token-2022 underlying mint (BONK-like)...`);
    underlyingMint = await createMint(
      connection,
      walletKeypair,
      walletKeypair.publicKey,
      null,
      UNDERLYING_DECIMALS,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`  ✅ Underlying mint: ${underlyingMint.toString()}`);

    // Create strike currency mint (USDC-like token)
    console.log(`  Creating Token-2022 strike currency mint (USDC-like)...`);
    strikeCurrencyMint = await createMint(
      connection,
      walletKeypair,
      walletKeypair.publicKey,
      null,
      STRIKE_DECIMALS,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`  ✅ Strike currency mint: ${strikeCurrencyMint.toString()}`);

    // Create writer's accounts
    writerUnderlyingAccount = await createAccount(
      connection,
      walletKeypair,
      underlyingMint,
      walletKeypair.publicKey,
      Keypair.generate(), // Use a new keypair for the account
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    writerStrikeAccount = await createAccount(
      connection,
      walletKeypair,
      strikeCurrencyMint,
      walletKeypair.publicKey,
      Keypair.generate(), // Use a new keypair for the account
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Create buyer's accounts
    buyerUnderlyingAccount = await createAccount(
      connection,
      walletKeypair,
      underlyingMint,
      walletKeypair.publicKey,
      Keypair.generate(), // Use a new keypair for the account
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    buyerStrikeAccount = await createAccount(
      connection,
      walletKeypair,
      strikeCurrencyMint,
      walletKeypair.publicKey,
      Keypair.generate(), // Use a new keypair for the account
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Mint underlying tokens to writer
    await mintTo(
      connection,
      walletKeypair,
      underlyingMint,
      writerUnderlyingAccount,
      walletKeypair.publicKey,
      INITIAL_WRITER_AMOUNT,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Mint USDC to buyer
    await mintTo(
      connection,
      walletKeypair,
      strikeCurrencyMint,
      buyerStrikeAccount,
      walletKeypair.publicKey,
      BUYER_USDC_AMOUNT,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const writerBalance = await getTokenBalance(writerUnderlyingAccount);
    const buyerUsdcBalance = await getTokenBalance(buyerStrikeAccount);

    console.log(`\n  Writer's initial BONK: ${writerBalance}`);
    console.log(`  Buyer's initial USDC: ${buyerUsdcBalance}`);
  });

  it("✅ Test 1: Setup - Create series & mint options", async () => {
    logSection("TEST 1: Create Option Series & Mint");

    const expiration =
      Math.floor(Date.now() / 1000) + EXPIRATION_DAYS * 24 * 60 * 60;
    const strikePriceBN = new BN(STRIKE_PRICE);
    const expirationBN = new BN(expiration);

    // Derive PDAs
    [optionSeriesPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("option_series"),
        underlyingMint.toBuffer(),
        strikePriceBN.toArrayLike(Buffer, "le", 8),
        expirationBN.toArrayLike(Buffer, "le", 8),
      ],
      programId
    );

    [optionMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("option_mint"), optionSeriesPda.toBuffer()],
      programId
    );

    [redemptionMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("redemption_mint"), optionSeriesPda.toBuffer()],
      programId
    );

    [collateralVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("collateral_vault"), optionSeriesPda.toBuffer()],
      programId
    );

    [cashVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("cash_vault"), optionSeriesPda.toBuffer()],
      programId
    );

    console.log(`  Creating option series...`);

    // Create option series
    const createSeriesDiscriminator = Buffer.from([
      0x12, 0xe1, 0x20, 0x0b, 0x1e, 0xb0, 0xa1, 0xdd,
    ]);
    const strikePriceBytes = strikePriceBN.toArrayLike(Buffer, "le", 8);
    const expirationBytes = expirationBN.toArrayLike(Buffer, "le", 8);
    const createSeriesData = Buffer.concat([
      createSeriesDiscriminator,
      strikePriceBytes,
      expirationBytes,
    ]);

    const createSeriesInstruction = new TransactionInstruction({
      keys: [
        { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: optionSeriesPda, isSigner: false, isWritable: true },
        { pubkey: underlyingMint, isSigner: false, isWritable: false },
        { pubkey: strikeCurrencyMint, isSigner: false, isWritable: false },
        { pubkey: optionMintPda, isSigner: false, isWritable: true },
        { pubkey: redemptionMintPda, isSigner: false, isWritable: true },
        { pubkey: collateralVaultPda, isSigner: false, isWritable: true },
        { pubkey: cashVaultPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: createSeriesData,
    });

    const createSeriesTx = new Transaction().add(createSeriesInstruction);
    const createSeriesSig = await connection.sendTransaction(createSeriesTx, [
      walletKeypair,
    ]);
    await connection.confirmTransaction(createSeriesSig, "confirmed");
    console.log(`  ✅ Created option series`);

    // Create writer's option & redemption token accounts
    writerOptionAccount = await createAccount(
      connection,
      walletKeypair,
      optionMintPda,
      walletKeypair.publicKey,
      Keypair.generate(),
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    writerRedemptionAccount = await createAccount(
      connection,
      walletKeypair,
      redemptionMintPda,
      walletKeypair.publicKey,
      Keypair.generate(),
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Mint options (writer deposits collateral)
    console.log(`\n  Writer minting ${MINT_AMOUNT} options...`);
    const mintOptionsDiscriminator = Buffer.from([
      0x30, 0x7b, 0xc5, 0x3b, 0xa0, 0xc7, 0x4b, 0x96,
    ]);
    const mintAmountBN = new BN(MINT_AMOUNT);
    const mintAmountBytes = mintAmountBN.toArrayLike(Buffer, "le", 8);
    const mintOptionsData = Buffer.concat([
      mintOptionsDiscriminator,
      mintAmountBytes,
    ]);

    const mintOptionsInstruction = new TransactionInstruction({
      keys: [
        { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: optionSeriesPda, isSigner: false, isWritable: true },
        { pubkey: underlyingMint, isSigner: false, isWritable: false },
        { pubkey: optionMintPda, isSigner: false, isWritable: true },
        { pubkey: redemptionMintPda, isSigner: false, isWritable: true },
        { pubkey: collateralVaultPda, isSigner: false, isWritable: true },
        { pubkey: writerUnderlyingAccount, isSigner: false, isWritable: true },
        { pubkey: writerOptionAccount, isSigner: false, isWritable: true },
        { pubkey: writerRedemptionAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: mintOptionsData,
    });

    const mintOptionsTx = new Transaction().add(mintOptionsInstruction);
    const mintOptionsSig = await connection.sendTransaction(mintOptionsTx, [
      walletKeypair,
    ]);
    await connection.confirmTransaction(mintOptionsSig, "confirmed");
    console.log(`  ✅ Writer minted options`);

    const seriesData = await getOptionSeriesData(optionSeriesPda);
    assert.equal(
      seriesData.totalSupply,
      MINT_AMOUNT,
      "Total supply should match mint amount"
    );
    assert.equal(seriesData.exercisedAmount, 0, "Exercised amount should be 0");

    console.log(`\n  ✅ TEST 1 PASSED`);
  });

  it("✅ Test 2: Transfer option tokens (simulate DEX trade)", async () => {
    logSection("TEST 2: Transfer Option Tokens to Buyer");

    // Create buyer's option token account
    buyerOptionAccount = await createAccount(
      connection,
      walletKeypair,
      optionMintPda,
      walletKeypair.publicKey,
      Keypair.generate(),
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Transfer some option tokens from writer to buyer (simulates DEX purchase)
    const {
      Transfer,
      getAssociatedTokenAddressSync,
      createTransferCheckedInstruction,
    } = await import("@solana/spl-token");

    const transferSig = await connection.sendTransaction(
      new Transaction().add(
        createTransferCheckedInstruction(
          writerOptionAccount,
          optionMintPda,
          buyerOptionAccount,
          walletKeypair.publicKey,
          EXERCISE_AMOUNT,
          UNDERLYING_DECIMALS,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ),
      [walletKeypair]
    );

    await connection.confirmTransaction(transferSig, "confirmed");
    console.log(`  ✅ Transfer confirmed: ${transferSig}`);

    const buyerOptionBalance = await getTokenBalance(buyerOptionAccount);
    assert.equal(
      buyerOptionBalance.toString(),
      EXERCISE_AMOUNT.toString(),
      "Buyer should have option tokens"
    );

    console.log(
      `  ✅ Buyer received ${EXERCISE_AMOUNT} option tokens (simulated DEX purchase)`
    );
    console.log(`\n  ✅ TEST 2 PASSED`);
  });

  it("✅ Test 3: Exercise options - verify dual vault updates", async () => {
    logSection("TEST 3: Exercise Options");

    // Calculate expected strike payment
    const expectedStrikePayment =
      (EXERCISE_AMOUNT * STRIKE_PRICE) / Math.pow(10, UNDERLYING_DECIMALS);
    console.log(
      `  Expected strike payment: ${expectedStrikePayment} raw USDC ($${(
        expectedStrikePayment / 1e6
      ).toFixed(2)})`
    );

    // BEFORE balances
    console.log(`\n  📊 BEFORE Exercise:`);
    const buyerBonkBefore = await getTokenBalance(buyerUnderlyingAccount);
    const buyerUsdcBefore = await getTokenBalance(buyerStrikeAccount);
    const buyerOptionsBefore = await getTokenBalance(buyerOptionAccount);
    const collateralVaultBefore = await getTokenBalance(collateralVaultPda);
    const cashVaultBefore = await getTokenBalance(cashVaultPda);
    const seriesBefore = await getOptionSeriesData(optionSeriesPda);

    logBalance("  Buyer BONK", buyerBonkBefore, UNDERLYING_DECIMALS);
    logBalance("  Buyer USDC", buyerUsdcBefore, STRIKE_DECIMALS);
    logBalance(
      "  Buyer option tokens",
      buyerOptionsBefore,
      UNDERLYING_DECIMALS
    );
    logBalance(
      "  Collateral vault",
      collateralVaultBefore,
      UNDERLYING_DECIMALS
    );
    logBalance("  Cash vault", cashVaultBefore, STRIKE_DECIMALS);
    console.log(`  exercised_amount: ${seriesBefore.exercisedAmount}`);

    // Exercise options
    console.log(`\n  📡 Exercising ${EXERCISE_AMOUNT} options...`);
    const exerciseDiscriminator = Buffer.from([
      0xe7, 0x62, 0x83, 0xb7, 0xf5, 0x5d, 0x7a, 0x30,
    ]);
    const exerciseAmountBN = new BN(EXERCISE_AMOUNT);
    const exerciseAmountBytes = exerciseAmountBN.toArrayLike(Buffer, "le", 8);
    const exerciseData = Buffer.concat([
      exerciseDiscriminator,
      exerciseAmountBytes,
    ]);

    const exerciseInstruction = new TransactionInstruction({
      keys: [
        { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: optionSeriesPda, isSigner: false, isWritable: true },
        { pubkey: underlyingMint, isSigner: false, isWritable: false },
        { pubkey: strikeCurrencyMint, isSigner: false, isWritable: false },
        { pubkey: optionMintPda, isSigner: false, isWritable: true },
        { pubkey: collateralVaultPda, isSigner: false, isWritable: true },
        { pubkey: cashVaultPda, isSigner: false, isWritable: true },
        { pubkey: buyerOptionAccount, isSigner: false, isWritable: true },
        { pubkey: buyerStrikeAccount, isSigner: false, isWritable: true },
        { pubkey: buyerUnderlyingAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: exerciseData,
    });

    const exerciseTx = new Transaction().add(exerciseInstruction);
    const exerciseSig = await connection.sendTransaction(exerciseTx, [
      walletKeypair,
    ]);
    console.log(
      `  📝 Tx: https://explorer.solana.com/tx/${exerciseSig}?cluster=testnet`
    );
    await connection.confirmTransaction(exerciseSig, "confirmed");
    console.log(`  ✅ Confirmed`);

    // AFTER balances
    console.log(`\n  📊 AFTER Exercise:`);
    const buyerBonkAfter = await getTokenBalance(buyerUnderlyingAccount);
    const buyerUsdcAfter = await getTokenBalance(buyerStrikeAccount);
    const buyerOptionsAfter = await getTokenBalance(buyerOptionAccount);
    const collateralVaultAfter = await getTokenBalance(collateralVaultPda);
    const cashVaultAfter = await getTokenBalance(cashVaultPda);
    const seriesAfter = await getOptionSeriesData(optionSeriesPda);

    logBalance("  Buyer BONK", buyerBonkAfter, UNDERLYING_DECIMALS);
    logBalance("  Buyer USDC", buyerUsdcAfter, STRIKE_DECIMALS);
    logBalance("  Buyer option tokens", buyerOptionsAfter, UNDERLYING_DECIMALS);
    logBalance("  Collateral vault", collateralVaultAfter, UNDERLYING_DECIMALS);
    logBalance("  Cash vault", cashVaultAfter, STRIKE_DECIMALS);
    console.log(`  exercised_amount: ${seriesAfter.exercisedAmount}`);

    // VERIFY EXACT CHANGES
    console.log(`\n  🔍 VERIFICATION:`);
    const bonkChange = buyerBonkAfter - buyerBonkBefore;
    const usdcChange = buyerUsdcBefore - buyerUsdcAfter;
    const optionsChange = buyerOptionsBefore - buyerOptionsAfter;
    const vaultCollateralChange = collateralVaultBefore - collateralVaultAfter;
    const vaultCashChange = cashVaultAfter - cashVaultBefore;

    console.log(`  Buyer BONK change: +${bonkChange}`);
    console.log(`  Buyer USDC change: -${usdcChange}`);
    console.log(`  Buyer options burned: ${optionsChange}`);
    console.log(`  Collateral vault paid out: ${vaultCollateralChange}`);
    console.log(`  Cash vault received: ${vaultCashChange}`);

    // Assertions
    assert.equal(
      bonkChange.toString(),
      EXERCISE_AMOUNT.toString(),
      "Buyer should receive exact BONK amount"
    );
    console.log(`  ✅ Buyer received EXACT BONK (${EXERCISE_AMOUNT})`);

    assert.equal(
      usdcChange.toString(),
      expectedStrikePayment.toString(),
      "Buyer should pay exact strike amount"
    );
    console.log(`  ✅ Buyer paid EXACT strike (${expectedStrikePayment} USDC)`);

    assert.equal(
      optionsChange.toString(),
      EXERCISE_AMOUNT.toString(),
      "Option tokens should be burned"
    );
    console.log(`  ✅ Option tokens BURNED (${EXERCISE_AMOUNT})`);

    assert.equal(
      vaultCollateralChange.toString(),
      EXERCISE_AMOUNT.toString(),
      "Collateral vault should pay out exact amount"
    );
    console.log(
      `  ✅ Collateral vault paid out EXACT amount (${EXERCISE_AMOUNT})`
    );

    assert.equal(
      vaultCashChange.toString(),
      expectedStrikePayment.toString(),
      "Cash vault should receive exact strike payment"
    );
    console.log(
      `  ✅ Cash vault received EXACT strike (${expectedStrikePayment})`
    );

    assert.equal(
      seriesAfter.exercisedAmount,
      EXERCISE_AMOUNT,
      "exercised_amount should be updated"
    );
    console.log(
      `  ✅ exercised_amount updated correctly (${seriesAfter.exercisedAmount})`
    );

    assert.equal(
      seriesAfter.totalSupply,
      seriesBefore.totalSupply,
      "total_supply should remain unchanged"
    );
    console.log(`  ✅ total_supply unchanged (${seriesAfter.totalSupply})`);

    // Token conservation
    assert.equal(
      bonkChange.toString(),
      vaultCollateralChange.toString(),
      "BONK conservation: buyer gain = vault loss"
    );
    console.log(`  ✅ BONK conservation verified`);

    assert.equal(
      usdcChange.toString(),
      vaultCashChange.toString(),
      "USDC conservation: buyer loss = vault gain"
    );
    console.log(`  ✅ USDC conservation verified`);

    console.log(`\n  ✅ TEST 3 PASSED: Exercise mechanism works perfectly!`);
  });

  after(async () => {
    logSection("📊 FINAL SUMMARY");

    const writerBonk = await getTokenBalance(writerUnderlyingAccount);
    const buyerBonk = await getTokenBalance(buyerUnderlyingAccount);
    const buyerUsdc = await getTokenBalance(buyerStrikeAccount);
    const collateralVault = await getTokenBalance(collateralVaultPda);
    const cashVault = await getTokenBalance(cashVaultPda);
    const writerOptions = await getTokenBalance(writerOptionAccount);
    const writerRedemptions = await getTokenBalance(writerRedemptionAccount);
    const series = await getOptionSeriesData(optionSeriesPda);

    console.log(`\n  Final State:`);
    logBalance("  Writer BONK", writerBonk, UNDERLYING_DECIMALS);
    logBalance("  Writer option tokens", writerOptions, UNDERLYING_DECIMALS);
    logBalance(
      "  Writer redemption tokens",
      writerRedemptions,
      UNDERLYING_DECIMALS
    );
    logBalance("  Buyer BONK", buyerBonk, UNDERLYING_DECIMALS);
    logBalance("  Buyer USDC", buyerUsdc, STRIKE_DECIMALS);
    logBalance("  Collateral vault", collateralVault, UNDERLYING_DECIMALS);
    logBalance("  Cash vault", cashVault, STRIKE_DECIMALS);
    console.log(`  total_supply: ${series.totalSupply}`);
    console.log(`  exercised_amount: ${series.exercisedAmount}`);

    console.log(`\n  ✅ Phase 3 tests passed with EXACT verification!`);
    console.log(`  ✅ Exercise mechanism working correctly!`);
    console.log(`  ✅ Dual vault updates verified (collateral + cash)!`);
  });
});
