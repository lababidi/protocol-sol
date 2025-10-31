#!/bin/bash

# Run only the new local test (bypassing old tests that need migration)
# This test uses the new naming and works with local validator

echo "🚀 Running local test..."
echo "This bypasses old testnet tests that need migration updates"
echo ""

npx ts-mocha -p ./tsconfig.json -t 1000000 tests/local_test.ts
