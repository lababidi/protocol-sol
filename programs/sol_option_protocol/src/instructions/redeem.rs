use anchor_lang::prelude::*;
use anchor_spl::token_interface as token;

use crate::instructions::OptionContext;
use crate::utils::{
    math::calculate_pro_rata_share,
    validation::{validate_amount, validate_expired},
};

/// Redeems redemption tokens for pro-rata share of vault assets after expiry
/// Post-expiry: User burns redemption tokens → receives pro-rata collateral + consideration
pub fn handler(ctx: Context<OptionContext>, amount: u64) -> Result<()> {
    // Validation
    validate_amount(amount)?;
    validate_expired(ctx.accounts.option_context.expiration)?;

    let option_context = &ctx.accounts.option_context;

    // Get mint decimals
    let collateral_decimals = ctx.accounts.collateral_mint.decimals;
    let strike_decimals = ctx.accounts.consideration_mint.decimals;

    // Get current vault balances
    let collateral_balance = ctx.accounts.collateral_vault.amount;
    let consideration_balance = ctx.accounts.consideration_vault.amount;

    // Calculate pro-rata shares using utils
    let collateral_payout = calculate_pro_rata_share(
        collateral_balance,
        amount,
        option_context.total_supply,
    )?;

    let consideration_payout = calculate_pro_rata_share(
        consideration_balance,
        amount,
        option_context.total_supply,
    )?;

    // 1. Burn redemption tokens from user (destroys their claim)
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

    // Prepare PDA signer seeds for vault transfers
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

    // 2. Transfer collateral from vault to user (if any)
    if collateral_payout > 0 {
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
            collateral_payout,
            collateral_decimals,
        )?;
    }

    // 3. Transfer consideration from vault to user (if any)
    if consideration_payout > 0 {
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::TransferChecked {
                    from: ctx.accounts.consideration_vault.to_account_info(),
                    mint: ctx.accounts.consideration_mint.to_account_info(),
                    to: ctx.accounts.user_consideration_account.to_account_info(),
                    authority: option_context.to_account_info(),
                },
                signer_seeds,
            ),
            consideration_payout,
            strike_decimals,
        )?;
    }

    msg!(
        "Redeemed {} tokens. Collateral: {}, Consideration: {}",
        amount,
        collateral_payout,
        consideration_payout
    );

    Ok(())
}
