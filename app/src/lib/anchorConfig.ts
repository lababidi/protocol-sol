import { PublicKey } from '@solana/web3.js';

// Program IDs from Anchor.toml
export const MARKETPLACE_PROGRAM_ID = new PublicKey('DooTSqB4vH54evV1DhPC7XEbXNq75D3k7weYiPTGbxYz');
export const OPTIONS_PROGRAM_ID = new PublicKey('7a3MatFT2m6iHtZ3vYBoLRP4A1YBuophqGqoCz4p4JoP');

// RPC endpoint configuration
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'http://127.0.0.1:8899';

// Cluster commitment
export const COMMITMENT = 'confirmed';
