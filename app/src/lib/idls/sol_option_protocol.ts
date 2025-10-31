/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sol_option_protocol.json`.
 */
export type SolOptionProtocol = {
  "address": "2xQGkb3maNPAA3Kaj7xd5RgJzddppLiPjxoupfruhXnF",
  "metadata": {
    "name": "solOptionProtocol",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Fully collateralized American options protocol on Solana"
  },
  "instructions": [
    {
      "name": "burn",
      "docs": [
        "Burn: burn both legs to reclaim 1:1 collateral anytime"
      ],
      "discriminator": [
        116,
        110,
        29,
        56,
        107,
        219,
        42,
        93
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "optionContext",
          "docs": [
            "The OptionContext PDA (client calculates and sends this)"
          ],
          "writable": true
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral mint (validated against stored value in option_context)"
          ]
        },
        {
          "name": "considerationMint",
          "docs": [
            "Consideration mint (validated against stored value in option_context)"
          ]
        },
        {
          "name": "optionMint",
          "docs": [
            "Option mint (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "redemptionMint",
          "docs": [
            "Redemption mint (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "collateralVault",
          "docs": [
            "Collateral vault (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "considerationVault",
          "docs": [
            "Consideration vault (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "userCollateralAccount",
          "docs": [
            "User's collateral token account"
          ],
          "writable": true
        },
        {
          "name": "userConsiderationAccount",
          "docs": [
            "User's consideration token account"
          ],
          "writable": true
        },
        {
          "name": "userOptionAccount",
          "docs": [
            "User's option token account"
          ],
          "writable": true
        },
        {
          "name": "userRedemptionAccount",
          "docs": [
            "User's redemption token account"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createOption",
      "docs": [
        "CreateOption: Initializes OptionContext + vaults + mints"
      ],
      "discriminator": [
        226,
        92,
        124,
        94,
        113,
        96,
        60,
        172
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "optionContext",
          "docs": [
            "The OptionContext PDA - INITIALIZE it (create new account)"
          ],
          "writable": true
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral mint (provided by client)"
          ]
        },
        {
          "name": "considerationMint",
          "docs": [
            "Consideration/strike currency mint (provided by client)"
          ]
        },
        {
          "name": "optionMint",
          "docs": [
            "Option token mint PDA - INITIALIZE it"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  116,
                  105,
                  111,
                  110,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "optionContext"
              }
            ]
          }
        },
        {
          "name": "redemptionMint",
          "docs": [
            "Redemption token mint PDA - INITIALIZE it"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  100,
                  101,
                  109,
                  112,
                  116,
                  105,
                  111,
                  110,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "optionContext"
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "docs": [
            "Collateral vault PDA - INITIALIZE it"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "optionContext"
              }
            ]
          }
        },
        {
          "name": "considerationVault",
          "docs": [
            "Consideration vault PDA - INITIALIZE it"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  115,
                  105,
                  100,
                  101,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "optionContext"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "collateralMint",
          "type": "pubkey"
        },
        {
          "name": "considerationMint",
          "type": "pubkey"
        },
        {
          "name": "strikePrice",
          "type": "u64"
        },
        {
          "name": "expiration",
          "type": "i64"
        },
        {
          "name": "isPut",
          "type": "bool"
        }
      ]
    },
    {
      "name": "exercise",
      "docs": [
        "Exercise: burn options, pay strike → receive collateral"
      ],
      "discriminator": [
        144,
        79,
        103,
        64,
        241,
        78,
        80,
        174
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "optionContext",
          "docs": [
            "The OptionContext PDA (client calculates and sends this)"
          ],
          "writable": true
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral mint (validated against stored value in option_context)"
          ]
        },
        {
          "name": "considerationMint",
          "docs": [
            "Consideration mint (validated against stored value in option_context)"
          ]
        },
        {
          "name": "optionMint",
          "docs": [
            "Option mint (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "redemptionMint",
          "docs": [
            "Redemption mint (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "collateralVault",
          "docs": [
            "Collateral vault (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "considerationVault",
          "docs": [
            "Consideration vault (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "userCollateralAccount",
          "docs": [
            "User's collateral token account"
          ],
          "writable": true
        },
        {
          "name": "userConsiderationAccount",
          "docs": [
            "User's consideration token account"
          ],
          "writable": true
        },
        {
          "name": "userOptionAccount",
          "docs": [
            "User's option token account"
          ],
          "writable": true
        },
        {
          "name": "userRedemptionAccount",
          "docs": [
            "User's redemption token account"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "mint",
      "docs": [
        "Mint: deposit collateral → mint option + redemption tokens 1:1"
      ],
      "discriminator": [
        51,
        57,
        225,
        47,
        182,
        146,
        137,
        166
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "optionContext",
          "docs": [
            "The OptionContext PDA (client calculates and sends this)"
          ],
          "writable": true
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral mint (validated against stored value in option_context)"
          ]
        },
        {
          "name": "considerationMint",
          "docs": [
            "Consideration mint (validated against stored value in option_context)"
          ]
        },
        {
          "name": "optionMint",
          "docs": [
            "Option mint (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "redemptionMint",
          "docs": [
            "Redemption mint (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "collateralVault",
          "docs": [
            "Collateral vault (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "considerationVault",
          "docs": [
            "Consideration vault (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "userCollateralAccount",
          "docs": [
            "User's collateral token account"
          ],
          "writable": true
        },
        {
          "name": "userConsiderationAccount",
          "docs": [
            "User's consideration token account"
          ],
          "writable": true
        },
        {
          "name": "userOptionAccount",
          "docs": [
            "User's option token account"
          ],
          "writable": true
        },
        {
          "name": "userRedemptionAccount",
          "docs": [
            "User's redemption token account"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeem",
      "docs": [
        "Redeem: post-expiry pro-rata of collateral + consideration by burning redemption tokens"
      ],
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "optionContext",
          "docs": [
            "The OptionContext PDA (client calculates and sends this)"
          ],
          "writable": true
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral mint (validated against stored value in option_context)"
          ]
        },
        {
          "name": "considerationMint",
          "docs": [
            "Consideration mint (validated against stored value in option_context)"
          ]
        },
        {
          "name": "optionMint",
          "docs": [
            "Option mint (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "redemptionMint",
          "docs": [
            "Redemption mint (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "collateralVault",
          "docs": [
            "Collateral vault (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "considerationVault",
          "docs": [
            "Consideration vault (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "userCollateralAccount",
          "docs": [
            "User's collateral token account"
          ],
          "writable": true
        },
        {
          "name": "userConsiderationAccount",
          "docs": [
            "User's consideration token account"
          ],
          "writable": true
        },
        {
          "name": "userOptionAccount",
          "docs": [
            "User's option token account"
          ],
          "writable": true
        },
        {
          "name": "userRedemptionAccount",
          "docs": [
            "User's redemption token account"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeemConsideration",
      "docs": [
        "Allows SHORT token holders to claim pro-rata consideration before expiry",
        "Greek.fi compliance: Key capital efficiency feature"
      ],
      "discriminator": [
        54,
        82,
        154,
        89,
        31,
        206,
        139,
        53
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "optionContext",
          "docs": [
            "The OptionContext PDA (client calculates and sends this)"
          ],
          "writable": true
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral mint (validated against stored value in option_context)"
          ]
        },
        {
          "name": "considerationMint",
          "docs": [
            "Consideration mint (validated against stored value in option_context)"
          ]
        },
        {
          "name": "optionMint",
          "docs": [
            "Option mint (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "redemptionMint",
          "docs": [
            "Redemption mint (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "collateralVault",
          "docs": [
            "Collateral vault (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "considerationVault",
          "docs": [
            "Consideration vault (validated against stored value in option_context)"
          ],
          "writable": true
        },
        {
          "name": "userCollateralAccount",
          "docs": [
            "User's collateral token account"
          ],
          "writable": true
        },
        {
          "name": "userConsiderationAccount",
          "docs": [
            "User's consideration token account"
          ],
          "writable": true
        },
        {
          "name": "userOptionAccount",
          "docs": [
            "User's option token account"
          ],
          "writable": true
        },
        {
          "name": "userRedemptionAccount",
          "docs": [
            "User's redemption token account"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "optionData",
      "discriminator": [
        241,
        2,
        215,
        22,
        100,
        177,
        168,
        108
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "expirationInPast",
      "msg": "Expiration must be in the future"
    },
    {
      "code": 6001,
      "name": "invalidStrikePrice",
      "msg": "Strike price must be greater than zero"
    },
    {
      "code": 6002,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6003,
      "name": "mathOverflow",
      "msg": "Math operation overflow"
    },
    {
      "code": 6004,
      "name": "invalidUnderlyingMint",
      "msg": "Invalid underlying mint"
    },
    {
      "code": 6005,
      "name": "invalidCollateralVault",
      "msg": "Invalid collateral vault"
    },
    {
      "code": 6006,
      "name": "optionExpired",
      "msg": "Option has expired"
    },
    {
      "code": 6007,
      "name": "invalidOptionMint",
      "msg": "Invalid option mint"
    },
    {
      "code": 6008,
      "name": "invalidRedemptionMint",
      "msg": "Invalid redemption mint"
    },
    {
      "code": 6009,
      "name": "invalidStrikeCurrency",
      "msg": "Invalid strike currency"
    },
    {
      "code": 6010,
      "name": "invalidCashVault",
      "msg": "Invalid cash vault"
    },
    {
      "code": 6011,
      "name": "insufficientCollateral",
      "msg": "Insufficient collateral in vault"
    },
    {
      "code": 6012,
      "name": "optionNotExpired",
      "msg": "Option has not expired yet"
    },
    {
      "code": 6013,
      "name": "noTokensIssued",
      "msg": "No tokens have been issued"
    },
    {
      "code": 6014,
      "name": "noShortTokens",
      "msg": "User has no SHORT (redemption) tokens"
    },
    {
      "code": 6015,
      "name": "noCashAvailable",
      "msg": "Cash vault has no funds available"
    },
    {
      "code": 6016,
      "name": "noClaimableConsideration",
      "msg": "No claimable consideration available for this user"
    },
    {
      "code": 6017,
      "name": "invalidOptionSeries",
      "msg": "Invalid option series"
    },
    {
      "code": 6018,
      "name": "invalidUser",
      "msg": "Invalid user"
    }
  ],
  "types": [
    {
      "name": "optionData",
      "docs": [
        "Core data struct stored on-chain representing an option series",
        "",
        "PDA Seeds (used to derive the OptionContext address):",
        "- \"option_context\"",
        "- collateral_mint",
        "- consideration_mint",
        "- strike_price",
        "- expiration",
        "- is_put",
        "",
        "Stored Data (NOT used in PDA derivation, but stored in the account):",
        "- Derived PDAs (option_mint, redemption_mint, vaults)",
        "- Runtime tracking (total_supply, exercised_amount)"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "considerationMint",
            "type": "pubkey"
          },
          {
            "name": "strikePrice",
            "type": "u64"
          },
          {
            "name": "expiration",
            "type": "i64"
          },
          {
            "name": "isPut",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "optionMint",
            "type": "pubkey"
          },
          {
            "name": "redemptionMint",
            "type": "pubkey"
          },
          {
            "name": "collateralVault",
            "type": "pubkey"
          },
          {
            "name": "considerationVault",
            "type": "pubkey"
          },
          {
            "name": "totalSupply",
            "type": "u64"
          },
          {
            "name": "exercisedAmount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
