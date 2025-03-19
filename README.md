# Account Abstraction Wallet with Pimlico

This project implements an Account Abstraction wallet using Pimlico's infrastructure, based on ERC-4337 and the Safe smart contract wallet.

## Current Status

The project has been successfully set up with:

- Pimlico API key integration
- Safe smart account creation
- Smart account client for transaction management
- Transaction sending capabilities

## Features

- **Smart Account Creation**: Creates a Safe smart account controlled by your private key
- **Gasless Transactions**: Can use Pimlico's paymaster for sponsored transactions
- Sets up public client for Sepolia testnet
- Provides guidance on next steps

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

## How It Works

1. **Account Creation**: We use Pimlico and Safe to create a smart contract wallet that follows ERC-4337
2. **Transaction Handling**: Transactions are bundled as "UserOperations" and sent to Pimlico's bundler
3. **Gas Payment**: Can be paid normally or sponsored via Pimlico's paymaster
4. **Signature**: Your private key signs transactions, but never interacts directly with the blockchain