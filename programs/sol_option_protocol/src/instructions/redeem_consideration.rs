use anchor_lang::prelude::*;
use anchor_spl::token_interface::{ TransferChecked};
use anchor_spl::token_interface as token;


use crate::instructions::OptionContext;
use crate::errors::ErrorCode;
use crate::utils::math::calculate_pro_rata_share_u128;

/// Allows SHORT token holders to claim their pro-rata share of consideration
/// Greek.fi compliance: Key capital efficiency feature for option writers

pub fn handler(ctx: Context<OptionContext>) -> Result<()> {
    let option_context = &ctx.accounts.option_context;

    // Validation: User must have SHORT tokens
    let user_short_balance = ctx.accounts.user_consideration_account.amount;
    require!(user_short_balance > 0, ErrorCode::NoShortTokens);

    // Validation: Consideration vault must have funds
    let consideration_vault_balance = ctx.accounts.consideration_vault.amount;
    require!(consideration_vault_balance > 0, ErrorCode::NoCashAvailable);

    // Calculate user's total share using utils pro-rata formula
    let user_total_share = calculate_pro_rata_share_u128(
        consideration_vault_balance,
        user_short_balance,
        option_context.total_supply,
    )?;


    // Transfer consideration from vault to user (OptionSeries PDA signs)
    let option_series_key = option_context.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"option_context",
        option_context.collateral_mint.as_ref(),
        option_context.consideration_mint.as_ref(),
        &option_context.strike_price.to_le_bytes(),
        &option_context.expiration.to_le_bytes(),
        &[option_context.is_put as u8],
        &[option_context.bump],
    ]];

    let transfer_accounts = TransferChecked {
        from: ctx.accounts.consideration_vault.to_account_info(),
        mint: ctx.accounts.consideration_mint.to_account_info(),
        to: ctx.accounts.user_consideration_account.to_account_info(),
        authority: option_context.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
        signer_seeds,
    );

    let vault_balance_u128 = ctx.accounts.consideration_vault.amount as u128;
    let claimable_u128 = core::cmp::min(user_total_share as u128, vault_balance_u128);
    let claimable = claimable_u128 as u64;
    require!(claimable > 0, ErrorCode::NoCashAvailable);


    token::transfer_checked(
        cpi_ctx,
        claimable,
        ctx.accounts.consideration_mint.decimals,
    )?;

    // Update tracking (OptionSeries bookkeeping)


    msg!(
        "User {} claimed {} consideration from option series {}",
        ctx.accounts.user.key(),
        claimable,
        option_series_key
    );
    Ok(())
}
