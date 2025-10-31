/**
 * Local Test Suite for Solana Options Protocol
 *
 * Run with: anchor test
 * Or: anchor localnet (in one terminal) then: anchor test --skip-local-validator
 *
 * This test creates local SPL tokens and tests the full lifecycle
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolOptionProtocol } from "../target/types/sol_option_protocol";
const { BN } = anchor;
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("Local Options Protocol Tests", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .SolOptionProtocol as Program<SolOptionProtocol>;
  const payer = provider.wallet as anchor.Wallet;

  // Test accounts
  let collateralMint: PublicKey; // e.g., BONK
  let considerationMint: PublicKey; // e.g., USDC
  let userCollateralAccount: PublicKey;
  let userConsiderationAccount: PublicKey;

  // Option context accounts
  let optionContextPDA: PublicKey;
  let optionMintPDA: PublicKey;
  let redemptionMintPDA: PublicKey;
  let collateralVaultPDA: PublicKey;
  let considerationVaultPDA: PublicKey;

  // User token accounts for options
  let userOptionAccount: PublicKey;
  let userRedemptionAccount: PublicKey;

  // Test parameters
  const collateralDecimals = 5; // BONK has 5 decimals
  const strikeDecimals = 6; // USDC has 6 decimals
  const strikePrice = new BN(40_000); // $0.04 in USDC (6 decimals)
  const expirationOffset = 3600; // 1 hour from now
  let expiration;

  before(async () => {
    console.log("Setting up test environment...");

    // Create collateral mint (simulating BONK with 5 decimals)
    console.log("Creating collateral mint...");
    collateralMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      collateralDecimals
    );
    console.log("Collateral mint:", collateralMint.toString());

    // Create strike currency mint (simulating USDC with 6 decimals)
    console.log("Creating strike currency mint...");
    considerationMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      strikeDecimals
    );
    console.log("Strike currency mint:", considerationMint.toString());

    // Create user token accounts
    console.log("Creating user token accounts...");
    const userCollateralATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      collateralMint,
      payer.publicKey
    );
    userCollateralAccount = userCollateralATA.address;

    const userStrikeATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      considerationMint,
      payer.publicKey
    );
    userConsiderationAccount = userStrikeATA.address;

    // Mint initial tokens to user
    console.log("Minting initial collateral to user...");
    await mintTo(
      provider.connection,
      payer.payer,
      collateralMint,
      userCollateralAccount,
      payer.publicKey,
      1_000_000_00000 // 1M BONK
    );

    console.log("Minting initial strike currency to user...");
    await mintTo(
      provider.connection,
      payer.payer,
      considerationMint,
      userConsiderationAccount,
      payer.publicKey,
      10_000_000000 // 10K USDC
    );

    console.log("Setup complete!");
  });

  it("Creates an option context", async () => {
    console.log("\n=== TEST: Creating Option Series ===");

    // Set expiration to 1 hour from now
    const currentTime = Math.floor(Date.now() / 1000);
    expiration = new BN(currentTime + expirationOffset);

    // Derive PDAs for OptionContext-based design
    const isPut = false;
    [optionContextPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("option_context"),
        collateralMint.toBuffer(),
        considerationMint.toBuffer(),
        strikePrice.toArrayLike(Buffer, "le", 8),
        expiration.toArrayLike(Buffer, "le", 8),
        Buffer.from([isPut ? 1 : 0]),
      ],
      program.programId
    );

    [optionMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("option_mint"), optionContextPDA.toBuffer()],
      program.programId
    );

    [redemptionMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("redemption_mint"), optionContextPDA.toBuffer()],
      program.programId
    );

    [collateralVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("collateral_vault"), optionContextPDA.toBuffer()],
      program.programId
    );

    [considerationVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("consideration_vault"), optionContextPDA.toBuffer()],
      program.programId
    );

    console.log("Option Context PDA:", optionContextPDA.toString());
    console.log("Option Mint PDA:", optionMintPDA.toString());
    console.log("Redemption Mint PDA:", redemptionMintPDA.toString());

    // Create option series
    const tx = await program.methods
      .createOption(
        collateralMint,
        considerationMint,
        strikePrice,
        expiration,
        false
      )
      .accounts({
        // payer: payer.publicKey,
        optionContext: optionContextPDA,
        collateralMint: collateralMint,
        considerationMint: considerationMint,
      })
      .rpc();

    console.log("Transaction signature:", tx);

    // Verify option series was created
    const optionContext = await program.account.optionData.fetch(
      optionContextPDA
    );
    expect(optionContext.collateralMint.toString()).to.equal(
      collateralMint.toString()
    );
    expect(optionContext.strikePrice.toString()).to.equal(
      strikePrice.toString()
    );
    expect(optionContext.totalSupply.toString()).to.equal("0");

    console.log("✓ Option series created successfully");
  });

  it("Mints option tokens", async () => {
    console.log("\n=== TEST: Minting Option Tokens ===");

    // Create user option token accounts
    const userOptionATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      optionMintPDA,
      payer.publicKey
    );
    userOptionAccount = userOptionATA.address;

    const userRedemptionATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      redemptionMintPDA,
      payer.publicKey
    );
    userRedemptionAccount = userRedemptionATA.address;

    const mintAmount = new BN(10000_00000); // 10K BONK

    // Check initial balances
    const initialCollateral = await getAccount(
      provider.connection,
      userCollateralAccount
    );
    console.log(
      "Initial collateral balance:",
      initialCollateral.amount.toString()
    );

    // Mint options
    const tx = await program.methods
      .mint(mintAmount)
      .accounts({
        user: payer.publicKey,
        optionContext: optionContextPDA,
        collateralMint: collateralMint,
        considerationMint: considerationMint,
        optionMint: optionMintPDA,
        redemptionMint: redemptionMintPDA,
        collateralVault: collateralVaultPDA,
        considerationVault: considerationVaultPDA,
        userCollateralAccount: userCollateralAccount,
        userOptionAccount: userOptionAccount,
        userRedemptionAccount: userRedemptionAccount,
        userConsiderationAccount: userConsiderationAccount,
      })
      .rpc();

    console.log("Transaction signature:", tx);

    // Verify balances
    const finalCollateral = await getAccount(
      provider.connection,
      userCollateralAccount
    );
    const optionBalance = await getAccount(
      provider.connection,
      userOptionAccount
    );
    const redemptionBalance = await getAccount(
      provider.connection,
      userRedemptionAccount
    );

    expect(
      BigInt(initialCollateral.amount) - BigInt(finalCollateral.amount)
    ).to.equal(BigInt(mintAmount.toString()));
    expect(optionBalance.amount.toString()).to.equal(mintAmount.toString());
    expect(redemptionBalance.amount.toString()).to.equal(mintAmount.toString());

    // Verify option series state
    const optionContext = await program.account.optionData.fetch(
      optionContextPDA
    );
    expect(optionContext.totalSupply.toString()).to.equal(
      mintAmount.toString()
    );

    console.log("✓ Option tokens minted successfully");
    console.log("  Option balance:", optionBalance.amount.toString());
    console.log("  Redemption balance:", redemptionBalance.amount.toString());
  });

  it("Exercises option tokens", async () => {
    console.log("\n=== TEST: Exercising Options ===");

    const exerciseAmount = new BN(5000_00000); // 5K BONK

    // Calculate expected strike payment
    // Formula: (amount × strike_price) / 10^collateral_decimals
    const expectedStrikePayment = exerciseAmount
      .mul(strikePrice)
      .div(new BN(10 ** collateralDecimals));

    console.log("Exercise amount:", exerciseAmount.toString());
    console.log("Expected strike payment:", expectedStrikePayment.toString());

    // Check initial balances
    const initialConsideration = await getAccount(
      provider.connection,
      userConsiderationAccount
    );
    const initialOption = await getAccount(
      provider.connection,
      userOptionAccount
    );
    const initialCollateral = await getAccount(
      provider.connection,
      userCollateralAccount
    );

    // Exercise options
    const tx = await program.methods
      .exercise(exerciseAmount)
      .accounts({
        user: payer.publicKey,
        optionContext: optionContextPDA,
        collateralMint: collateralMint,
        considerationMint: considerationMint,
        optionMint: optionMintPDA,
        redemptionMint: redemptionMintPDA,
        collateralVault: collateralVaultPDA,
        considerationVault: considerationVaultPDA,
        userOptionAccount: userOptionAccount,
        userRedemptionAccount: userRedemptionAccount,
        userConsiderationAccount: userConsiderationAccount,
        userCollateralAccount: userCollateralAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Transaction signature:", tx);

    // Verify balances
    const finalConsideration = await getAccount(
      provider.connection,
      userConsiderationAccount
    );
    const finalOption = await getAccount(
      provider.connection,
      userOptionAccount
    );
    const finalCollateral = await getAccount(
      provider.connection,
      userCollateralAccount
    );

    // User paid consideration currency
    expect(
      BigInt(initialConsideration.amount) - BigInt(finalConsideration.amount)
    ).to.equal(BigInt(expectedStrikePayment.toString()));

    // User option tokens burned
    expect(BigInt(initialOption.amount) - BigInt(finalOption.amount)).to.equal(
      BigInt(exerciseAmount.toString())
    );

    // User received collateral
    expect(
      BigInt(finalCollateral.amount) - BigInt(initialCollateral.amount)
    ).to.equal(BigInt(exerciseAmount.toString()));

    console.log("✓ Options exercised successfully");
  });

  it("Burns paired tokens for refund", async () => {
    console.log("\n=== TEST: Burning Paired Tokens ===");

    const burnAmount = new BN(2000_00000); // 2K BONK

    // Check initial balances
    const initialOption = await getAccount(
      provider.connection,
      userOptionAccount
    );
    const initialRedemption = await getAccount(
      provider.connection,
      userRedemptionAccount
    );
    const initialCollateral = await getAccount(
      provider.connection,
      userCollateralAccount
    );
    const initialSupply = (
      await program.account.optionData.fetch(optionContextPDA)
    ).totalSupply;

    // Burn paired tokens
    const tx = await program.methods
      .burn(burnAmount)
      .accounts({
        user: payer.publicKey,
        optionContext: optionContextPDA,
        collateralMint: collateralMint,
        considerationMint: considerationMint,
        optionMint: optionMintPDA,
        redemptionMint: redemptionMintPDA,
        collateralVault: collateralVaultPDA,
        considerationVault: considerationVaultPDA,
        userOptionAccount: userOptionAccount,
        userRedemptionAccount: userRedemptionAccount,
        userCollateralAccount: userCollateralAccount,
        userConsiderationAccount: userConsiderationAccount,
      })
      .rpc();

    console.log("Transaction signature:", tx);

    // Verify balances
    const finalOption = await getAccount(
      provider.connection,
      userOptionAccount
    );
    const finalRedemption = await getAccount(
      provider.connection,
      userRedemptionAccount
    );
    const finalCollateral = await getAccount(
      provider.connection,
      userCollateralAccount
    );
    const finalSupply = (
      await program.account.optionData.fetch(optionContextPDA)
    ).totalSupply;

    // Both tokens burned
    expect(BigInt(initialOption.amount) - BigInt(finalOption.amount)).to.equal(
      BigInt(burnAmount.toString())
    );
    expect(
      BigInt(initialRedemption.amount) - BigInt(finalRedemption.amount)
    ).to.equal(BigInt(burnAmount.toString()));

    // User received 1:1 collateral refund
    expect(
      BigInt(finalCollateral.amount) - BigInt(initialCollateral.amount)
    ).to.equal(BigInt(burnAmount.toString()));

    // Total supply decreased
    expect(
      BigInt(initialSupply.toString()) - BigInt(finalSupply.toString())
    ).to.equal(BigInt(burnAmount.toString()));

    console.log("✓ Paired tokens burned successfully");
    console.log("  New total supply:", finalSupply.toString());
  });

  it("Shows protocol state summary", async () => {
    console.log("\n=== PROTOCOL STATE SUMMARY ===");

    const optionContext = await program.account.optionData.fetch(
      optionContextPDA
    );
    const collateralVault = await getAccount(
      provider.connection,
      collateralVaultPDA
    );
    const considerationVault = await getAccount(
      provider.connection,
      considerationVaultPDA
    );
    const userOption = await getAccount(provider.connection, userOptionAccount);
    const userRedemption = await getAccount(
      provider.connection,
      userRedemptionAccount
    );

    console.log("\nOption Series:");
    console.log("  Total Supply:", optionContext.totalSupply.toString());
    console.log(
      "  Exercised Amount:",
      optionContext.exercisedAmount.toString()
    );
    console.log(
      "  Collateral Vault Balance:",
      collateralVault.amount.toString()
    );
    console.log(
      "  Consideration Vault Balance:",
      considerationVault.amount.toString()
    );

    console.log("\nUser Balances:");
    console.log("  Option Tokens:", userOption.amount.toString());
    console.log("  Redemption Tokens:", userRedemption.amount.toString());

    console.log("\n✓ All tests passed!");
  });
});
