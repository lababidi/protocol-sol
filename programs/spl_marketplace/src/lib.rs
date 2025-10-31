use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("DooTSqB4vH54evV1DhPC7XEbXNq75D3k7weYiPTGbxYz");

#[program]
pub mod spl_marketplace {
    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>) -> Result<()> {
        instructions::create_market::handler(ctx)
    }

    pub fn place_order(
        ctx: Context<PlaceOrder>,
        price: u64,
        size: u64,
        is_buy: bool,
    ) -> Result<()> {
        instructions::place_order::handler(ctx, price, size, is_buy)
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        instructions::cancel_order::handler(ctx)
    }

    pub fn fill_order(ctx: Context<FillOrder>, fill_size: u64) -> Result<()> {
        instructions::fill_order::handler(ctx, fill_size)
    }
}
