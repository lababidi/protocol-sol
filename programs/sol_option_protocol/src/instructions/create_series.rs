use anchor_lang::prelude::*;

use crate::utils::validation::{validate_expiration, validate_strike_price};

use crate::instructions::OptionCreate;

pub fn handler(
    ctx: Context<OptionCreate>,
    collateral_mint_key: Pubkey,
    consideration_mint_key: Pubkey,
    strike_price: u64,
    expiration: i64,
    is_put: bool,
) -> Result<()> {
    // Validations using utils
    validate_expiration(expiration)?;
    validate_strike_price(strike_price)?;

    // Store all values in OptionContext
    let option_context = &mut ctx.accounts.option_context;

    // Core parameters
    option_context.collateral_mint = collateral_mint_key;
    option_context.consideration_mint = consideration_mint_key;
    option_context.strike_price = strike_price;
    option_context.expiration = expiration;
    option_context.is_put = is_put;

    // Store the mint keys (mints are already initialized by Anchor's init constraint)
    option_context.option_mint = ctx.accounts.option_mint.key();
    option_context.redemption_mint = ctx.accounts.redemption_mint.key();

    // Associated accounts (vaults) - custody only, logic in OptionSeries
    option_context.collateral_vault = ctx.accounts.collateral_vault.key();
    option_context.consideration_vault = ctx.accounts.consideration_vault.key();

    // State tracking
    option_context.total_supply = 0;
    option_context.exercised_amount = 0;

    // Store OptionContext PDA bump
    option_context.bump = ctx.bumps.option_context;

    msg!(
        "Created option series: {} @ {} (strike currency: {}) expiring {}",
        ctx.accounts.collateral_mint.key(),
        strike_price,
        ctx.accounts.consideration_mint.key(),
        expiration
    );
    msg!("Option mint: {}", ctx.accounts.option_mint.key());
    msg!("Redemption mint: {}", ctx.accounts.redemption_mint.key());

    Ok(())
}
