use anchor_lang::prelude::*;
use crate::errors::ErrorCode;

/// Validates that an amount is greater than zero
pub fn validate_amount(amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    Ok(())
}

/// Validates that expiration is in the future
pub fn validate_expiration(expiration: i64) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    require!(expiration > current_time, ErrorCode::ExpirationInPast);
    Ok(())
}

/// Validates that strike price is non-zero
pub fn validate_strike_price(strike_price: u64) -> Result<()> {
    require!(strike_price > 0, ErrorCode::InvalidStrikePrice);
    Ok(())
}

/// Validates that option has not expired (for pre-expiry operations)
pub fn validate_not_expired(expiration: i64) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    require!(current_time < expiration, ErrorCode::OptionExpired);
    Ok(())
}

/// Validates that option has expired (for post-expiry operations)
pub fn validate_expired(expiration: i64) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    require!(current_time >= expiration, ErrorCode::OptionNotExpired);
    Ok(())
}

/// Validates sufficient vault balance for a transfer
pub fn validate_vault_balance(vault_balance: u64, required: u64) -> Result<()> {
    require!(vault_balance >= required, ErrorCode::InsufficientCollateral);
    Ok(())
}
