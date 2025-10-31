use anchor_lang::prelude::*;

use instructions::*;

pub mod errors;
pub mod instructions;
pub mod utils;

// Re-export at crate root for Anchor's macro expansion
pub use instructions::{OptionContext, OptionData, OptionCreate};


declare_id!("7a3MatFT2m6iHtZ3vYBoLRP4A1YBuophqGqoCz4p4JoP");


#[program]
pub mod sol_option_protocol {    
    use super::*;


    /// CreateOption: Initializes OptionContext + vaults + mints
    pub fn create_option(
        ctx: Context<OptionCreate>,
        collateral_mint: Pubkey,
        consideration_mint: Pubkey,
        strike_price: u64,
        expiration: i64,
        is_put: bool,
    ) -> Result<()> {
        instructions::create_series::handler(ctx, collateral_mint, consideration_mint, strike_price, expiration, is_put)
    }

    /// Mint: deposit collateral → mint option + redemption tokens 1:1
    pub fn mint(ctx: Context<OptionContext>, amount: u64) -> Result<()> {
        instructions::mint_options::handler(ctx, amount)
    }

    /// Exercise: burn options, pay strike → receive collateral
    pub fn exercise(ctx: Context<OptionContext>, amount: u64) -> Result<()> {
        instructions::exercise::handler(ctx, amount)
    }

    /// Redeem: post-expiry pro-rata of collateral + consideration by burning redemption tokens
    pub fn redeem(ctx: Context<OptionContext>, amount: u64) -> Result<()> {
        instructions::redeem::handler(ctx, amount)
    }

    /// Burn: burn both legs to reclaim 1:1 collateral anytime
    pub fn burn(ctx: Context<OptionContext>, amount: u64) -> Result<()> {
        instructions::burn_paired::handler(ctx, amount)
    }


    /// Allows SHORT token holders to claim pro-rata consideration before expiry
    /// Greek.fi compliance: Key capital efficiency feature
    pub fn redeem_consideration(ctx: Context<OptionContext>) -> Result<()> {
        instructions::redeem_consideration::handler(ctx)
    }
}
