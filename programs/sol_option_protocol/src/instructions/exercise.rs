use anchor_lang::prelude::*;
use anchor_spl::token_interface as token;

use crate::instructions::OptionContext;
use crate::errors::ErrorCode;
use crate::utils::{
    math::calculate_strike_payment,
    validation::{validate_amount, validate_vault_balance},
};

/// Exercises American call options by paying strike price to receive collateral
/// User burns option tokens + pays strike → receives collateral
pub fn handler(ctx: Context<OptionContext>, amount: u64) -> Result<()> {
    // Validation
    validate_amount(amount)?;
    validate_vault_balance(ctx.accounts.collateral_vault.amount, amount)?;

    let option_context = &ctx.accounts.option_context;

    // Get mint decimals
    let collateral_decimals = ctx.accounts.collateral_mint.decimals;
    let strike_decimals = ctx.accounts.consideration_mint.decimals;

    // Calculate required strike payment
    // Formula: (amount × strike_price) / 10^collateral_decimals
    // Example: 100 BONK × $0.04 = $4 USDC
    let strike_payment = calculate_strike_payment(
        amount,
        option_context.strike_price,
        collateral_decimals,
    )?;

    // 1. Burn option tokens from user (destroys the right to exercise)
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Burn {
                mint: ctx.accounts.option_mint.to_account_info(),
                from: ctx.accounts.user_option_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // 2. Transfer strike payment from user to consideration vault
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::TransferChecked {
                from: ctx.accounts.user_consideration_account.to_account_info(),
                mint: ctx.accounts.consideration_mint.to_account_info(),
                to: ctx.accounts.consideration_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        strike_payment,
        strike_decimals,
    )?;

    // 3. Transfer collateral from vault to user (OptionContext PDA signs)
    let collateral_mint_key = option_context.collateral_mint;
    let consideration_mint_key = option_context.consideration_mint;
    let strike_price_bytes = option_context.strike_price.to_le_bytes();
    let expiration_bytes = option_context.expiration.to_le_bytes();
    let is_put_byte = [option_context.is_put as u8];
    let bump = option_context.bump;

    let signer_seeds: &[&[&[u8]]] = &[&[
        b"option_context",
        collateral_mint_key.as_ref(),
        consideration_mint_key.as_ref(),
        strike_price_bytes.as_ref(),
        expiration_bytes.as_ref(),
        &is_put_byte,
        &[bump],
    ]];

    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::TransferChecked {
                from: ctx.accounts.collateral_vault.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.user_collateral_account.to_account_info(),
                authority: option_context.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        collateral_decimals,
    )?;

    // 4. Update exercised amount (OptionContext bookkeeping)
    let option_context = &mut ctx.accounts.option_context;
    option_context.exercised_amount = option_context
        .exercised_amount
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    msg!(
        "Exercised {} options. Strike payment: {}. Total exercised: {}",
        amount,
        strike_payment,
        option_context.exercised_amount
    );

    Ok(())
}
