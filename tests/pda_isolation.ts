/**
 * PDA Isolation & Multi-Series Test Suite
 *
 * This test suite serves as executable documentation proving that:
 * 1. Different option parameters create unique PDAs
 * 2. Multiple option series operate independently
 * 3. State, vaults, and mints are properly isolated per series
 *
 * Run with: npm run test:pda-isolation
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

describe("PDA Isolation & Multi-Series Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .SolOptionProtocol as Program<SolOptionProtocol>;
  const payer = provider.wallet as anchor.Wallet;

  // Test mints
  let collateralMint: PublicKey;
  let considerationMint: PublicKey;
  let alternateCollateralMint: PublicKey;

  // User token accounts
  let userCollateralAccount: PublicKey;
  let userConsiderationAccount: PublicKey;
  let userAlternateCollateralAccount: PublicKey;

  // Decimals
  const collateralDecimals = 5;
  const strikeDecimals = 6;
  const expirationOffset = 3600;

  // Option series A: BONK/USDC $0.04 strike, expiry T1, CALL
  let seriesA: {
    optionContext: PublicKey;
    optionMint: PublicKey;
    redemptionMint: PublicKey;
    collateralVault: PublicKey;
    considerationVault: PublicKey;
    userOptionAccount: PublicKey;
    userRedemptionAccount: PublicKey;
    strikePrice: anchor.BN;
    expiration: anchor.BN;
    isPut: boolean;
  };

  // Option series B: BONK/USDC $0.05 strike, expiry T1, CALL (different strike)
  let seriesB: {
    optionContext: PublicKey;
    optionMint: PublicKey;
    redemptionMint: PublicKey;
    collateralVault: PublicKey;
    considerationVault: PublicKey;
    userOptionAccount: PublicKey;
    userRedemptionAccount: PublicKey;
    strikePrice: anchor.BN;
    expiration: anchor.BN;
    isPut: boolean;
  };

  // Option series C: BONK/USDC $0.04 strike, expiry T2, CALL (different expiry)
  let seriesC: {
    optionContext: PublicKey;
    optionMint: PublicKey;
    redemptionMint: PublicKey;
    collateralVault: PublicKey;
    considerationVault: PublicKey;
    userOptionAccount: PublicKey;
    userRedemptionAccount: PublicKey;
    strikePrice: anchor.BN;
    expiration: anchor.BN;
    isPut: boolean;
  };

  before(async () => {
    console.log("\n=== SETUP: Creating Test Environment ===");

    // Create collateral mint (BONK with 5 decimals)
    collateralMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      collateralDecimals
    );
    console.log("Collateral mint (BONK):", collateralMint.toString());

    // Create alternate collateral mint for additional tests
    alternateCollateralMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      collateralDecimals
    );
    console.log(
      "Alternate collateral mint:",
      alternateCollateralMint.toString()
    );

    // Create consideration mint (USDC with 6 decimals)
    considerationMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      strikeDecimals
    );
    console.log("Consideration mint (USDC):", considerationMint.toString());

    // Create user token accounts
    const userCollateralATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      collateralMint,
      payer.publicKey
    );
    userCollateralAccount = userCollateralATA.address;

    const userAlternateCollateralATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      alternateCollateralMint,
      payer.publicKey
    );
    userAlternateCollateralAccount = userAlternateCollateralATA.address;

    const userConsiderationATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      considerationMint,
      payer.publicKey
    );
    userConsiderationAccount = userConsiderationATA.address;

    // Mint initial tokens
    await mintTo(
      provider.connection,
      payer.payer,
      collateralMint,
      userCollateralAccount,
      payer.publicKey,
      10_000_000_00000 // 10M BONK
    );

    await mintTo(
      provider.connection,
      payer.payer,
      alternateCollateralMint,
      userAlternateCollateralAccount,
      payer.publicKey,
      10_000_000_00000 // 10M alternate tokens
    );

    await mintTo(
      provider.connection,
      payer.payer,
      considerationMint,
      userConsiderationAccount,
      payer.publicKey,
      100_000_000000 // 100K USDC
    );

    console.log("✓ Test environment setup complete\n");
  });

  describe("1. Strike Price Isolation", () => {
    it("Creates option series A with $0.04 strike", async () => {
      console.log("\n=== TEST: Creating Series A ($0.04 strike) ===");

      const currentTime = Math.floor(Date.now() / 1000);
      const strikePrice = new BN(40_000); // $0.04
      const expiration = new BN(currentTime + expirationOffset);
      const isPut = false;

      // Derive PDAs
      const [optionContextPDA] = PublicKey.findProgramAddressSync(
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

      const [optionMintPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("option_mint"), optionContextPDA.toBuffer()],
        program.programId
      );

      const [redemptionMintPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("redemption_mint"), optionContextPDA.toBuffer()],
        program.programId
      );

      const [collateralVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("collateral_vault"), optionContextPDA.toBuffer()],
        program.programId
      );

      const [considerationVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("consideration_vault"), optionContextPDA.toBuffer()],
        program.programId
      );

      console.log("Series A Option Context:", optionContextPDA.toString());
      console.log("Series A Option Mint:", optionMintPDA.toString());
      console.log("Series A Redemption Mint:", redemptionMintPDA.toString());

      // Create option series
      await program.methods
        .createOption(
          collateralMint,
          considerationMint,
          strikePrice,
          expiration,
          false
        )
        .accounts({
          optionContext: optionContextPDA,
          collateralMint: collateralMint,
          considerationMint: considerationMint,
        })
        .rpc();

      // Verify creation
      const optionContext = await program.account.optionData.fetch(
        optionContextPDA
      );
      expect(optionContext.strikePrice.toString()).to.equal(
        strikePrice.toString()
      );
      expect(optionContext.expiration.toString()).to.equal(
        expiration.toString()
      );

      // Store for later tests
      seriesA = {
        optionContext: optionContextPDA,
        optionMint: optionMintPDA,
        redemptionMint: redemptionMintPDA,
        collateralVault: collateralVaultPDA,
        considerationVault: considerationVaultPDA,
        userOptionAccount: PublicKey.default,
        userRedemptionAccount: PublicKey.default,
        strikePrice,
        expiration,
        isPut,
      };

      console.log("✓ Series A created successfully");
    });

    it("Creates option series B with $0.05 strike", async () => {
      console.log("\n=== TEST: Creating Series B ($0.05 strike) ===");

      const currentTime = Math.floor(Date.now() / 1000);
      const strikePrice = new BN(50_000); // $0.05 (different from A)
      const expiration = new BN(currentTime + expirationOffset);
      const isPut = false;

      // Derive PDAs
      const [optionContextPDA] = PublicKey.findProgramAddressSync(
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

      const [optionMintPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("option_mint"), optionContextPDA.toBuffer()],
        program.programId
      );

      const [redemptionMintPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("redemption_mint"), optionContextPDA.toBuffer()],
        program.programId
      );

      const [collateralVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("collateral_vault"), optionContextPDA.toBuffer()],
        program.programId
      );

      const [considerationVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("consideration_vault"), optionContextPDA.toBuffer()],
        program.programId
      );

      console.log("Series B Option Context:", optionContextPDA.toString());
      console.log("Series B Option Mint:", optionMintPDA.toString());
      console.log("Series B Redemption Mint:", redemptionMintPDA.toString());

      // Create option series
      await program.methods
        .createOption(
          collateralMint,
          considerationMint,
          strikePrice,
          expiration,
          false
        )
        .accounts({
          optionContext: optionContextPDA,
          collateralMint: collateralMint,
          considerationMint: considerationMint,
        })
        .rpc();

      // Verify creation
      const optionContext = await program.account.optionData.fetch(
        optionContextPDA
      );
      expect(optionContext.strikePrice.toString()).to.equal(
        strikePrice.toString()
      );

      // Store for later tests
      seriesB = {
        optionContext: optionContextPDA,
        optionMint: optionMintPDA,
        redemptionMint: redemptionMintPDA,
        collateralVault: collateralVaultPDA,
        considerationVault: considerationVaultPDA,
        userOptionAccount: PublicKey.default,
        userRedemptionAccount: PublicKey.default,
        strikePrice,
        expiration,
        isPut,
      };

      console.log("✓ Series B created successfully");
    });

    it("Verifies series A and B have different PDAs", async () => {
      console.log(
        "\n=== TEST: Verifying PDA Isolation (Different Strikes) ==="
      );

      // Option context PDAs must be different
      expect(seriesA.optionContext.toString()).to.not.equal(
        seriesB.optionContext.toString()
      );
      console.log(
        "✓ Option context PDAs differ:",
        "\n  Series A:",
        seriesA.optionContext.toString(),
        "\n  Series B:",
        seriesB.optionContext.toString()
      );

      // Option mint PDAs must be different
      expect(seriesA.optionMint.toString()).to.not.equal(
        seriesB.optionMint.toString()
      );
      console.log("✓ Option mint PDAs differ");

      // Redemption mint PDAs must be different
      expect(seriesA.redemptionMint.toString()).to.not.equal(
        seriesB.redemptionMint.toString()
      );
      console.log("✓ Redemption mint PDAs differ");

      // Vault PDAs must be different
      expect(seriesA.collateralVault.toString()).to.not.equal(
        seriesB.collateralVault.toString()
      );
      expect(seriesA.considerationVault.toString()).to.not.equal(
        seriesB.considerationVault.toString()
      );
      console.log("✓ Vault PDAs differ");
    });
  });

  describe("2. Expiration Isolation", () => {
    it("Creates option series C with different expiration", async () => {
      console.log("\n=== TEST: Creating Series C (Different Expiration) ===");

      const currentTime = Math.floor(Date.now() / 1000);
      const strikePrice = new BN(40_000); // Same as A
      const expiration = new BN(currentTime + expirationOffset * 2); // Different expiry
      const isPut = false;

      // Derive PDAs
      const [optionContextPDA] = PublicKey.findProgramAddressSync(
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

      const [optionMintPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("option_mint"), optionContextPDA.toBuffer()],
        program.programId
      );

      const [redemptionMintPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("redemption_mint"), optionContextPDA.toBuffer()],
        program.programId
      );

      const [collateralVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("collateral_vault"), optionContextPDA.toBuffer()],
        program.programId
      );

      const [considerationVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("consideration_vault"), optionContextPDA.toBuffer()],
        program.programId
      );

      console.log("Series C Option Context:", optionContextPDA.toString());

      // Create option series
      await program.methods
        .createOption(
          collateralMint,
          considerationMint,
          strikePrice,
          expiration,
          false
        )
        .accounts({
          optionContext: optionContextPDA,
          collateralMint: collateralMint,
          considerationMint: considerationMint,
        })
        .rpc();

      // Store for later tests
      seriesC = {
        optionContext: optionContextPDA,
        optionMint: optionMintPDA,
        redemptionMint: redemptionMintPDA,
        collateralVault: collateralVaultPDA,
        considerationVault: considerationVaultPDA,
        userOptionAccount: PublicKey.default,
        userRedemptionAccount: PublicKey.default,
        strikePrice,
        expiration,
        isPut,
      };

      console.log("✓ Series C created successfully");
    });

    it("Verifies series A and C have different PDAs despite same strike", async () => {
      console.log(
        "\n=== TEST: Verifying PDA Isolation (Different Expirations) ==="
      );

      // Option context PDAs must be different
      expect(seriesA.optionContext.toString()).to.not.equal(
        seriesC.optionContext.toString()
      );
      console.log(
        "✓ Option context PDAs differ:",
        "\n  Series A (expiry T1):",
        seriesA.optionContext.toString(),
        "\n  Series C (expiry T2):",
        seriesC.optionContext.toString()
      );

      // All derived PDAs must also be different
      expect(seriesA.optionMint.toString()).to.not.equal(
        seriesC.optionMint.toString()
      );
      expect(seriesA.redemptionMint.toString()).to.not.equal(
        seriesC.redemptionMint.toString()
      );
      expect(seriesA.collateralVault.toString()).to.not.equal(
        seriesC.collateralVault.toString()
      );
      console.log("✓ All derived PDAs differ");
    });
  });

  describe("3. Independent Minting", () => {
    it("Mints 10K options on series A", async () => {
      console.log("\n=== TEST: Minting on Series A ===");

      const mintAmount = new BN(10000_00000); // 10K BONK

      // Create user token accounts for series A
      const userOptionATA = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        seriesA.optionMint,
        payer.publicKey
      );
      seriesA.userOptionAccount = userOptionATA.address;

      const userRedemptionATA = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        seriesA.redemptionMint,
        payer.publicKey
      );
      seriesA.userRedemptionAccount = userRedemptionATA.address;

      // Mint options
      await program.methods
        .mint(mintAmount)
        .accounts({
          user: payer.publicKey,
          optionContext: seriesA.optionContext,
          collateralMint: collateralMint,
          considerationMint: considerationMint,
          optionMint: seriesA.optionMint,
          redemptionMint: seriesA.redemptionMint,
          collateralVault: seriesA.collateralVault,
          considerationVault: seriesA.considerationVault,
          userCollateralAccount: userCollateralAccount,
          userOptionAccount: seriesA.userOptionAccount,
          userRedemptionAccount: seriesA.userRedemptionAccount,
          userConsiderationAccount: userConsiderationAccount,
        })
        .rpc();

      // Verify series A state
      const optionContextA = await program.account.optionData.fetch(
        seriesA.optionContext
      );
      expect(optionContextA.totalSupply.toString()).to.equal(
        mintAmount.toString()
      );

      console.log("✓ Series A minted 10K options");
      console.log(
        "  Series A total supply:",
        optionContextA.totalSupply.toString()
      );
    });

    it("Mints 20K options on series B", async () => {
      console.log("\n=== TEST: Minting on Series B ===");

      const mintAmount = new BN(20000_00000); // 20K BONK

      // Create user token accounts for series B
      const userOptionATA = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        seriesB.optionMint,
        payer.publicKey
      );
      seriesB.userOptionAccount = userOptionATA.address;

      const userRedemptionATA = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        seriesB.redemptionMint,
        payer.publicKey
      );
      seriesB.userRedemptionAccount = userRedemptionATA.address;

      // Mint options
      await program.methods
        .mint(mintAmount)
        .accounts({
          user: payer.publicKey,
          optionContext: seriesB.optionContext,
          collateralMint: collateralMint,
          considerationMint: considerationMint,
          optionMint: seriesB.optionMint,
          redemptionMint: seriesB.redemptionMint,
          collateralVault: seriesB.collateralVault,
          considerationVault: seriesB.considerationVault,
          userCollateralAccount: userCollateralAccount,
          userOptionAccount: seriesB.userOptionAccount,
          userRedemptionAccount: seriesB.userRedemptionAccount,
          userConsiderationAccount: userConsiderationAccount,
        })
        .rpc();

      // Verify series B state
      const optionContextB = await program.account.optionData.fetch(
        seriesB.optionContext
      );
      expect(optionContextB.totalSupply.toString()).to.equal(
        mintAmount.toString()
      );

      console.log("✓ Series B minted 20K options");
      console.log(
        "  Series B total supply:",
        optionContextB.totalSupply.toString()
      );
    });

    it("Verifies series A and B have independent supplies", async () => {
      console.log("\n=== TEST: Verifying Independent Supplies ===");

      const optionContextA = await program.account.optionData.fetch(
        seriesA.optionContext
      );
      const optionContextB = await program.account.optionData.fetch(
        seriesB.optionContext
      );

      // Series A should have 10K
      expect(optionContextA.totalSupply.toString()).to.equal("1000000000");
      console.log("✓ Series A supply: 10K (unchanged)");

      // Series B should have 20K
      expect(optionContextB.totalSupply.toString()).to.equal("2000000000");
      console.log("✓ Series B supply: 20K (unchanged)");

      // Verify vault isolation
      const vaultA = await getAccount(
        provider.connection,
        seriesA.collateralVault
      );
      const vaultB = await getAccount(
        provider.connection,
        seriesB.collateralVault
      );

      expect(vaultA.amount.toString()).to.equal("1000000000");
      expect(vaultB.amount.toString()).to.equal("2000000000");
      console.log("✓ Vault balances are isolated");
    });
  });

  describe("4. Independent Exercise", () => {
    it("Exercises 5K options on series A", async () => {
      console.log("\n=== TEST: Exercising on Series A ===");

      const exerciseAmount = new BN(5000_00000); // 5K BONK

      // Get initial state
      const initialContext = await program.account.optionData.fetch(
        seriesA.optionContext
      );

      // Exercise options
      await program.methods
        .exercise(exerciseAmount)
        .accounts({
          user: payer.publicKey,
          optionContext: seriesA.optionContext,
          collateralMint: collateralMint,
          considerationMint: considerationMint,
          optionMint: seriesA.optionMint,
          redemptionMint: seriesA.redemptionMint,
          collateralVault: seriesA.collateralVault,
          considerationVault: seriesA.considerationVault,
          userOptionAccount: seriesA.userOptionAccount,
          userRedemptionAccount: seriesA.userRedemptionAccount,
          userConsiderationAccount: userConsiderationAccount,
          userCollateralAccount: userCollateralAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Verify series A state
      const finalContext = await program.account.optionData.fetch(
        seriesA.optionContext
      );
      expect(finalContext.exercisedAmount.toString()).to.equal(
        exerciseAmount.toString()
      );

      console.log("✓ Series A exercised 5K options");
      console.log(
        "  Series A exercised amount:",
        finalContext.exercisedAmount.toString()
      );
    });

    it("Verifies series B is unaffected by series A exercise", async () => {
      console.log("\n=== TEST: Verifying Series B Unaffected ===");

      const optionContextB = await program.account.optionData.fetch(
        seriesB.optionContext
      );

      // Series B should have 0 exercised amount
      expect(optionContextB.exercisedAmount.toString()).to.equal("0");
      console.log("✓ Series B exercised amount: 0 (unchanged)");

      // Series B should still have 20K supply
      expect(optionContextB.totalSupply.toString()).to.equal("2000000000");
      console.log("✓ Series B supply: 20K (unchanged)");

      // Series B vault should be unchanged
      const vaultB = await getAccount(
        provider.connection,
        seriesB.collateralVault
      );
      expect(vaultB.amount.toString()).to.equal("2000000000");
      console.log("✓ Series B vault: 20K (unchanged)");
    });
  });

  describe("5. Independent Burn", () => {
    it("Burns 2K paired tokens on series B", async () => {
      console.log("\n=== TEST: Burning on Series B ===");

      const burnAmount = new BN(2000_00000); // 2K BONK

      // Get initial state
      const initialContext = await program.account.optionData.fetch(
        seriesB.optionContext
      );

      // Burn paired tokens
      await program.methods
        .burn(burnAmount)
        .accounts({
          user: payer.publicKey,
          optionContext: seriesB.optionContext,
          collateralMint: collateralMint,
          considerationMint: considerationMint,
          optionMint: seriesB.optionMint,
          redemptionMint: seriesB.redemptionMint,
          collateralVault: seriesB.collateralVault,
          considerationVault: seriesB.considerationVault,
          userOptionAccount: seriesB.userOptionAccount,
          userRedemptionAccount: seriesB.userRedemptionAccount,
          userCollateralAccount: userCollateralAccount,
          userConsiderationAccount: userConsiderationAccount,
        })
        .rpc();

      // Verify series B state
      const finalContext = await program.account.optionData.fetch(
        seriesB.optionContext
      );
      const expectedSupply = initialContext.totalSupply.sub(burnAmount);
      expect(finalContext.totalSupply.toString()).to.equal(
        expectedSupply.toString()
      );

      console.log("✓ Series B burned 2K paired tokens");
      console.log(
        "  Series B new supply:",
        finalContext.totalSupply.toString()
      );
    });

    it("Verifies series A is unaffected by series B burn", async () => {
      console.log("\n=== TEST: Verifying Series A Unaffected ===");

      const optionContextA = await program.account.optionData.fetch(
        seriesA.optionContext
      );

      // Series A should still have 10K supply
      expect(optionContextA.totalSupply.toString()).to.equal("1000000000");
      console.log("✓ Series A supply: 10K (unchanged)");

      // Series A should still have 5K exercised
      expect(optionContextA.exercisedAmount.toString()).to.equal("500000000");
      console.log("✓ Series A exercised amount: 5K (unchanged)");
    });
  });

  describe("6. Comprehensive State Verification", () => {
    it("Displays complete state of all three series", async () => {
      console.log("\n=== TEST: Comprehensive State Summary ===");

      const stateA = await program.account.optionData.fetch(
        seriesA.optionContext
      );
      const stateB = await program.account.optionData.fetch(
        seriesB.optionContext
      );
      const stateC = await program.account.optionData.fetch(
        seriesC.optionContext
      );

      const vaultA = await getAccount(
        provider.connection,
        seriesA.collateralVault
      );
      const vaultB = await getAccount(
        provider.connection,
        seriesB.collateralVault
      );
      const vaultC = await getAccount(
        provider.connection,
        seriesC.collateralVault
      );

      console.log("\n│ Series │ Strike │ Supply    │ Exercised │ Vault     │");
      console.log("├────────┼────────┼───────────┼───────────┼───────────┤");
      console.log(
        "│   A    │ $0.04  │",
        stateA.totalSupply.toString().padEnd(9),
        "│",
        stateA.exercisedAmount.toString().padEnd(9),
        "│",
        vaultA.amount.toString().padEnd(9),
        "│"
      );
      console.log(
        "│   B    │ $0.05  │",
        stateB.totalSupply.toString().padEnd(9),
        "│",
        stateB.exercisedAmount.toString().padEnd(9),
        "│",
        vaultB.amount.toString().padEnd(9),
        "│"
      );
      console.log(
        "│   C    │ $0.04  │",
        stateC.totalSupply.toString().padEnd(9),
        "│",
        stateC.exercisedAmount.toString().padEnd(9),
        "│",
        vaultC.amount.toString().padEnd(9),
        "│"
      );

      // Verify isolation
      expect(stateA.totalSupply.toString()).to.equal("1000000000");
      expect(stateA.exercisedAmount.toString()).to.equal("500000000");
      expect(stateB.totalSupply.toString()).to.equal("1800000000");
      expect(stateB.exercisedAmount.toString()).to.equal("0");
      expect(stateC.totalSupply.toString()).to.equal("0");
      expect(stateC.exercisedAmount.toString()).to.equal("0");

      console.log("\n✓ All series maintain independent state");
    });

    it("Verifies all PDAs are unique across all series", async () => {
      console.log("\n=== TEST: Final PDA Uniqueness Verification ===");

      const allPDAs = [
        { name: "Series A Context", pda: seriesA.optionContext },
        { name: "Series B Context", pda: seriesB.optionContext },
        { name: "Series C Context", pda: seriesC.optionContext },
        { name: "Series A Option Mint", pda: seriesA.optionMint },
        { name: "Series B Option Mint", pda: seriesB.optionMint },
        { name: "Series C Option Mint", pda: seriesC.optionMint },
        { name: "Series A Redemption Mint", pda: seriesA.redemptionMint },
        { name: "Series B Redemption Mint", pda: seriesB.redemptionMint },
        { name: "Series C Redemption Mint", pda: seriesC.redemptionMint },
      ];

      // Verify all PDAs are unique
      const pdaSet = new Set(allPDAs.map((item) => item.pda.toString()));
      expect(pdaSet.size).to.equal(allPDAs.length);

      console.log("✓ All", allPDAs.length, "PDAs are unique");
      console.log("\n✓ PDA ISOLATION VERIFIED");
      console.log("✓ MULTI-SERIES INDEPENDENCE VERIFIED");
      console.log("✓ ALL TESTS PASSED");
    });
  });
});
