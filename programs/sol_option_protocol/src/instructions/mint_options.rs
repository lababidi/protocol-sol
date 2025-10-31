use anchor_lang::prelude::*;
use anchor_spl::token_interface as token;

use crate::instructions::OptionContext;
use crate::errors::ErrorCode;
use crate::utils::validation::validate_amount;

/// Mints option and redemption tokens by depositing collateral
/// User deposits collateral → receives 1:1 option + redemption tokens
pub fn handler(ctx: Context<OptionContext>, amount: u64) -> Result<()> {
    // Validation
    validate_amount(amount)?;

    let option_context = &ctx.accounts.option_context;

    // 1. Transfer collateral from user to collateral vault
    msg!("Transferring {} collateral tokens to vault", amount);
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::TransferChecked {
                from: ctx.accounts.user_collateral_account.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.collateral_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.collateral_mint.decimals,
    )?;

    // Create PDA signer seeds for minting (OptionSeries signs as mint authority)
    let collateral_mint_key = option_context.collateral_mint;
    let consideration_key = option_context.consideration_mint;
    let strike_price_bytes = option_context.strike_price.to_le_bytes();
    let expiration_bytes = option_context.expiration.to_le_bytes();
    let is_put_byte = [option_context.is_put as u8];
    let bump = option_context.bump;

    let signer_seeds: &[&[&[u8]]] = &[&[
        b"option_context",
        collateral_mint_key.as_ref(),
        consideration_key.as_ref(),
        strike_price_bytes.as_ref(),
        expiration_bytes.as_ref(),
        &is_put_byte,
        &[bump],
    ]];

    // 2. Mint option tokens to user (LONG position)
    msg!("Minting {} option tokens to user", amount);
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::MintTo {
                mint: ctx.accounts.option_mint.to_account_info(),
                to: ctx.accounts.user_option_account.to_account_info(),
                authority: option_context.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // 3. Mint redemption tokens to user (SHORT position)
    msg!("Minting {} redemption tokens to user", amount);
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::MintTo {
                mint: ctx.accounts.redemption_mint.to_account_info(),
                to: ctx.accounts.user_redemption_account.to_account_info(),
                authority: option_context.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // 4. Update total supply (OptionContext bookkeeping)
    let series_key = ctx.accounts.option_context.key();
    let option_context = &mut ctx.accounts.option_context;
    option_context.total_supply = option_context
        .total_supply
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    msg!(
        "Minted {} options for series {}. Total supply: {}",
        amount,
        series_key,
        option_context.total_supply
    );

    Ok(())
}
