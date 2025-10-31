use crate::instructions::OptionContext;

/// Generates PDA signer seeds for the OptionContext account
/// This is used whenever the program needs to sign on behalf of the OptionSeries
/// (e.g., minting tokens, transferring from vaults)
///
/// Returns a lifetime-bound array that can be used in CPI contexts
#[allow(dead_code)]
pub fn get_option_context_signer_seeds<'a>(
    _option_context: &'a OptionContext,
    collateral_mint_bytes: &'a [u8; 32],
    consideration_mint_bytes: &'a [u8; 32],
    strike_price_bytes: &'a [u8; 8],
    expiration_bytes: &'a [u8; 8],
    is_put_bytes: &'a [u8; 1],
    bump_bytes: &'a [u8; 1],
) -> [&'a [u8]; 7] {
    [
        b"option_context",
        collateral_mint_bytes,
        consideration_mint_bytes,
        strike_price_bytes,
        expiration_bytes,
        is_put_bytes,
        bump_bytes,
    ]
}
