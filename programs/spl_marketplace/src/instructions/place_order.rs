use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::errors::ErrorCode;
use crate::state::market::Market;
use crate::state::order::Order;

#[derive(Accounts)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = user,
        space = Order::SIZE,
        seeds = [
            b"order",
            market.key().as_ref(),
            market.next_order_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub order: Account<'info, Order>,

    /// Token being deposited (base for sells, quote for buys)
    pub deposit_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub user_deposit_account: InterfaceAccount<'info, TokenAccount>,

    /// Order escrow (PDA owned by order)
    #[account(
        init,
        payer = user,
        seeds = [b"escrow", order.key().as_ref()],
        bump,
        token::mint = deposit_mint,
        token::authority = order
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PlaceOrder>, price: u64, size: u64, is_buy: bool) -> Result<()> {
    require!(price > 0, ErrorCode::InvalidPrice);
    require!(size > 0, ErrorCode::InvalidAmount);

    let market = &ctx.accounts.market;
    let decimals = ctx.accounts.deposit_mint.decimals;

    // Validate mint matches order side
    let expected_mint = if is_buy {
        market.quote_mint
    } else {
        market.base_mint
    };
    require!(
        ctx.accounts.deposit_mint.key() == expected_mint,
        ErrorCode::InvalidMint
    );

    // Calculate escrow amount
    let escrow_amount = if is_buy {
        // Buy order: deposit quote tokens (price * size / decimals)
        price
            .checked_mul(size)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10_u64.pow(decimals as u32))
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        // Sell order: deposit base tokens (1:1)
        size
    };

    // Transfer to escrow
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_deposit_account.to_account_info(),
                mint: ctx.accounts.deposit_mint.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        escrow_amount,
        decimals,
    )?;

    // Initialize order
    let order = &mut ctx.accounts.order;
    order.market = market.key();
    order.order_id = market.next_order_id;
    order.owner = ctx.accounts.user.key();
    order.is_buy = is_buy;
    order.price = price;
    order.size = size;
    order.filled = 0;
    order.bump = ctx.bumps.order;
    order.created_at = Clock::get()?.unix_timestamp;

    // Update market
    let market = &mut ctx.accounts.market;
    market.next_order_id = market
        .next_order_id
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    market.total_orders_placed = market
        .total_orders_placed
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    msg!(
        "Order {} placed: {} {} @ {}",
        order.order_id,
        if is_buy { "BUY" } else { "SELL" },
        size,
        price
    );

    Ok(())
}
