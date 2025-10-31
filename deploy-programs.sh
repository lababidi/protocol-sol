#!/bin/bash

# Deploy programs to localnet

echo "🚀 Deploying Solana Programs"
echo "============================="

# Setup environment
export PATH="$HOME/.cargo/bin:$PATH"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Build programs
echo "📦 Building programs..."
anchor build

# Deploy to localnet
echo "🚀 Deploying to localnet..."
anchor deploy --provider.cluster localnet

echo ""
echo "✅ Programs deployed!"
echo "   - Marketplace: MRKTaa1111111111111111111111111111111111111"
echo "   - Options:     7a3MatFT2m6iHtZ3vYBoLRP4A1YBuophqGqoCz4p4JoP"
echo ""
echo "RPC Endpoint: http://localhost:8899"
