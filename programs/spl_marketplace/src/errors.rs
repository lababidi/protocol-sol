use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid price (must be > 0)")]
    InvalidPrice,

    #[msg("Invalid amount (must be > 0)")]
    InvalidAmount,

    #[msg("Invalid mint for order side")]
    InvalidMint,

    #[msg("Invalid fill size")]
    InvalidFillSize,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Unauthorized access")]
    UnauthorizedAccess,

    #[msg("Order fully filled")]
    OrderFullyFilled,

    #[msg("Invalid market")]
    InvalidMarket,
}
