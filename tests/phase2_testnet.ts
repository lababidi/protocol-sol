/**
 * Phase 2 Testnet Integration Tests - Dual-Token Minting
 *
 * Tests the complete dual-token model:
 * - Create option series with all 5 accounts
 * - Mint option + redemption tokens
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

describe("🚀 Phase 2 Testnet Integration - Dual-Token Minting", () => {
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
  let underlyingMint: PublicKey;
  let strikeCurrencyMint: PublicKey; // Will use same mint as strike currency for simplicity
  let userUnderlyingAccount: PublicKey;
  let userStrikeCurrencyAccount: PublicKey;
  let optionSeriesPda: PublicKey;
  let optionMintPda: PublicKey;
  let redemptionMintPda: PublicKey;
  let collateralVaultPda: PublicKey;
  let cashVaultPda: PublicKey;
  let userOptionAccount: PublicKey;
  let userRedemptionAccount: PublicKey;

  const DECIMALS = 5;
  const STRIKE_PRICE = 4_000_000; // 4 cents in 6 decimals (we'll pretend our token has 6 decimals)
  const EXPIRATION_DAYS = 30;
  const INITIAL_MINT_AMOUNT = 10_000_000;
  const FIRST_MINT = 1_000_000;
  const SECOND_MINT = 500_000;

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

    const underlyingMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const strikePrice = Number(data.readBigUInt64LE(offset));
    offset += 8;

    const strikeCurrency = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const expiration = Number(data.readBigInt64LE(offset));
    offset += 8;

    const isPut = data.readUInt8(offset) === 1;
    offset += 1;

    const totalConsiderationWithdrawn = Number(data.readBigUInt64LE(offset));
    offset += 8;

    const optionMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const redemptionMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const collateralVault = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const cashVault = new PublicKey(data.slice(offset, offset + 32));
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

    if (balance < 0.5 * 1e9) {
      throw new Error(
        "Need at least 0.5 SOL for testing (more accounts to create)"
      );
    }

    // Create underlying mint (e.g., BONK)
    console.log(`\n  Creating Token-2022 underlying mint...`);
    underlyingMint = await createMint(
      connection,
      walletKeypair,
      walletKeypair.publicKey,
      null,
      DECIMALS,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`  ✅ Underlying mint: ${underlyingMint.toString()}`);

    // Use same mint as strike currency for simplicity
    strikeCurrencyMint = underlyingMint;
    console.log(`  ✅ Strike currency mint: ${strikeCurrencyMint.toString()}`);

    // Create user underlying account
    userUnderlyingAccount = await createAccount(
      connection,
      walletKeypair,
      underlyingMint,
      walletKeypair.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(
      `  ✅ User underlying account: ${userUnderlyingAccount.toString()}`
    );

    // Mint initial tokens
    await mintTo(
      connection,
      walletKeypair,
      underlyingMint,
      userUnderlyingAccount,
      walletKeypair.publicKey,
      INITIAL_MINT_AMOUNT,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const initialBalance = await getTokenBalance(userUnderlyingAccount);
    logBalance("Initial underlying balance", initialBalance);
  });

  it("✅ Test 1: Create option series with all accounts", async () => {
    logSection("TEST 1: Create Option Series");

    const expiration =
      Math.floor(Date.now() / 1000) + EXPIRATION_DAYS * 24 * 60 * 60;
    const strikePriceBN = new BN(STRIKE_PRICE);
    const expirationBN = new BN(expiration);

    // Derive all PDAs
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

    console.log(`  Option Series: ${optionSeriesPda.toString()}`);
    console.log(`  Option Mint: ${optionMintPda.toString()}`);
    console.log(`  Redemption Mint: ${redemptionMintPda.toString()}`);
    console.log(`  Collateral Vault: ${collateralVaultPda.toString()}`);
    console.log(`  Cash Vault: ${cashVaultPda.toString()}`);

    // Build instruction data (sha256("global:create_option_series")[0..8])
    const discriminator = Buffer.from([
      0x12, 0xe1, 0x20, 0x0b, 0x1e, 0xb0, 0xa1, 0xdd,
    ]);
    const strikePriceBytes = strikePriceBN.toArrayLike(Buffer, "le", 8);
    const expirationBytes = expirationBN.toArrayLike(Buffer, "le", 8);
    const instructionData = Buffer.concat([
      discriminator,
      strikePriceBytes,
      expirationBytes,
    ]);

    const instruction = new TransactionInstruction({
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
      data: instructionData,
    });

    const tx = new Transaction().add(instruction);
    const sig = await connection.sendTransaction(tx, [walletKeypair]);

    console.log(
      `\n  📝 Tx: https://explorer.solana.com/tx/${sig}?cluster=testnet`
    );

    await connection.confirmTransaction(sig, "confirmed");
    console.log(`  ✅ Confirmed`);

    // Verify state
    const seriesData = await getOptionSeriesData(optionSeriesPda);
    console.log(`\n  Verified State:`);
    console.log(`    underlying_mint: ${seriesData.underlyingMint.toString()}`);
    console.log(`    strike_price: ${seriesData.strikePrice}`);
    console.log(`    consideration: ${seriesData.strikeCurrency.toString()}`);
    console.log(`    expiration: ${seriesData.expiration}`);
    console.log(`    option_mint: ${seriesData.optionMint.toString()}`);
    console.log(`    redemption_mint: ${seriesData.redemptionMint.toString()}`);
    console.log(
      `    collateral_vault: ${seriesData.collateralVault.toString()}`
    );
    console.log(`    cash_vault: ${seriesData.cashVault.toString()}`);
    console.log(`    total_supply: ${seriesData.totalSupply}`);
    console.log(`    exercised_amount: ${seriesData.exercisedAmount}`);

    assert.equal(seriesData.totalSupply, 0, "Should start at 0");
    assert.equal(seriesData.exercisedAmount, 0, "Should start at 0");

    // Verify mints exist
    const optionMintInfo = await getMint(
      connection,
      optionMintPda,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    const redemptionMintInfo = await getMint(
      connection,
      redemptionMintPda,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log(
      `\n  ✅ Option mint supply: ${optionMintInfo.supply.toString()}`
    );
    console.log(
      `  ✅ Redemption mint supply: ${redemptionMintInfo.supply.toString()}`
    );

    assert.equal(
      optionMintInfo.supply.toString(),
      "0",
      "Option mint should start at 0"
    );
    assert.equal(
      redemptionMintInfo.supply.toString(),
      "0",
      "Redemption mint should start at 0"
    );

    console.log(`\n  ✅ TEST 1 PASSED`);
  });

  it("✅ Test 2: Mint options - dual token creation", async () => {
    logSection("TEST 2: Mint Options");

    // Create user token accounts for option and redemption tokens
    userOptionAccount = await createAccount(
      connection,
      walletKeypair,
      optionMintPda,
      walletKeypair.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    userRedemptionAccount = await createAccount(
      connection,
      walletKeypair,
      redemptionMintPda,
      walletKeypair.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log(`  User option account: ${userOptionAccount.toString()}`);
    console.log(
      `  User redemption account: ${userRedemptionAccount.toString()}`
    );

    const mintAmount = FIRST_MINT;

    // BEFORE
    console.log(`\n  📊 BEFORE:`);
    const userUnderlyingBefore = await getTokenBalance(userUnderlyingAccount);
    const vaultBefore = await getTokenBalance(collateralVaultPda);
    const seriesBefore = await getOptionSeriesData(optionSeriesPda);

    logBalance("User underlying", userUnderlyingBefore);
    logBalance("Vault", vaultBefore);
    console.log(`  total_supply: ${seriesBefore.totalSupply}`);

    // Build instruction (sha256("global:mint_options")[0..8])
    // Calculate: node -e "const crypto = require('crypto'); const hash = crypto.createHash('sha256').update('global:mint_options').digest(); console.log(Array.from(hash.slice(0,8)).map(b => '0x' + b.toString(16).padStart(2,'0')).join(', '));"
    const discriminator = Buffer.from([
      0x30, 0x7b, 0xc5, 0x3b, 0xa0, 0xc7, 0x4b, 0x96,
    ]);
    const amountBN = new BN(mintAmount);
    const amountBytes = amountBN.toArrayLike(Buffer, "le", 8);
    const instructionData = Buffer.concat([discriminator, amountBytes]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: optionSeriesPda, isSigner: false, isWritable: true },
        { pubkey: underlyingMint, isSigner: false, isWritable: false },
        { pubkey: optionMintPda, isSigner: false, isWritable: true },
        { pubkey: redemptionMintPda, isSigner: false, isWritable: true },
        { pubkey: collateralVaultPda, isSigner: false, isWritable: true },
        { pubkey: userUnderlyingAccount, isSigner: false, isWritable: true },
        { pubkey: userOptionAccount, isSigner: false, isWritable: true },
        { pubkey: userRedemptionAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: instructionData,
    });

    const tx = new Transaction().add(instruction);
    const sig = await connection.sendTransaction(tx, [walletKeypair]);

    console.log(`\n  📡 Minting ${mintAmount}...`);
    console.log(
      `  📝 Tx: https://explorer.solana.com/tx/${sig}?cluster=testnet`
    );

    await connection.confirmTransaction(sig, "confirmed");
    console.log(`  ✅ Confirmed`);

    // AFTER
    console.log(`\n  📊 AFTER:`);
    const userUnderlyingAfter = await getTokenBalance(userUnderlyingAccount);
    const vaultAfter = await getTokenBalance(collateralVaultPda);
    const userOptionAfter = await getTokenBalance(userOptionAccount);
    const userRedemptionAfter = await getTokenBalance(userRedemptionAccount);
    const seriesAfter = await getOptionSeriesData(optionSeriesPda);

    logBalance("User underlying", userUnderlyingAfter);
    logBalance("Vault", vaultAfter);
    logBalance("User option tokens", userOptionAfter);
    logBalance("User redemption tokens", userRedemptionAfter);
    console.log(`  total_supply: ${seriesAfter.totalSupply}`);

    // VERIFY EXACT CHANGES
    console.log(`\n  🔍 VERIFICATION:`);
    const underlyingChange = userUnderlyingBefore - userUnderlyingAfter;
    const vaultChange = vaultAfter - vaultBefore;

    console.log(`  Underlying change: -${underlyingChange.toString()}`);
    console.log(`  Vault change: +${vaultChange.toString()}`);
    console.log(`  Option tokens minted: ${userOptionAfter.toString()}`);
    console.log(
      `  Redemption tokens minted: ${userRedemptionAfter.toString()}`
    );

    // Assertions
    assert.equal(
      underlyingChange.toString(),
      mintAmount.toString(),
      "❌ User underlying balance decrease mismatch"
    );
    console.log(`  ✅ User underlying decreased by EXACT amount`);

    assert.equal(
      vaultChange.toString(),
      mintAmount.toString(),
      "❌ Vault balance increase mismatch"
    );
    console.log(`  ✅ Vault increased by EXACT amount`);

    assert.equal(
      userOptionAfter.toString(),
      mintAmount.toString(),
      "❌ Option tokens mismatch"
    );
    console.log(`  ✅ Option tokens minted correctly`);

    assert.equal(
      userRedemptionAfter.toString(),
      mintAmount.toString(),
      "❌ Redemption tokens mismatch"
    );
    console.log(`  ✅ Redemption tokens minted correctly`);

    assert.equal(
      seriesAfter.totalSupply.toString(),
      mintAmount.toString(),
      "❌ total_supply mismatch"
    );
    console.log(`  ✅ total_supply updated correctly`);

    assert.equal(
      underlyingChange.toString(),
      vaultChange.toString(),
      "❌ Token conservation failure"
    );
    console.log(`  ✅ Token conservation verified`);

    assert.equal(
      userOptionAfter.toString(),
      userRedemptionAfter.toString(),
      "❌ Dual token mismatch"
    );
    console.log(`  ✅ Dual tokens created in equal amounts`);

    console.log(`\n  ✅ TEST 2 PASSED: Dual-token minting works perfectly!`);
  });

  after(async () => {
    logSection("📊 FINAL SUMMARY");

    const userUnderlying = await getTokenBalance(userUnderlyingAccount);
    const vault = await getTokenBalance(collateralVaultPda);
    const userOption = await getTokenBalance(userOptionAccount);
    const userRedemption = await getTokenBalance(userRedemptionAccount);
    const series = await getOptionSeriesData(optionSeriesPda);

    console.log(`\n  Final State:`);
    logBalance("User underlying", userUnderlying);
    logBalance("Vault", vault);
    logBalance("User option tokens", userOption);
    logBalance("User redemption tokens", userRedemption);
    console.log(`  total_supply: ${series.totalSupply}`);

    console.log(`\n  ✅ Phase 2 tests passed with EXACT verification!`);
    console.log(`  ✅ Dual-token model working correctly!`);
  });
});
