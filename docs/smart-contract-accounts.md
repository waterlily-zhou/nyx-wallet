# Smart Contract Account Implementation

This document outlines the implementation of real Smart Contract Accounts (SCAs) in the nyx-wallet application.

## Overview

The wallet now supports real Smart Contract Accounts using Safe contracts on the Sepolia testnet. This implementation:

1. Uses permissionless.js v0.2.36 to create counterfactual Safe Smart Accounts
2. Falls back to a direct Safe implementation if permissionless.js fails
3. Supports gas abstraction via Pimlico paymaster services

## Implementation

### Primary Implementation: permissionless.js v2

Our primary implementation uses permissionless.js with the proper parameter structure required for version 0.2.36:

```javascript
const safeAccountParams = {
  client: publicClient,
  owners: [owner], // Array of owner accounts
  version: "1.4.1", // Safe version
  entryPoint: {
    address: ENTRY_POINT,
    version: "0.6",
  },
  saltNonce: 0n, // Use a fixed salt for deterministic addresses
  chainId: sepolia.id, // Explicitly provide chainId
};
```

The implementation is available in two versions:
- `src/lib/utils/permissionless-v2.ts` - TypeScript version
- `src/lib/utils/permissionless-js-direct.js` - JavaScript version

### Fallback Implementation: Direct Safe

If permissionless.js fails for any reason, the system falls back to a direct Safe implementation using the Safe contracts, which:

1. Calculates the counterfactual address using standard Safe contract interactions
2. Creates a Smart Account interface that mimics the permissionless.js interface
3. Supports account deployment and transaction signing

## User Flow

When a user creates a wallet:

1. The system first attempts to create an SCA using permissionless.js v2
2. If that fails, it falls back to the direct Safe implementation
3. The resulting smart account address is stored in the user's profile
4. Future transactions use the appropriate client based on the created account

## Automatic Key Generation

The wallet now supports automatic key generation for users who don't have existing keys:

1. If a biometric key is missing when attempting to create a wallet, a new one is automatically generated
2. If a server key is missing, a new one is securely generated and encrypted
3. This provides a seamless experience for new users without requiring manual key generation steps

This automatic key generation is implemented in two places:
- `src/lib/utils/user-store.ts` - In the `createSmartAccountFromCredential` function
- `src/lib/wallet/index.ts` - In the `createWallet` function

Both implementations properly handle different key storage formats and encryption methods.

## Testing

You can test the implementation with:

```bash
# Test the JavaScript implementation
node src/scripts/test-permissionless-direct.js

# Test the TypeScript implementation (requires compilation)
npx tsc src/lib/utils/permissionless-v2.ts --outDir dist --esModuleInterop
node src/scripts/test-permissionless-v2.js
```

## Troubleshooting

If you encounter Next.js cache errors:
1. Run `scripts/clear-cache.sh` to clear the cache
2. Restart the development server

For Smart Account Client errors, check that:
- The transport parameters are properly passed as function calls (`http(url)`)
- Pimlico API key is valid and properly set in environment variables
- The bundler endpoint is accessible from your network 