use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::errors::ErrorCode;
use crate::state::order::Order;

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        close = user,
        constraint = order.owner == user.key() @ ErrorCode::UnauthorizedAccess
    )]
    pub order: Account<'info, Order>,

    pub return_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub user_return_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"escrow", order.key().as_ref()],
        bump
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<CancelOrder>) -> Result<()> {
    let order = &ctx.accounts.order;
    let remaining = order.remaining();

    require!(remaining > 0, ErrorCode::OrderFullyFilled);

    let order_key = order.key();
    let signer_seeds: &[&[&[u8]]] = &[&[b"escrow", order_key.as_ref(), &[ctx.bumps.escrow]]];

    // Return escrowed tokens
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.escrow.to_account_info(),
                mint: ctx.accounts.return_mint.to_account_info(),
                to: ctx.accounts.user_return_account.to_account_info(),
                authority: ctx.accounts.order.to_account_info(),
            },
            signer_seeds,
        ),
        ctx.accounts.escrow.amount,
        ctx.accounts.return_mint.decimals,
    )?;

    msg!("Order {} cancelled", ctx.accounts.order.order_id);

    Ok(())
}
