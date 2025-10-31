use anchor_lang::prelude::*;
use crate::errors::ErrorCode;

/// Calculates pro-rata share using the formula:
/// payout = (vault_balance × user_amount) / total_supply
///
/// Returns 0 if vault_balance is 0 (nothing to distribute)
/// Errors if total_supply is 0 (should never happen in practice)
pub fn calculate_pro_rata_share(
    vault_balance: u64,
    user_amount: u64,
    total_supply: u64,
) -> Result<u64> {
    require!(total_supply > 0, ErrorCode::NoTokensIssued);

    if vault_balance == 0 {
        return Ok(0);
    }

    let payout = vault_balance
        .checked_mul(user_amount)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(total_supply)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(payout)
}

/// Calculates pro-rata share using u128 for intermediate calculations
/// to prevent overflow on large balances
pub fn calculate_pro_rata_share_u128(
    vault_balance: u64,
    user_amount: u64,
    total_supply: u64,
) -> Result<u64> {
    require!(total_supply > 0, ErrorCode::NoTokensIssued);

    if vault_balance == 0 {
        return Ok(0);
    }

    let numerator = (vault_balance as u128)
        .checked_mul(user_amount as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    let payout = numerator
        .checked_div(total_supply as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    Ok(payout)
}

/// Calculates strike payment required for exercising options
/// Formula: (amount × strike_price) / 10^collateral_decimals
///
/// Example: 100 BONK × $0.04 strike = $4 USDC
/// (100_000 raw × 4_000_000) / 10^5 = 4_000_000 raw USDC ($4)
pub fn calculate_strike_payment(
    amount: u64,
    strike_price: u64,
    collateral_decimals: u8,
) -> Result<u64> {
    let payment = amount
        .checked_mul(strike_price)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_u64.pow(collateral_decimals as u32))
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(payment)
}
