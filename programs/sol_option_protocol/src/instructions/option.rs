use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Core data struct stored on-chain representing an option series
///
/// PDA Seeds (used to derive the OptionContext address):
/// - "option_context"
/// - collateral_mint
/// - consideration_mint
/// - strike_price
/// - expiration
/// - is_put
///
/// Stored Data (NOT used in PDA derivation, but stored in the account):
/// - Derived PDAs (option_mint, redemption_mint, vaults)
/// - Runtime tracking (total_supply, exercised_amount)
#[account]
pub struct OptionData {
    // === CORE PARAMETERS (used in PDA derivation) ===
    pub collateral_mint: Pubkey,      // The collateral token mint
    pub consideration_mint: Pubkey,   // The strike currency mint (e.g., USDC)
    pub strike_price: u64,            // Strike price
    pub expiration: i64,              // Expiration timestamp
    pub is_put: bool,                 // Put or Call option
    pub bump: u8,                     // PDA bump seed

    // === DERIVED ADDRESSES (stored for convenience, NOT in PDA seeds) ===
    pub option_mint: Pubkey,          // Option token mint PDA
    pub redemption_mint: Pubkey,      // Redemption token mint PDA
    pub collateral_vault: Pubkey,     // Collateral vault PDA
    pub consideration_vault: Pubkey,  // Consideration vault PDA

    // === RUNTIME DATA (tracked over time) ===
    pub total_supply: u64,            // Total option tokens minted
    pub exercised_amount: u64,        // Total options exercised
}

/// Unified accounts struct for all option operations (mint, burn, exercise, redeem)
/// Client sends the OptionContext PDA and all account addresses are validated against stored values
#[derive(Accounts)]
pub struct OptionContext<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// The OptionContext PDA (client calculates and sends this)
    #[account(mut)]
    pub option_context: Account<'info, OptionData>,

    /// Collateral mint (validated against stored value in option_context)
    #[account(
        constraint = collateral_mint.key() == option_context.collateral_mint
    )]
    pub collateral_mint: Account<'info, Mint>,

    /// Consideration mint (validated against stored value in option_context)
    #[account(
        constraint = consideration_mint.key() == option_context.consideration_mint
    )]
    pub consideration_mint: Account<'info, Mint>,

    /// Option mint (validated against stored value in option_context)
    #[account(
        mut,
        constraint = option_mint.key() == option_context.option_mint
    )]
    pub option_mint: Account<'info, Mint>,

    /// Redemption mint (validated against stored value in option_context)
    #[account(
        mut,
        constraint = redemption_mint.key() == option_context.redemption_mint
    )]
    pub redemption_mint: Account<'info, Mint>,

    /// Collateral vault (validated against stored value in option_context)
    #[account(
        mut,
        constraint = collateral_vault.key() == option_context.collateral_vault
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    /// Consideration vault (validated against stored value in option_context)
    #[account(
        mut,
        constraint = consideration_vault.key() == option_context.consideration_vault
    )]
    pub consideration_vault: Account<'info, TokenAccount>,

    /// User's collateral token account
    #[account(mut)]
    pub user_collateral_account: Account<'info, TokenAccount>,

    /// User's consideration token account
    #[account(mut)]
    pub user_consideration_account: Account<'info, TokenAccount>,

    /// User's option token account
    #[account(mut)]
    pub user_option_account: Account<'info, TokenAccount>,

    /// User's redemption token account
    #[account(mut)]
    pub user_redemption_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}



#[derive(Accounts)]
#[instruction(
    collateral_mint_key: Pubkey,
    consideration_mint_key: Pubkey,
    strike_price: u64,
    expiration: i64,
    is_put: bool,
)]
pub struct OptionCreate<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// The OptionContext PDA - INITIALIZE it (create new account)
    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<OptionData>(),
        seeds = [
            b"option_context",
            collateral_mint_key.as_ref(),
            consideration_mint_key.as_ref(),
            strike_price.to_le_bytes().as_ref(),
            expiration.to_le_bytes().as_ref(),
            &[is_put as u8],
        ],
        bump
    )]
    pub option_context: Account<'info, OptionData>,

    /// Collateral mint (provided by client)
    pub collateral_mint: Account<'info, Mint>,

    /// Consideration/strike currency mint (provided by client)
    pub consideration_mint: Account<'info, Mint>,

    /// Option token mint PDA - INITIALIZE it
    #[account(
        init,
        payer = user,
        seeds = [b"option_mint", option_context.key().as_ref()],
        bump,
        mint::decimals = collateral_mint.decimals,
        mint::authority = option_context,
    )]
    pub option_mint: Account<'info, Mint>,

    /// Redemption token mint PDA - INITIALIZE it
    #[account(
        init,
        payer = user,
        seeds = [b"redemption_mint", option_context.key().as_ref()],
        bump,
        mint::decimals = collateral_mint.decimals,
        mint::authority = option_context,
    )]
    pub redemption_mint: Account<'info, Mint>,

    /// Collateral vault PDA - INITIALIZE it
    #[account(
        init,
        payer = user,
        seeds = [b"collateral_vault", option_context.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = option_context,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    /// Consideration vault PDA - INITIALIZE it
    #[account(
        init,
        payer = user,
        seeds = [b"consideration_vault", option_context.key().as_ref()],
        bump,
        token::mint = consideration_mint,
        token::authority = option_context,
    )]
    pub consideration_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}
