pub mod burn_paired;
pub mod create_series;
pub mod exercise;
pub mod mint_options;
pub mod redeem;
pub mod redeem_consideration;
pub mod option;

// Note: Glob imports are required for Anchor's #[program] macro
// The handler name collision is intentional - each module's handler is accessed via module path
#[allow(ambiguous_glob_reexports)]
pub use burn_paired::*;
#[allow(ambiguous_glob_reexports)]
pub use create_series::*;
#[allow(ambiguous_glob_reexports)]
pub use exercise::*;
#[allow(ambiguous_glob_reexports)]
pub use mint_options::*;
#[allow(ambiguous_glob_reexports)]
pub use redeem::*;
#[allow(ambiguous_glob_reexports)]
pub use redeem_consideration::*;
#[allow(ambiguous_glob_reexports)]
pub use option::*;
