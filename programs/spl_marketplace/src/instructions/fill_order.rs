use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::errors::ErrorCode;
use crate::state::market::Market;
use crate::state::order::Order;

#[derive(Accounts)]
pub struct FillOrder<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    pub market: Account<'info, Market>,

    #[account(mut, constraint = maker_order.market == market.key() @ ErrorCode::InvalidMarket)]
    pub maker_order: Account<'info, Order>,

    pub base_mint: InterfaceAccount<'info, Mint>,
    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"escrow", maker_order.key().as_ref()],
        bump
    )]
    pub maker_escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub taker_base_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub taker_quote_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Validated via token transfer
    #[account(mut)]
    pub maker_receive_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<FillOrder>, fill_size: u64) -> Result<()> {
    let order = &ctx.accounts.maker_order;
    let remaining = order.remaining();

    require!(fill_size > 0, ErrorCode::InvalidAmount);
    require!(fill_size <= remaining, ErrorCode::InvalidFillSize);

    let base_decimals = ctx.accounts.base_mint.decimals;
    let quote_decimals = ctx.accounts.quote_mint.decimals;

    // Calculate quote amount
    let quote_amount = order
        .price
        .checked_mul(fill_size)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_u64.pow(base_decimals as u32))
        .ok_or(ErrorCode::MathOverflow)?;

    let market_key = ctx.accounts.market.key();
    let order_id_bytes = order.order_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"order",
        market_key.as_ref(),
        order_id_bytes.as_ref(),
        &[order.bump],
    ]];

    if order.is_buy {
        // Maker buying: Taker gives base, receives quote from escrow
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.taker_base_account.to_account_info(),
                    mint: ctx.accounts.base_mint.to_account_info(),
                    to: ctx.accounts.maker_receive_account.to_account_info(),
                    authority: ctx.accounts.taker.to_account_info(),
                },
            ),
            fill_size,
            base_decimals,
        )?;

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.maker_escrow.to_account_info(),
                    mint: ctx.accounts.quote_mint.to_account_info(),
                    to: ctx.accounts.taker_quote_account.to_account_info(),
                    authority: ctx.accounts.maker_order.to_account_info(),
                },
                signer_seeds,
            ),
            quote_amount,
            quote_decimals,
        )?;
    } else {
        // Maker selling: Taker receives base from escrow, gives quote
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.maker_escrow.to_account_info(),
                    mint: ctx.accounts.base_mint.to_account_info(),
                    to: ctx.accounts.taker_base_account.to_account_info(),
                    authority: ctx.accounts.maker_order.to_account_info(),
                },
                signer_seeds,
            ),
            fill_size,
            base_decimals,
        )?;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.taker_quote_account.to_account_info(),
                    mint: ctx.accounts.quote_mint.to_account_info(),
                    to: ctx.accounts.maker_receive_account.to_account_info(),
                    authority: ctx.accounts.taker.to_account_info(),
                },
            ),
            quote_amount,
            quote_decimals,
        )?;
    }

    // Update order
    let order = &mut ctx.accounts.maker_order;
    order.filled = order
        .filled
        .checked_add(fill_size)
        .ok_or(ErrorCode::MathOverflow)?;

    msg!("Filled {} @ price {}", fill_size, order.price);

    Ok(())
}
