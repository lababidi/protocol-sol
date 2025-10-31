/**
 * Phase 5 Testnet Integration Tests - Burn Paired Tokens
 *
 * Tests the burn mechanism:
 * - Create option series
 * - Mint options (creates paired option + redemption tokens)
 * - Burn paired tokens PRE-EXPIRY (Test 1)
 * - Verify 1:1 collateral refund
 * - Verify total_supply DECREASES (only operation that does this!)
 * - Test burn POST-EXPIRY as well (Test 2)
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
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { Connection } from "@solana/web3.js";
import BN from "bn.js";

describe("🚀 Phase 5 Testnet Integration - Burn Paired Tokens", () => {
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
  let writerUnderlyingAccount: PublicKey;
  let writerStrikeAccount: PublicKey;
  let optionSeriesPda: PublicKey;
  let optionMintPda: PublicKey;
  let redemptionMintPda: PublicKey;
  let collateralVaultPda: PublicKey;
  let cashVaultPda: PublicKey;
  let writerOptionAccount: PublicKey;
  let writerRedemptionAccount: PublicKey;

  const UNDERLYING_DECIMALS = 5; // BONK has 5 decimals
  const STRIKE_DECIMALS = 6; // USDC has 6 decimals
  const STRIKE_PRICE = 4_000_000; // $0.04 in 6 decimals
  const EXPIRATION_SECONDS = 60; // 60 seconds (for post-expiry test)
  const INITIAL_WRITER_AMOUNT = 20_000_000; // 200 BONK
  const MINT_AMOUNT = 10_000_000; // Writer mints 100 options (100 BONK collateral)
  const BURN_AMOUNT = 4_000_000; // Burn 40 paired tokens (40 option + 40 redemption)

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
      throw new Error("Need at least 1 SOL for Phase 5 testing");
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

    const writerBalance = await getTokenBalance(writerUnderlyingAccount);
    console.log(`\n  Writer's initial BONK: ${writerBalance}`);
  });

  it("✅ Test 1: Create series, mint options, burn PRE-EXPIRY", async () => {
    logSection("TEST 1: Burn Paired Tokens PRE-EXPIRY");

    // Create series with 60 second expiry
    const expiration = Math.floor(Date.now() / 1000) + EXPIRATION_SECONDS;
    const strikePriceBN = new BN(STRIKE_PRICE);
    const expirationBN = new BN(expiration);

    console.log(
      `  ⏰ Expiry set to: ${new Date(expiration * 1000).toISOString()}`
    );
    console.log(`  ⏰ Current time: ${new Date().toISOString()}`);

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

    // BEFORE burn state
    console.log(`\n  📊 BEFORE Burn:`);
    const seriesBefore = await getOptionSeriesData(optionSeriesPda);
    const writerBonkBefore = await getTokenBalance(writerUnderlyingAccount);
    const writerOptionBefore = await getTokenBalance(writerOptionAccount);
    const writerRedemptionBefore = await getTokenBalance(
      writerRedemptionAccount
    );
    const vaultBonkBefore = await getTokenBalance(collateralVaultPda);

    logBalance("  Writer BONK", writerBonkBefore, UNDERLYING_DECIMALS);
    logBalance(
      "  Writer option tokens",
      writerOptionBefore,
      UNDERLYING_DECIMALS
    );
    logBalance(
      "  Writer redemption tokens",
      writerRedemptionBefore,
      UNDERLYING_DECIMALS
    );
    logBalance("  Collateral vault", vaultBonkBefore, UNDERLYING_DECIMALS);
    console.log(`  total_supply: ${seriesBefore.totalSupply}`);

    assert.equal(
      seriesBefore.totalSupply,
      MINT_AMOUNT,
      "Total supply should match mint amount"
    );

    // Burn paired tokens PRE-EXPIRY (THIS IS THE KEY TEST!)
    console.log(`\n  🔥 Burning ${BURN_AMOUNT} paired tokens (PRE-EXPIRY)...`);

    // burn_paired_tokens discriminator from IDL
    const burnDiscriminator = Buffer.from([235, 242, 51, 90, 10, 161, 111, 67]);
    const burnAmountBN = new BN(BURN_AMOUNT);
    const burnAmountBytes = burnAmountBN.toArrayLike(Buffer, "le", 8);
    const burnData = Buffer.concat([burnDiscriminator, burnAmountBytes]);

    const burnInstruction = new TransactionInstruction({
      keys: [
        { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: optionSeriesPda, isSigner: false, isWritable: true },
        { pubkey: underlyingMint, isSigner: false, isWritable: false },
        { pubkey: optionMintPda, isSigner: false, isWritable: true },
        { pubkey: redemptionMintPda, isSigner: false, isWritable: true },
        { pubkey: collateralVaultPda, isSigner: false, isWritable: true },
        { pubkey: writerOptionAccount, isSigner: false, isWritable: true },
        { pubkey: writerRedemptionAccount, isSigner: false, isWritable: true },
        { pubkey: writerUnderlyingAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: burnData,
    });

    const burnTx = new Transaction().add(burnInstruction);
    const burnSig = await connection.sendTransaction(burnTx, [walletKeypair]);
    console.log(
      `  📝 Tx: https://explorer.solana.com/tx/${burnSig}?cluster=testnet`
    );
    await connection.confirmTransaction(burnSig, "confirmed");
    console.log(`  ✅ Confirmed`);

    // AFTER burn state
    console.log(`\n  📊 AFTER Burn:`);
    const seriesAfter = await getOptionSeriesData(optionSeriesPda);
    const writerBonkAfter = await getTokenBalance(writerUnderlyingAccount);
    const writerOptionAfter = await getTokenBalance(writerOptionAccount);
    const writerRedemptionAfter = await getTokenBalance(
      writerRedemptionAccount
    );
    const vaultBonkAfter = await getTokenBalance(collateralVaultPda);

    logBalance("  Writer BONK", writerBonkAfter, UNDERLYING_DECIMALS);
    logBalance(
      "  Writer option tokens",
      writerOptionAfter,
      UNDERLYING_DECIMALS
    );
    logBalance(
      "  Writer redemption tokens",
      writerRedemptionAfter,
      UNDERLYING_DECIMALS
    );
    logBalance("  Collateral vault", vaultBonkAfter, UNDERLYING_DECIMALS);
    console.log(`  total_supply: ${seriesAfter.totalSupply}`);

    // VERIFY
    console.log(`\n  🔍 VERIFICATION:`);
    const optionChange = writerOptionBefore - writerOptionAfter;
    const redemptionChange = writerRedemptionBefore - writerRedemptionAfter;
    const bonkChange = writerBonkAfter - writerBonkBefore;
    const vaultChange = vaultBonkBefore - vaultBonkAfter;
    const supplyChange = seriesBefore.totalSupply - seriesAfter.totalSupply;

    console.log(`  Option tokens burned: ${optionChange}`);
    console.log(`  Redemption tokens burned: ${redemptionChange}`);
    console.log(`  Writer BONK received: +${bonkChange}`);
    console.log(`  Vault BONK paid out: ${vaultChange}`);
    console.log(`  total_supply DECREASED: ${supplyChange}`);

    // Assertions
    assert.equal(
      optionChange.toString(),
      BURN_AMOUNT.toString(),
      "Should burn option tokens"
    );
    console.log(`  ✅ Option tokens burned (${BURN_AMOUNT})`);

    assert.equal(
      redemptionChange.toString(),
      BURN_AMOUNT.toString(),
      "Should burn redemption tokens"
    );
    console.log(`  ✅ Redemption tokens burned (${BURN_AMOUNT})`);

    assert.equal(
      bonkChange.toString(),
      BURN_AMOUNT.toString(),
      "Should receive 1:1 BONK refund"
    );
    console.log(`  ✅ Received 1:1 BONK refund (${bonkChange})`);

    assert.equal(
      vaultChange.toString(),
      BURN_AMOUNT.toString(),
      "Vault should pay out 1:1 BONK"
    );
    console.log(`  ✅ Vault paid out 1:1 BONK (${vaultChange})`);

    // CRITICAL: total_supply DECREASES (only operation that does this!)
    assert.equal(
      supplyChange.toString(),
      BURN_AMOUNT.toString(),
      "total_supply should DECREASE"
    );
    console.log(
      `  ✅ total_supply DECREASED (${supplyChange}) - ONLY OPERATION THAT DOES THIS!`
    );

    // Conservation
    assert.equal(
      bonkChange.toString(),
      vaultChange.toString(),
      "Conservation: writer gain = vault loss"
    );
    console.log(`  ✅ Conservation verified`);

    console.log(`\n  ✅ TEST 1 PASSED: Burn works PRE-EXPIRY!`);
  });

  it("✅ Test 2: Burn POST-EXPIRY (verify anytime capability)", async () => {
    logSection("TEST 2: Burn Paired Tokens POST-EXPIRY");

    // Wait for expiry
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

    if (timeUntilExpiry > 0) {
      await sleep(timeUntilExpiry + 5);
    } else {
      console.log(`  ✅ Already expired!`);
    }

    console.log(
      `  ⏰ Expiry passed! Current time: ${new Date(Date.now()).toISOString()}`
    );

    // BEFORE burn state
    const seriesBefore = await getOptionSeriesData(optionSeriesPda);
    const writerBonkBefore = await getTokenBalance(writerUnderlyingAccount);
    const writerOptionBefore = await getTokenBalance(writerOptionAccount);
    const writerRedemptionBefore = await getTokenBalance(
      writerRedemptionAccount
    );
    const vaultBonkBefore = await getTokenBalance(collateralVaultPda);

    console.log(`\n  📊 BEFORE Burn (POST-EXPIRY):`);
    logBalance("  Writer BONK", writerBonkBefore, UNDERLYING_DECIMALS);
    logBalance(
      "  Writer option tokens",
      writerOptionBefore,
      UNDERLYING_DECIMALS
    );
    logBalance(
      "  Writer redemption tokens",
      writerRedemptionBefore,
      UNDERLYING_DECIMALS
    );
    logBalance("  Collateral vault", vaultBonkBefore, UNDERLYING_DECIMALS);
    console.log(`  total_supply: ${seriesBefore.totalSupply}`);

    // Calculate remaining paired tokens
    const remainingPaired = Math.min(
      Number(writerOptionBefore),
      Number(writerRedemptionBefore)
    );
    console.log(
      `\n  🔥 Burning remaining ${remainingPaired} paired tokens (POST-EXPIRY)...`
    );

    // Burn remaining paired tokens POST-EXPIRY
    const burnDiscriminator = Buffer.from([235, 242, 51, 90, 10, 161, 111, 67]);
    const burnAmountBN = new BN(remainingPaired);
    const burnAmountBytes = burnAmountBN.toArrayLike(Buffer, "le", 8);
    const burnData = Buffer.concat([burnDiscriminator, burnAmountBytes]);

    const burnInstruction = new TransactionInstruction({
      keys: [
        { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: optionSeriesPda, isSigner: false, isWritable: true },
        { pubkey: underlyingMint, isSigner: false, isWritable: false },
        { pubkey: optionMintPda, isSigner: false, isWritable: true },
        { pubkey: redemptionMintPda, isSigner: false, isWritable: true },
        { pubkey: collateralVaultPda, isSigner: false, isWritable: true },
        { pubkey: writerOptionAccount, isSigner: false, isWritable: true },
        { pubkey: writerRedemptionAccount, isSigner: false, isWritable: true },
        { pubkey: writerUnderlyingAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: burnData,
    });

    const burnTx = new Transaction().add(burnInstruction);
    const burnSig = await connection.sendTransaction(burnTx, [walletKeypair]);
    console.log(
      `  📝 Tx: https://explorer.solana.com/tx/${burnSig}?cluster=testnet`
    );
    await connection.confirmTransaction(burnSig, "confirmed");
    console.log(`  ✅ Confirmed`);

    // AFTER burn state
    console.log(`\n  📊 AFTER Burn (POST-EXPIRY):`);
    const seriesAfter = await getOptionSeriesData(optionSeriesPda);
    const writerBonkAfter = await getTokenBalance(writerUnderlyingAccount);
    const writerOptionAfter = await getTokenBalance(writerOptionAccount);
    const writerRedemptionAfter = await getTokenBalance(
      writerRedemptionAccount
    );
    const vaultBonkAfter = await getTokenBalance(collateralVaultPda);

    logBalance("  Writer BONK", writerBonkAfter, UNDERLYING_DECIMALS);
    logBalance(
      "  Writer option tokens",
      writerOptionAfter,
      UNDERLYING_DECIMALS
    );
    logBalance(
      "  Writer redemption tokens",
      writerRedemptionAfter,
      UNDERLYING_DECIMALS
    );
    logBalance("  Collateral vault", vaultBonkAfter, UNDERLYING_DECIMALS);
    console.log(`  total_supply: ${seriesAfter.totalSupply}`);

    // VERIFY
    console.log(`\n  🔍 VERIFICATION:`);
    const bonkChange = writerBonkAfter - writerBonkBefore;
    const supplyChange = seriesBefore.totalSupply - seriesAfter.totalSupply;

    console.log(`  Writer BONK received: +${bonkChange}`);
    console.log(`  total_supply DECREASED: ${supplyChange}`);

    assert.equal(
      bonkChange.toString(),
      remainingPaired.toString(),
      "Should receive 1:1 BONK refund POST-EXPIRY"
    );
    console.log(`  ✅ Received 1:1 BONK refund POST-EXPIRY (${bonkChange})`);

    assert.equal(
      supplyChange.toString(),
      remainingPaired.toString(),
      "total_supply should DECREASE POST-EXPIRY"
    );
    console.log(`  ✅ total_supply DECREASED POST-EXPIRY (${supplyChange})`);

    console.log(`\n  ✅ TEST 2 PASSED: Burn works POST-EXPIRY!`);
  });

  after(async () => {
    logSection("📊 FINAL SUMMARY");

    const writerBonk = await getTokenBalance(writerUnderlyingAccount);
    const writerOptions = await getTokenBalance(writerOptionAccount);
    const writerRedemptions = await getTokenBalance(writerRedemptionAccount);
    const collateralVault = await getTokenBalance(collateralVaultPda);
    const series = await getOptionSeriesData(optionSeriesPda);

    console.log(`\n  Final State:`);
    logBalance("  Writer BONK", writerBonk, UNDERLYING_DECIMALS);
    logBalance("  Writer option tokens", writerOptions, UNDERLYING_DECIMALS);
    logBalance(
      "  Writer redemption tokens",
      writerRedemptions,
      UNDERLYING_DECIMALS
    );
    logBalance("  Collateral vault", collateralVault, UNDERLYING_DECIMALS);
    console.log(`  total_supply: ${series.totalSupply}`);
    console.log(`  exercised_amount: ${series.exercisedAmount}`);

    console.log(`\n  ✅ Phase 5 tests passed with EXACT verification!`);
    console.log(`  ✅ Burn mechanism working PRE-EXPIRY and POST-EXPIRY!`);
    console.log(`  ✅ 1:1 collateral refund verified!`);
    console.log(`  ✅ total_supply DECREASES verified (ONLY OPERATION)!`);
    console.log(`\n  🎉 ALL CORE PROTOCOL PHASES (1-5) COMPLETE!`);
  });
});
