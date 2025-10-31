use anchor_lang::prelude::*;
use anchor_spl::token_interface as token;

use crate::instructions::option::OptionContext;
use crate::utils::validation::{validate_amount, validate_vault_balance};

/// Burns paired option + redemption tokens to reclaim 1:1 collateral anytime
/// Anytime: User burns both tokens → receives 1:1 collateral refund
pub fn handler(ctx: Context<OptionContext>, amount: u64) -> Result<()> {
    // Validation
    validate_amount(amount)?;
    validate_vault_balance(ctx.accounts.collateral_vault.amount, amount)?;

    // 1. Burn option tokens from user
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

    // 2. Burn redemption tokens from user
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Burn {
                mint: ctx.accounts.redemption_mint.to_account_info(),
                from: ctx.accounts.user_redemption_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // 3. Transfer collateral 1:1 from vault to user (OptionContext PDA signs)
    let option_context = &ctx.accounts.option_context;
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
        ctx.accounts.collateral_mint.decimals,
    )?;

    // 4. Update total supply (decrease by burned amount)
    let option_context = &mut ctx.accounts.option_context;
    option_context.total_supply = option_context
        .total_supply
        .checked_sub(amount)
        .ok_or_else(|| error!(crate::errors::ErrorCode::MathOverflow))?;

    msg!(
        "Burned {} paired tokens. Refunded: {} collateral. New total supply: {}",
        amount,
        amount,
        option_context.total_supply
    );

    Ok(())
}
