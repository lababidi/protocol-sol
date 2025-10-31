use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use crate::state::market::Market;

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub base_mint: InterfaceAccount<'info, Mint>,
    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = Market::SIZE,
        seeds = [
            b"market",
            base_mint.key().as_ref(),
            quote_mint.key().as_ref()
        ],
        bump
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.base_mint = ctx.accounts.base_mint.key();
    market.quote_mint = ctx.accounts.quote_mint.key();
    market.bump = ctx.bumps.market;
    market.next_order_id = 0;
    market.total_orders_placed = 0;
    market.total_orders_filled = 0;
    market.total_base_volume = 0;
    market.total_quote_volume = 0;

    msg!(
        "Market created: {} / {}",
        market.base_mint,
        market.quote_mint
    );

    Ok(())
}
