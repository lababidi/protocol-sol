/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/spl_marketplace.json`.
 */
export type SplMarketplace = {
  "address": "DwPtSt28GcsFLkyPozvD1shNU8AXa6NkSgbRJRHfpGkU",
  "metadata": {
    "name": "splMarketplace",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Generic SPL token marketplace with CLOB"
  },
  "instructions": [
    {
      "name": "cancelOrder",
      "discriminator": [
        95,
        129,
        237,
        240,
        8,
        49,
        223,
        132
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "order",
          "writable": true
        },
        {
          "name": "returnMint"
        },
        {
          "name": "userReturnAccount",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "order"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "baseMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "baseMint"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "fillOrder",
      "discriminator": [
        232,
        122,
        115,
        25,
        199,
        143,
        136,
        162
      ],
      "accounts": [
        {
          "name": "taker",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "makerOrder",
          "writable": true
        },
        {
          "name": "baseMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "makerEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "makerOrder"
              }
            ]
          }
        },
        {
          "name": "takerBaseAccount",
          "writable": true
        },
        {
          "name": "takerQuoteAccount",
          "writable": true
        },
        {
          "name": "makerReceiveAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "fillSize",
          "type": "u64"
        }
      ]
    },
    {
      "name": "placeOrder",
      "discriminator": [
        51,
        194,
        155,
        175,
        109,
        130,
        96,
        106
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "market.next_order_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "depositMint",
          "docs": [
            "Token being deposited (base for sells, quote for buys)"
          ]
        },
        {
          "name": "userDepositAccount",
          "writable": true
        },
        {
          "name": "escrow",
          "docs": [
            "Order escrow (PDA owned by order)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "order"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "size",
          "type": "u64"
        },
        {
          "name": "isBuy",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "order",
      "discriminator": [
        134,
        173,
        223,
        185,
        77,
        86,
        28,
        51
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidPrice",
      "msg": "Invalid price (must be > 0)"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Invalid amount (must be > 0)"
    },
    {
      "code": 6002,
      "name": "invalidMint",
      "msg": "Invalid mint for order side"
    },
    {
      "code": 6003,
      "name": "invalidFillSize",
      "msg": "Invalid fill size"
    },
    {
      "code": 6004,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6005,
      "name": "unauthorizedAccess",
      "msg": "Unauthorized access"
    },
    {
      "code": 6006,
      "name": "orderFullyFilled",
      "msg": "Order fully filled"
    },
    {
      "code": 6007,
      "name": "invalidMarket",
      "msg": "Invalid market"
    }
  ],
  "types": [
    {
      "name": "market",
      "docs": [
        "Represents a trading market for a pair of SPL tokens"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "baseMint",
            "docs": [
              "Base token mint (e.g., option token, NFT, any SPL token)"
            ],
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "docs": [
              "Quote token mint (e.g., USDC, SOL, any SPL token)"
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "nextOrderId",
            "docs": [
              "Counter for generating unique order IDs"
            ],
            "type": "u64"
          },
          {
            "name": "totalOrdersPlaced",
            "docs": [
              "Market statistics"
            ],
            "type": "u64"
          },
          {
            "name": "totalOrdersFilled",
            "type": "u64"
          },
          {
            "name": "totalBaseVolume",
            "type": "u64"
          },
          {
            "name": "totalQuoteVolume",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "order",
      "docs": [
        "Represents a single limit order in the market"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market this order belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "orderId",
            "docs": [
              "Unique order ID within the market"
            ],
            "type": "u64"
          },
          {
            "name": "owner",
            "docs": [
              "Order owner"
            ],
            "type": "pubkey"
          },
          {
            "name": "isBuy",
            "docs": [
              "Order side: true = buy base with quote, false = sell base for quote"
            ],
            "type": "bool"
          },
          {
            "name": "price",
            "docs": [
              "Price (quote tokens per base token)"
            ],
            "type": "u64"
          },
          {
            "name": "size",
            "docs": [
              "Original order size (in base token units)"
            ],
            "type": "u64"
          },
          {
            "name": "filled",
            "docs": [
              "Filled amount (in base token units)"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "createdAt",
            "docs": [
              "Creation timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    }
  ]
};
