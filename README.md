# Nyx Wallet

![Nyx Wallet](https://img.shields.io/badge/Nyx%20Wallet-Crypto%20Account%20Abstract-6246ea)

Nyx Wallet is an Account Abstraction wallet based on ERC-4337 that simplifies crypto transactions. 

## Why "Nyx"?

The Nyx wallet offers seamless and securewallet experience, transforming complex, encoded blockchain data into intuitive, easy-to-understand information for users.

## Current Status

The project has been successfully set up with:

- Modern, intuitive dark-themed UI

- Pimlico API key integration

- Real Safe Smart Contract Account creation using permissionless.js

- Reliable fallback implementation using direct Safe contracts

- Smart account client for transaction management

- Multiple transaction submission methods (Direct RPC or Bundler Service)

- Various gas payment options (including sponsored transactions)

## Features

- **Real Smart Contract Accounts**: Creates counterfactual Safe smart accounts with proper ERC-4337 support

- **Multiple Implementation Options**: Uses permissionless.js with fallback to direct Safe contracts for maximum reliability

- **Intuitive Transaction Interface**: Send crypto and messages with a clear preview of transaction details

- **Flexible Gas Payment**: Choose between different gas payment methods (including sponsored options)

- **Transaction Submission Options**: Use direct RPC calls or bundler service for optimal transaction handling


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

### Web Interface

Start the web server:

```bash
npm run web
```

Then open http://localhost:3000 in your browser to use the interface.

### Command Line Usage

#### Create your Smart Account

Run the main script to create your Smart Account:

```bash
npm run dev
```

This will:

1. Create a real Safe smart account on Sepolia testnet

2. Display the wallet address

3. Show the current balance

4. Provide instructions for using the account

#### Test Smart Contract Account Creation

To test the SCA creation directly:

```bash
# Test the JavaScript implementation
node src/scripts/test-permissionless-direct.js

# Test the TypeScript implementation (requires compilation)
npx tsc src/lib/utils/permissionless-v2.ts --outDir dist --esModuleInterop
node src/scripts/test-permissionless-v2.js
```

#### Troubleshooting

If you encounter Next.js cache errors:

```bash
# Clear the Next.js cache
./scripts/clear-cache.sh

# Restart the development server
npm run dev
```

#### Send a Transaction

To send a transaction from your Smart Account:

1. Edit `src/send-transaction.ts` to set your recipient address and amount

2. Make sure your smart account has some ETH for gas (if not using a paymaster)

3. Run:

```bash
npm run send
```