# Account Abstraction Wallet with Pimlico

This project implements an Account Abstraction wallet using Pimlico's infrastructure, based on ERC-4337 and the Safe smart contract wallet.

## Current Status

The project has been successfully set up with:

- ✅ Pimlico API key integration
- ✅ Safe smart account creation
- ✅ Smart account client for transaction management
- ✅ Transaction sending capabilities

## Features

- **Smart Account Creation**: Creates a Safe smart account controlled by your private key
- **Gasless Transactions**: Can use Pimlico's paymaster for sponsored transactions
- ✅ Sets up public client for Sepolia testnet
- ✅ Provides guidance on next steps

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set up your environment variables:

Create a `.env` file in the root directory with the following:

```
PRIVATE_KEY=your_private_key_here
PIMLICO_API_KEY=your_pimlico_api_key_here
```

Note: Your private key is only used to control the smart account and should be kept secure.

## Usage

### Create your Smart Account

Run the main script to create your Smart Account:

```bash
npm run dev
```

This will:
1. Create a Safe smart account controlled by your private key
2. Display the wallet address
3. Show the current balance
4. Provide instructions for using the account

### Send a Transaction

To send a transaction from your Smart Account:

1. Edit `src/send-transaction.ts` to set your recipient address and amount
2. Make sure your smart account has some ETH for gas (if not using a paymaster)
3. Run:

```bash
npm run send
```

Example output:
```
👤 Owner address: 0x8bd7B4c5aAA4fcC568fdF14e9F64E334E4Ac83C8
🔨 Loading Safe smart account...
💼 Smart account address: 0xB4E74b7E767694Ca0c6e4dF160d1639501ac8A21
💰 Current balance: 1000000000000000 wei
🚀 Sending 0.001 ETH to 0xRecipientAddress...
✅ Transaction sent! User operation hash: 0xhash...
🔍 Track on JiffyScan: https://jiffyscan.xyz/userOpHash/0xhash?network=sepolia
✅ Transaction process complete
```

## How It Works

1. **Account Creation**: We use Pimlico and Safe to create a smart contract wallet that follows ERC-4337
2. **Transaction Handling**: Transactions are bundled as "UserOperations" and sent to Pimlico's bundler
3. **Gas Payment**: Can be paid normally or sponsored via Pimlico's paymaster
4. **Signature**: Your private key signs transactions, but never interacts directly with the blockchain

## Advanced Usage

### Customize Recipient and Amount

Edit the bottom of `src/send-transaction.ts`:

```typescript
// Example usage
const recipientAddress = "0xYourRecipientAddress"; // Replace with actual recipient
const amountInEth = "0.001"; // Amount in ETH

sendTransaction(recipientAddress, amountInEth)
  .then((hash) => {
    console.log('✅ Transaction process complete');
  })
  .catch((error) => {
    console.error('❌ Transaction failed');
  });
```

### Use a Paymaster for Gasless Transactions

The code is already set up to use Pimlico's paymaster. If you want to make truly gasless transactions, make sure your Pimlico API key has the appropriate permissions and credit.

## Documentation

- [Pimlico Docs](https://docs.pimlico.io/)
- [Safe Documentation](https://docs.safe.global/)
- [ERC-4337 Spec](https://eips.ethereum.org/EIPS/eip-4337)
- [Permissionless.js Tutorial](https://docs.pimlico.io/permissionless/tutorial/tutorial-1)