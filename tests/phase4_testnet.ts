/**
 * Phase 4 Testnet Integration Tests - Redemption Mechanism
 *
 * Tests the redemption functionality:
 * - Create option series with SHORT expiry (15 seconds)
 * - Mint options (Phase 2)
 * - Exercise some options (Phase 3) - creates mixed vault
 * - **WAIT FOR EXPIRY** (sleep 20 seconds)
 * - Redeem (Phase 4 NEW!) - verify pro-rata BONK + USDC distribution
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

describe("🚀 Phase 4 Testnet Integration - Redemption Mechanism", () => {
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
  const EXPIRATION_SECONDS = 15; // SHORT EXPIRY: 15 seconds from now!
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

  function sleep(seconds: number): Promise<void> {
    console.log(
      `\n  ⏰ Sleeping for ${seconds} seconds (waiting for expiry)...`
    );
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  before(async () => {
    logSection("🔧 TEST SETUP");

    console.log(`  Wallet: ${walletKeypair.publicKey.toString()}`);
    console.log(`  Program: ${programId.toString()}`);
    console.log(`  Network: Testnet`);

    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log(`  SOL Balance: ${balance / 1e9} SOL`);

    if (balance < 1 * 1e9) {
      throw new Error("Need at least 1 SOL for Phase 4 testing");
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
      Keypair.generate(),
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    writerStrikeAccount = await createAccount(
      connection,
      walletKeypair,
      strikeCurrencyMint,
      walletKeypair.publicKey,
      Keypair.generate(),
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Create buyer's accounts
    buyerUnderlyingAccount = await createAccount(
      connection,
      walletKeypair,
      underlyingMint,
      walletKeypair.publicKey,
      Keypair.generate(),
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    buyerStrikeAccount = await createAccount(
      connection,
      walletKeypair,
      strikeCurrencyMint,
      walletKeypair.publicKey,
      Keypair.generate(),
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

  it("✅ Test 1: Create series with SHORT expiry & mint options", async () => {
    logSection("TEST 1: Create Series (15 second expiry) & Mint");

    // KEY: SHORT EXPIRY - 15 seconds from now!
    const expiration = Math.floor(Date.now() / 1000) + EXPIRATION_SECONDS;
    const strikePriceBN = new BN(STRIKE_PRICE);
    const expirationBN = new BN(expiration);

    console.log(
      `  ⏰ Expiry set to: ${new Date(expiration * 1000).toISOString()}`
    );
    console.log(`  ⏰ Current time: ${new Date().toISOString()}`);
    console.log(`  ⏰ Time until expiry: ${EXPIRATION_SECONDS} seconds`);

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

    console.log(`\n  Creating option series...`);

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

  it("✅ Test 2: Transfer option tokens & exercise (create mixed vault)", async () => {
    logSection("TEST 2: Transfer & Exercise");

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

    // Transfer some option tokens from writer to buyer
    const { createTransferCheckedInstruction } = await import(
      "@solana/spl-token"
    );

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

    // Exercise options (create mixed vault)
    console.log(`\n  📡 Buyer exercising ${EXERCISE_AMOUNT} options...`);
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
    await connection.confirmTransaction(exerciseSig, "confirmed");
    console.log(`  ✅ Exercise confirmed: ${exerciseSig}`);

    // Verify mixed vault state
    const collateralBalance = await getTokenBalance(collateralVaultPda);
    const cashBalance = await getTokenBalance(cashVaultPda);

    console.log(`\n  📊 Vault State After Exercise:`);
    logBalance(
      "  Collateral vault (BONK)",
      collateralBalance,
      UNDERLYING_DECIMALS
    );
    logBalance("  Cash vault (USDC)", cashBalance, STRIKE_DECIMALS);

    assert.equal(
      collateralBalance,
      BigInt(MINT_AMOUNT - EXERCISE_AMOUNT),
      "Collateral vault should have remaining BONK"
    );
    assert.isTrue(
      cashBalance > 0n,
      "Cash vault should have USDC from exercise"
    );

    console.log(`\n  ✅ TEST 2 PASSED - Mixed vault created!`);
  });

  it("✅ Test 3: Wait for expiry, then redeem", async () => {
    logSection("TEST 3: Wait for Expiry & Redeem");

    // Get series expiry
    const seriesData = await getOptionSeriesData(optionSeriesPda);
    const expiryTime = seriesData.expiration;
    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = expiryTime - currentTime;

    console.log(
      `  ⏰ Current time: ${new Date(currentTime * 1000).toISOString()}`
    );
    console.log(
      `  ⏰ Expiry time: ${new Date(expiryTime * 1000).toISOString()}`
    );
    console.log(`  ⏰ Time until expiry: ${timeUntilExpiry} seconds`);

    // Wait for expiry (add 5 second buffer)
    if (timeUntilExpiry > 0) {
      await sleep(timeUntilExpiry + 5);
    } else {
      console.log(`  ✅ Already expired!`);
    }

    console.log(
      `  ⏰ Expiry passed! Current time: ${new Date(Date.now()).toISOString()}`
    );

    // BEFORE redemption state
    console.log(`\n  📊 BEFORE Redemption:`);
    const writerRedemptionBefore = await getTokenBalance(
      writerRedemptionAccount
    );
    const writerBonkBefore = await getTokenBalance(writerUnderlyingAccount);
    const writerUsdcBefore = await getTokenBalance(writerStrikeAccount);
    const collateralVaultBefore = await getTokenBalance(collateralVaultPda);
    const cashVaultBefore = await getTokenBalance(cashVaultPda);

    logBalance(
      "  Writer redemption tokens",
      writerRedemptionBefore,
      UNDERLYING_DECIMALS
    );
    logBalance("  Writer BONK", writerBonkBefore, UNDERLYING_DECIMALS);
    logBalance("  Writer USDC", writerUsdcBefore, STRIKE_DECIMALS);
    logBalance(
      "  Collateral vault",
      collateralVaultBefore,
      UNDERLYING_DECIMALS
    );
    logBalance("  Cash vault", cashVaultBefore, STRIKE_DECIMALS);

    // Calculate expected payouts
    const totalSupply = seriesData.totalSupply;
    const expectedBonkPayout =
      (Number(collateralVaultBefore) * MINT_AMOUNT) / totalSupply;
    const expectedUsdcPayout =
      (Number(cashVaultBefore) * MINT_AMOUNT) / totalSupply;

    console.log(`\n  📊 Expected Pro-Rata Payouts:`);
    console.log(`  Total supply: ${totalSupply}`);
    console.log(
      `  Writer's share: ${MINT_AMOUNT}/${totalSupply} = ${(
        (MINT_AMOUNT / totalSupply) *
        100
      ).toFixed(1)}%`
    );
    console.log(`  Expected BONK: ${expectedBonkPayout.toFixed(0)} raw`);
    console.log(`  Expected USDC: ${expectedUsdcPayout.toFixed(0)} raw`);

    // Redeem redemption tokens
    console.log(`\n  📡 Redeeming ${MINT_AMOUNT} redemption tokens...`);

    // Calculate redeem discriminator (SHA256 of "global:redeem")
    const redeemDiscriminator = Buffer.from([
      0xb8, 0x0c, 0x56, 0x95, 0x46, 0xc4, 0x61, 0xe1,
    ]);
    const redeemAmountBN = new BN(MINT_AMOUNT);
    const redeemAmountBytes = redeemAmountBN.toArrayLike(Buffer, "le", 8);
    const redeemData = Buffer.concat([redeemDiscriminator, redeemAmountBytes]);

    const redeemInstruction = new TransactionInstruction({
      keys: [
        { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: optionSeriesPda, isSigner: false, isWritable: true },
        { pubkey: underlyingMint, isSigner: false, isWritable: false },
        { pubkey: strikeCurrencyMint, isSigner: false, isWritable: false },
        { pubkey: redemptionMintPda, isSigner: false, isWritable: true },
        { pubkey: collateralVaultPda, isSigner: false, isWritable: true },
        { pubkey: cashVaultPda, isSigner: false, isWritable: true },
        { pubkey: writerRedemptionAccount, isSigner: false, isWritable: true },
        { pubkey: writerUnderlyingAccount, isSigner: false, isWritable: true },
        { pubkey: writerStrikeAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: redeemData,
    });

    const redeemTx = new Transaction().add(redeemInstruction);
    const redeemSig = await connection.sendTransaction(redeemTx, [
      walletKeypair,
    ]);
    console.log(
      `  📝 Tx: https://explorer.solana.com/tx/${redeemSig}?cluster=testnet`
    );
    await connection.confirmTransaction(redeemSig, "confirmed");
    console.log(`  ✅ Confirmed`);

    // AFTER redemption state
    console.log(`\n  📊 AFTER Redemption:`);
    const writerRedemptionAfter = await getTokenBalance(
      writerRedemptionAccount
    );
    const writerBonkAfter = await getTokenBalance(writerUnderlyingAccount);
    const writerUsdcAfter = await getTokenBalance(writerStrikeAccount);
    const collateralVaultAfter = await getTokenBalance(collateralVaultPda);
    const cashVaultAfter = await getTokenBalance(cashVaultPda);

    logBalance(
      "  Writer redemption tokens",
      writerRedemptionAfter,
      UNDERLYING_DECIMALS
    );
    logBalance("  Writer BONK", writerBonkAfter, UNDERLYING_DECIMALS);
    logBalance("  Writer USDC", writerUsdcAfter, STRIKE_DECIMALS);
    logBalance("  Collateral vault", collateralVaultAfter, UNDERLYING_DECIMALS);
    logBalance("  Cash vault", cashVaultAfter, STRIKE_DECIMALS);

    // VERIFY
    console.log(`\n  🔍 VERIFICATION:`);
    const redemptionChange = writerRedemptionBefore - writerRedemptionAfter;
    const bonkChange = writerBonkAfter - writerBonkBefore;
    const usdcChange = writerUsdcAfter - writerUsdcBefore;
    const vaultBonkChange = collateralVaultBefore - collateralVaultAfter;
    const vaultUsdcChange = cashVaultBefore - cashVaultAfter;

    console.log(`  Redemption tokens burned: ${redemptionChange}`);
    console.log(`  Writer BONK received: +${bonkChange}`);
    console.log(`  Writer USDC received: +${usdcChange}`);
    console.log(`  Vault BONK paid out: ${vaultBonkChange}`);
    console.log(`  Vault USDC paid out: ${vaultUsdcChange}`);

    // Assertions
    assert.equal(
      redemptionChange.toString(),
      MINT_AMOUNT.toString(),
      "Should burn all redemption tokens"
    );
    console.log(`  ✅ Redemption tokens burned (${MINT_AMOUNT})`);

    assert.equal(
      bonkChange.toString(),
      expectedBonkPayout.toFixed(0),
      "Should receive pro-rata BONK"
    );
    console.log(`  ✅ Received pro-rata BONK (${bonkChange})`);

    assert.equal(
      usdcChange.toString(),
      expectedUsdcPayout.toFixed(0),
      "Should receive pro-rata USDC"
    );
    console.log(`  ✅ Received pro-rata USDC (${usdcChange})`);

    // Conservation
    assert.equal(
      bonkChange.toString(),
      vaultBonkChange.toString(),
      "BONK conservation: writer gain = vault loss"
    );
    console.log(`  ✅ BONK conservation verified`);

    assert.equal(
      usdcChange.toString(),
      vaultUsdcChange.toString(),
      "USDC conservation: writer gain = vault loss"
    );
    console.log(`  ✅ USDC conservation verified`);

    console.log(`\n  ✅ TEST 3 PASSED: Redemption works perfectly!`);
  });

  after(async () => {
    logSection("📊 FINAL SUMMARY");

    const writerBonk = await getTokenBalance(writerUnderlyingAccount);
    const writerUsdc = await getTokenBalance(writerStrikeAccount);
    const writerOptions = await getTokenBalance(writerOptionAccount);
    const writerRedemptions = await getTokenBalance(writerRedemptionAccount);
    const collateralVault = await getTokenBalance(collateralVaultPda);
    const cashVault = await getTokenBalance(cashVaultPda);
    const series = await getOptionSeriesData(optionSeriesPda);

    console.log(`\n  Final State:`);
    logBalance("  Writer BONK", writerBonk, UNDERLYING_DECIMALS);
    logBalance("  Writer USDC", writerUsdc, STRIKE_DECIMALS);
    logBalance("  Writer option tokens", writerOptions, UNDERLYING_DECIMALS);
    logBalance(
      "  Writer redemption tokens",
      writerRedemptions,
      UNDERLYING_DECIMALS
    );
    logBalance("  Collateral vault", collateralVault, UNDERLYING_DECIMALS);
    logBalance("  Cash vault", cashVault, STRIKE_DECIMALS);
    console.log(`  total_supply: ${series.totalSupply}`);
    console.log(`  exercised_amount: ${series.exercisedAmount}`);

    console.log(`\n  ✅ Phase 4 tests passed with EXACT verification!`);
    console.log(`  ✅ Redemption mechanism working correctly!`);
    console.log(`  ✅ Pro-rata distribution verified (BONK + USDC)!`);
  });
});
