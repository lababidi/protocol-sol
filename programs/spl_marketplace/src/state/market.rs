use anchor_lang::prelude::*;

/// Represents a trading market for a pair of SPL tokens
#[account]
pub struct Market {
    /// Base token mint (e.g., option token, NFT, any SPL token)
    pub base_mint: Pubkey,

    /// Quote token mint (e.g., USDC, SOL, any SPL token)
    pub quote_mint: Pubkey,

    /// PDA bump
    pub bump: u8,

    /// Counter for generating unique order IDs
    pub next_order_id: u64,

    /// Market statistics
    pub total_orders_placed: u64,
    pub total_orders_filled: u64,
    pub total_base_volume: u64,
    pub total_quote_volume: u64,
}

impl Market {
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8;
}
