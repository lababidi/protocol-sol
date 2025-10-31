/**
 * Manual Testnet Integration Tests
 *
 * Tests real transactions using manual instruction building
 * This avoids IDL loading issues while still testing actual on-chain behavior
 */

import * as anchor from "@coral-xyz/anchor";
const { BN } = anchor;
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Connection,
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

describe("🚀 Manual Testnet Integration - Phase 1 Custody", () => {
  const TESTNET_RPC = "https://api.testnet.solana.com";
  const connection = new Connection(TESTNET_RPC, "confirmed");

  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const programId = new PublicKey(
    "79iTNXm1SscyhxiP6jfnQfgXJ448PZaRN98N4EY3nMBn"
  );

  // Test state
  let underlyingMint: PublicKey;
  let userUnderlyingAccount: PublicKey;
  let optionSeriesPda: PublicKey;
  let collateralVaultPda: PublicKey;

  const DECIMALS = 5;
  const STRIKE_PRICE = new BN(4_000_000);
  const EXPIRATION_DAYS = 30;
  const INITIAL_MINT_AMOUNT = 10_000_000;
  const FIRST_DEPOSIT = 1_000_000;
  const SECOND_DEPOSIT = 500_000;

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

    // Parse OptionSeries struct:
    // discriminator (8) + underlying_mint (32) + strike_price (8) + expiration (8) +
    // collateral_vault (32) + total_deposited (8) + bump (1) + collateral_vault_bump (1)

    let offset = 8; // Skip discriminator

    const underlyingMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const strikePrice = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const expiration = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const collateralVault = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const totalDeposited = new BN(data.slice(offset, offset + 8), "le");

    return {
      underlyingMint,
      strikePrice,
      expiration,
      collateralVault,
      totalDeposited,
    };
  }

  before(async () => {
    logSection("🔧 TEST SETUP");

    console.log(`  Wallet: ${walletKeypair.publicKey.toString()}`);
    console.log(`  Program: ${programId.toString()}`);
    console.log(`  Network: Testnet`);

    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log(`  SOL Balance: ${balance / 1e9} SOL`);

    if (balance < 0.1 * 1e9) {
      throw new Error("Need at least 0.1 SOL for testing");
    }

    // Create mint
    console.log(`\n  Creating Token-2022 mint...`);
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
    console.log(`  ✅ Mint: ${underlyingMint.toString()}`);

    // Create account
    userUnderlyingAccount = await createAccount(
      connection,
      walletKeypair,
      underlyingMint,
      walletKeypair.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`  ✅ Token account: ${userUnderlyingAccount.toString()}`);

    // Mint tokens
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

    const balance_tokens = await getTokenBalance(userUnderlyingAccount);
    logBalance("Initial balance", balance_tokens);
  });

  it("✅ Test 1: Create option series", async () => {
    logSection("TEST 1: Create Option Series");

    const expiration = new BN(
      Math.floor(Date.now() / 1000) + EXPIRATION_DAYS * 24 * 60 * 60
    );

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

    console.log(`  Option Series: ${optionSeriesPda.toString()}`);
    console.log(`  Vault: ${collateralVaultPda.toString()}`);

    // Build instruction data manually
    // Instruction discriminator for create_option_series (sha256("global:create_option_series")[0..8])
    const discriminator = Buffer.from([
      0x12, 0xe1, 0x20, 0x0b, 0x1e, 0xb0, 0xa1, 0xdd,
    ]);
    const strikePriceBytes = STRIKE_PRICE.toArrayLike(Buffer, "le", 8);
    const expirationBytes = expiration.toArrayLike(Buffer, "le", 8);
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
        { pubkey: collateralVaultPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: instructionData,
    });

    const tx = new Transaction().add(instruction);
    const sig = await connection.sendTransaction(tx, [walletKeypair]);

    console.log(
      `  📝 Tx: https://explorer.solana.com/tx/${sig}?cluster=testnet`
    );

    await connection.confirmTransaction(sig, "confirmed");
    console.log(`  ✅ Confirmed`);

    // Verify state
    const seriesData = await getOptionSeriesData(optionSeriesPda);
    console.log(`\n  Verified State:`);
    console.log(`    strike_price: ${seriesData.strikePrice.toString()}`);
    console.log(`    expiration: ${seriesData.expiration.toString()}`);
    console.log(`    total_deposited: ${seriesData.totalDeposited.toString()}`);

    assert.equal(
      seriesData.totalDeposited.toString(),
      "0",
      "Should start at 0"
    );

    const vaultBalance = await getTokenBalance(collateralVaultPda);
    assert.equal(vaultBalance.toString(), "0", "Vault should be empty");

    console.log(`\n  ✅ TEST 1 PASSED`);
  });

  it("✅ Test 2: First deposit with EXACT balance verification", async () => {
    logSection("TEST 2: First Deposit");

    const depositAmount = new BN(FIRST_DEPOSIT);

    // BEFORE
    console.log(`\n  📊 BEFORE:`);
    const userBefore = await getTokenBalance(userUnderlyingAccount);
    const vaultBefore = await getTokenBalance(collateralVaultPda);
    const seriesBefore = await getOptionSeriesData(optionSeriesPda);

    logBalance("User", userBefore);
    logBalance("Vault", vaultBefore);
    console.log(`  total_deposited: ${seriesBefore.totalDeposited.toString()}`);

    // Build instruction (sha256("global:deposit_collateral")[0..8])
    const discriminator = Buffer.from([
      0x9c, 0x83, 0x8e, 0x74, 0x92, 0xf7, 0xa2, 0x78,
    ]);
    const amountBytes = depositAmount.toArrayLike(Buffer, "le", 8);
    const instructionData = Buffer.concat([discriminator, amountBytes]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: optionSeriesPda, isSigner: false, isWritable: true },
        { pubkey: underlyingMint, isSigner: false, isWritable: false },
        { pubkey: collateralVaultPda, isSigner: false, isWritable: true },
        { pubkey: userUnderlyingAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: instructionData,
    });

    const tx = new Transaction().add(instruction);
    const sig = await connection.sendTransaction(tx, [walletKeypair]);

    console.log(`\n  📡 Depositing ${depositAmount.toString()}...`);
    console.log(
      `  📝 Tx: https://explorer.solana.com/tx/${sig}?cluster=testnet`
    );

    await connection.confirmTransaction(sig, "confirmed");
    console.log(`  ✅ Confirmed`);

    // AFTER
    console.log(`\n  📊 AFTER:`);
    const userAfter = await getTokenBalance(userUnderlyingAccount);
    const vaultAfter = await getTokenBalance(collateralVaultPda);
    const seriesAfter = await getOptionSeriesData(optionSeriesPda);

    logBalance("User", userAfter);
    logBalance("Vault", vaultAfter);
    console.log(`  total_deposited: ${seriesAfter.totalDeposited.toString()}`);

    // VERIFY EXACT CHANGES
    console.log(`\n  🔍 VERIFICATION:`);
    const userChange = userBefore - userAfter;
    const vaultChange = vaultAfter - vaultBefore;
    const totalChange = seriesAfter.totalDeposited.sub(
      seriesBefore.totalDeposited
    );

    console.log(`  User change: -${userChange.toString()}`);
    console.log(`  Vault change: +${vaultChange.toString()}`);
    console.log(`  total_deposited change: +${totalChange.toString()}`);

    assert.equal(
      userChange.toString(),
      depositAmount.toString(),
      "❌ User balance decrease mismatch"
    );
    console.log(
      `  ✅ User decreased by EXACT amount: ${depositAmount.toString()}`
    );

    assert.equal(
      vaultChange.toString(),
      depositAmount.toString(),
      "❌ Vault balance increase mismatch"
    );
    console.log(
      `  ✅ Vault increased by EXACT amount: ${depositAmount.toString()}`
    );

    assert.equal(
      totalChange.toString(),
      depositAmount.toString(),
      "❌ total_deposited mismatch"
    );
    console.log(
      `  ✅ total_deposited increased by EXACT amount: ${depositAmount.toString()}`
    );

    assert.equal(
      userChange.toString(),
      vaultChange.toString(),
      "❌ Conservation failure"
    );
    console.log(`  ✅ Token conservation verified`);

    console.log(`\n  ✅ TEST 2 PASSED: All balances EXACTLY verified`);
  });

  it("✅ Test 3: Second deposit with cumulative verification", async () => {
    logSection("TEST 3: Second Deposit");

    const depositAmount = new BN(SECOND_DEPOSIT);

    // BEFORE
    const userBefore = await getTokenBalance(userUnderlyingAccount);
    const vaultBefore = await getTokenBalance(collateralVaultPda);
    const seriesBefore = await getOptionSeriesData(optionSeriesPda);

    // Build instruction (sha256("global:deposit_collateral")[0..8])
    const discriminator = Buffer.from([
      0x9c, 0x83, 0x8e, 0x74, 0x92, 0xf7, 0xa2, 0x78,
    ]);
    const amountBytes = depositAmount.toArrayLike(Buffer, "le", 8);
    const instructionData = Buffer.concat([discriminator, amountBytes]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: optionSeriesPda, isSigner: false, isWritable: true },
        { pubkey: underlyingMint, isSigner: false, isWritable: false },
        { pubkey: collateralVaultPda, isSigner: false, isWritable: true },
        { pubkey: userUnderlyingAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId,
      data: instructionData,
    });

    const tx = new Transaction().add(instruction);
    const sig = await connection.sendTransaction(tx, [walletKeypair]);

    console.log(`  📡 Depositing ${depositAmount.toString()}...`);
    console.log(
      `  📝 Tx: https://explorer.solana.com/tx/${sig}?cluster=testnet`
    );

    await connection.confirmTransaction(sig, "confirmed");

    // AFTER
    const userAfter = await getTokenBalance(userUnderlyingAccount);
    const vaultAfter = await getTokenBalance(collateralVaultPda);
    const seriesAfter = await getOptionSeriesData(optionSeriesPda);

    // VERIFY CUMULATIVE
    console.log(`\n  🔍 CUMULATIVE VERIFICATION:`);
    const expectedUser = INITIAL_MINT_AMOUNT - FIRST_DEPOSIT - SECOND_DEPOSIT;
    const expectedVault = FIRST_DEPOSIT + SECOND_DEPOSIT;

    console.log(`  Expected user: ${expectedUser}`);
    console.log(`  Actual user: ${userAfter.toString()}`);
    console.log(`  Expected vault: ${expectedVault}`);
    console.log(`  Actual vault: ${vaultAfter.toString()}`);

    assert.equal(
      userAfter.toString(),
      expectedUser.toString(),
      "❌ Cumulative user balance mismatch"
    );
    console.log(`  ✅ Cumulative user balance verified`);

    assert.equal(
      vaultAfter.toString(),
      expectedVault.toString(),
      "❌ Cumulative vault balance mismatch"
    );
    console.log(`  ✅ Cumulative vault balance verified`);

    // Conservation
    const total = Number(userAfter) + Number(vaultAfter);
    assert.equal(total, INITIAL_MINT_AMOUNT, "❌ Token conservation violated");
    console.log(`  ✅ Token conservation: ${total} = ${INITIAL_MINT_AMOUNT}`);

    console.log(`\n  ✅ TEST 3 PASSED: Cumulative tracking verified`);
  });

  after(async () => {
    logSection("📊 FINAL SUMMARY");

    const userFinal = await getTokenBalance(userUnderlyingAccount);
    const vaultFinal = await getTokenBalance(collateralVaultPda);
    const seriesFinal = await getOptionSeriesData(optionSeriesPda);

    console.log(`\n  Final State:`);
    logBalance("User", userFinal);
    logBalance("Vault", vaultFinal);
    console.log(`  total_deposited: ${seriesFinal.totalDeposited.toString()}`);

    console.log(`\n  Deposits Made:`);
    console.log(`    1st: ${FIRST_DEPOSIT}`);
    console.log(`    2nd: ${SECOND_DEPOSIT}`);
    console.log(`    Total: ${FIRST_DEPOSIT + SECOND_DEPOSIT}`);

    console.log(`\n  ✅ All tests passed with EXACT verification!`);
  });
});
