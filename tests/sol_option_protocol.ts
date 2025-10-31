import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolOptionProtocol } from "../target/types/sol_option_protocol";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("sol_option_protocol - Phase 1: Custody", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .SolOptionProtocol as Program<SolOptionProtocol>;
  const payer = provider.wallet as anchor.Wallet;

  // Test accounts
  let underlyingMint: PublicKey;
  let userUnderlyingAccount: PublicKey;
  let optionSeriesPda: PublicKey;
  let collateralVaultPda: PublicKey;

  // Test parameters
  const strikePrice = new anchor.BN(4_000_000); // 4 cents (6 decimals)
  const expirationDays = 30;
  const depositAmount = new anchor.BN(1_000_000); // 1 million tokens

  before(async () => {
    // Create underlying token mint (simulating BONK with 5 decimals)
    underlyingMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      5, // BONK has 5 decimals
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("Created underlying mint:", underlyingMint.toString());

    // Create user token account
    userUnderlyingAccount = await createAccount(
      provider.connection,
      payer.payer,
      underlyingMint,
      payer.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Mint some tokens to user
    await mintTo(
      provider.connection,
      payer.payer,
      underlyingMint,
      userUnderlyingAccount,
      payer.publicKey,
      10_000_000, // 10 million tokens
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("Minted tokens to user:", userUnderlyingAccount.toString());
  });

  it("Creates an option series with collateral vault", async () => {
    // Calculate expiration (30 days from now)
    const expiration = new anchor.BN(
      Math.floor(Date.now() / 1000) + expirationDays * 24 * 60 * 60
    );

    // Derive option series PDA
    [optionSeriesPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("option_series"),
        underlyingMint.toBuffer(),
        strikePrice.toArrayLike(Buffer, "le", 8),
        expiration.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // Derive collateral vault PDA
    [collateralVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("collateral_vault"), optionSeriesPda.toBuffer()],
      program.programId
    );

    console.log("Option Series PDA:", optionSeriesPda.toString());
    console.log("Collateral Vault PDA:", collateralVaultPda.toString());

    // Create option series (call option: is_put = false)
    const tx = await program.methods
      .createOptionSeries(strikePrice, expiration, false)
      .accounts({
        payer: payer.publicKey,
        optionSeries: optionSeriesPda,
        underlyingMint: underlyingMint,
        collateralVault: collateralVaultPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("Create option series tx:", tx);

    // Fetch and verify the option series account
    const optionSeries = await program.account.optionSeries.fetch(
      optionSeriesPda
    );

    assert.equal(
      optionSeries.underlyingMint.toString(),
      underlyingMint.toString(),
      "Underlying mint mismatch"
    );
    assert.equal(
      optionSeries.strikePrice.toString(),
      strikePrice.toString(),
      "Strike price mismatch"
    );
    assert.equal(
      optionSeries.expiration.toString(),
      expiration.toString(),
      "Expiration mismatch"
    );
    assert.equal(
      optionSeries.collateralVault.toString(),
      collateralVaultPda.toString(),
      "Collateral vault mismatch"
    );
    assert.equal(
      optionSeries.totalDeposited.toString(),
      "0",
      "Initial deposit should be 0"
    );

    console.log("✅ Option series created successfully");
  });

  it("Deposits collateral into the vault", async () => {
    console.log("Depositing amount:", depositAmount.toString());

    // Get initial balances
    const userBalanceBefore = await getAccount(
      provider.connection,
      userUnderlyingAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log("User balance before:", userBalanceBefore.amount.toString());

    // Deposit collateral
    const tx = await program.methods
      .depositCollateral(depositAmount)
      .accounts({
        user: payer.publicKey,
        optionSeries: optionSeriesPda,
        underlyingMint: underlyingMint,
        collateralVault: collateralVaultPda,
        userUnderlyingAccount: userUnderlyingAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("Deposit collateral tx:", tx);

    // Verify balances changed
    const userBalanceAfter = await getAccount(
      provider.connection,
      userUnderlyingAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    const vaultBalance = await getAccount(
      provider.connection,
      collateralVaultPda,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("User balance after:", userBalanceAfter.amount.toString());
    console.log("Vault balance:", vaultBalance.amount.toString());

    assert.equal(
      (userBalanceBefore.amount - userBalanceAfter.amount).toString(),
      depositAmount.toString(),
      "User balance should decrease by deposit amount"
    );
    assert.equal(
      vaultBalance.amount.toString(),
      depositAmount.toString(),
      "Vault should receive deposit amount"
    );

    // Verify option series state updated
    const optionSeries = await program.account.optionSeries.fetch(
      optionSeriesPda
    );
    assert.equal(
      optionSeries.totalDeposited.toString(),
      depositAmount.toString(),
      "Total deposited should match"
    );

    console.log("✅ Collateral deposited successfully");
  });

  it("Allows multiple deposits", async () => {
    const secondDeposit = new anchor.BN(500_000);

    // Get current state
    const optionSeriesBefore = await program.account.optionSeries.fetch(
      optionSeriesPda
    );
    const vaultBefore = await getAccount(
      provider.connection,
      collateralVaultPda,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Make second deposit
    await program.methods
      .depositCollateral(secondDeposit)
      .accounts({
        user: payer.publicKey,
        optionSeries: optionSeriesPda,
        underlyingMint: underlyingMint,
        collateralVault: collateralVaultPda,
        userUnderlyingAccount: userUnderlyingAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    // Verify cumulative state
    const optionSeriesAfter = await program.account.optionSeries.fetch(
      optionSeriesPda
    );
    const vaultAfter = await getAccount(
      provider.connection,
      collateralVaultPda,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const expectedTotal = optionSeriesBefore.totalDeposited.add(secondDeposit);

    assert.equal(
      optionSeriesAfter.totalDeposited.toString(),
      expectedTotal.toString(),
      "Total deposited should be cumulative"
    );

    assert.equal(
      (vaultAfter.amount - vaultBefore.amount).toString(),
      secondDeposit.toString(),
      "Vault should receive second deposit"
    );

    console.log("✅ Multiple deposits work correctly");
    console.log(
      "Total deposited:",
      optionSeriesAfter.totalDeposited.toString()
    );
  });

  it("Rejects zero amount deposits", async () => {
    try {
      await program.methods
        .depositCollateral(new anchor.BN(0))
        .accounts({
          user: payer.publicKey,
          optionSeries: optionSeriesPda,
          underlyingMint: underlyingMint,
          collateralVault: collateralVaultPda,
          userUnderlyingAccount: userUnderlyingAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      assert.fail("Should have rejected zero amount");
    } catch (err) {
      assert.include(err.toString(), "InvalidAmount");
      console.log("✅ Correctly rejected zero amount deposit");
    }
  });
});
