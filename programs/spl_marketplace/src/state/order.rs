use anchor_lang::prelude::*;

/// Represents a single limit order in the market
#[account]
pub struct Order {
    /// Market this order belongs to
    pub market: Pubkey,

    /// Unique order ID within the market
    pub order_id: u64,

    /// Order owner
    pub owner: Pubkey,

    /// Order side: true = buy base with quote, false = sell base for quote
    pub is_buy: bool,

    /// Price (quote tokens per base token)
    pub price: u64,

    /// Original order size (in base token units)
    pub size: u64,

    /// Filled amount (in base token units)
    pub filled: u64,

    /// PDA bump
    pub bump: u8,

    /// Creation timestamp
    pub created_at: i64,
}

impl Order {
    pub const SIZE: usize = 8 + 32 + 8 + 32 + 1 + 8 + 8 + 8 + 1 + 8;

    pub fn remaining(&self) -> u64 {
        self.size.saturating_sub(self.filled)
    }
}
