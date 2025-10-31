use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Expiration must be in the future")]
    ExpirationInPast,

    #[msg("Strike price must be greater than zero")]
    InvalidStrikePrice,

    #[msg("Amount must be greater than zero")]
    InvalidAmount,

    #[msg("Math operation overflow")]
    MathOverflow,

    #[msg("Invalid underlying mint")]
    InvalidUnderlyingMint,

    #[msg("Invalid collateral vault")]
    InvalidCollateralVault,

    #[msg("Option has expired")]
    OptionExpired,

    // Phase 2 error codes
    #[msg("Invalid option mint")]
    InvalidOptionMint,

    #[msg("Invalid redemption mint")]
    InvalidRedemptionMint,

    #[msg("Invalid strike currency")]
    InvalidStrikeCurrency,

    #[msg("Invalid cash vault")]
    InvalidCashVault,

    // Phase 3 error codes
    #[msg("Insufficient collateral in vault")]
    InsufficientCollateral,

    // Phase 4 error codes
    #[msg("Option has not expired yet")]
    OptionNotExpired,

    #[msg("No tokens have been issued")]
    NoTokensIssued,

    // Greek.fi compliance error codes
    #[msg("User has no SHORT (redemption) tokens")]
    NoShortTokens,

    #[msg("Cash vault has no funds available")]
    NoCashAvailable,

    #[msg("No claimable consideration available for this user")]
    NoClaimableConsideration,

    #[msg("Invalid option series")]
    InvalidOptionSeries,

    #[msg("Invalid user")]
    InvalidUser,
}
