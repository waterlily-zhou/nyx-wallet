# USDC Gas Payment Implementation

This document explains how to use USDC tokens to pay for gas fees in your account abstraction wallet.

## Overview

Account Abstraction (ERC-4337) allows for more flexible transaction fee payment options, including using ERC-20 tokens like USDC instead of ETH. This implementation uses Pimlico's ERC-20 Paymaster to enable USDC gas payments on the Sepolia testnet.

## Setup Instructions

1. Create a `.env` file with the following keys:
   ```
   PRIVATE_KEY=your_private_key_here
   PIMLICO_API_KEY=your_pimlico_api_key_here
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Implementation Details

The implementation is in `src/usdc-gas-payment.ts` and follows these steps:

1. **Setup Clients**: Creates the necessary clients for interacting with the blockchain and Pimlico's services.
2. **Create Smart Account**: Sets up a Safe smart account using the owner's private key.
3. **Check Balances**: Verifies that the account has sufficient USDC balance.
4. **Get Token Quotes**: Retrieves exchange rates and paymaster information for USDC.
5. **Token Approval**: Approves the paymaster to spend USDC on behalf of the account.
6. **Send Transaction**: Executes a transaction using USDC for gas fees.

## Usage

Run the script with:

```
npm run usdc-gas
```

## Flow Explanation

1. The script first checks if your account has enough USDC tokens.
2. It then verifies if the paymaster has permission to spend your USDC tokens.
3. If not, it sends an approval transaction (paid with sponsored gas).
4. Finally, it sends your main transaction with USDC as gas payment.

## Getting Sepolia USDC

To get USDC tokens on Sepolia testnet:

1. Use a faucet that provides Sepolia USDC tokens.
2. Bridge USDC from another testnet.
3. Request from community members or developers.

## Security Considerations

- Keep your private keys secure and never share them.
- Monitor transaction costs when using token payments for gas.
- Be aware that token prices fluctuate, affecting the cost of transactions.

## Troubleshooting

- **Transaction Fails**: Ensure you have sufficient USDC balance and have approved the paymaster.
- **API Errors**: Verify your Pimlico API key is correct and has sufficient quota.
- **Address Format Issues**: Ensure addresses are properly formatted with correct checksums.

## Advanced Customization

You can customize this implementation by:

1. Using different ERC-20 tokens supported by the paymaster.
2. Adjusting gas limits and prices for different transaction types.
3. Implementing conditional logic to choose between ETH and token payments.

## Resources

- [Pimlico Documentation](https://docs.pimlico.io/)
- [ERC-4337 Specification](https://eips.ethereum.org/EIPS/eip-4337)
- [permissionless.js Documentation](https://docs.pimlico.io/permissionless/)

## Implementation Status

The implementation is now fully functional and has been tested on the Sepolia testnet. It successfully:

1. Checks USDC balance
2. Approves the paymaster to spend USDC (if needed)
3. Sends transactions using USDC for gas fees

The implementation uses permissionless.js and Pimlico's ERC-20 Paymaster service to handle the token-based gas payments. 