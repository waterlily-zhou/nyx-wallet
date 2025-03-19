# Nyx Wallet - Bringing Light to Crypto Transactions

![Nyx Wallet](https://img.shields.io/badge/Nyx%20Wallet-Bringing%20Light%20to%20Crypto-6246ea)

Nyx Wallet is an Account Abstraction wallet based on ERC-4337 that simplifies crypto transactions. Named after Nyx, the Greek goddess of night who gives birth to light, this wallet aims to illuminate the complex world of blockchain transactions.

## Why "Nyx"?

Just as Nyx (night) gives birth to light, our wallet brings clarity to the often obscure world of cryptocurrency transactions. We transform complex, encoded blockchain data into intuitive, easy-to-understand information for users.

## Current Status

The project has been successfully set up with:

- Modern, intuitive dark-themed UI

- Pimlico API key integration

- Safe smart account creation

- Smart account client for transaction management

- Multiple transaction submission methods (Direct RPC or Bundler Service)

- Various gas payment options (including sponsored transactions)

## Features

- **Smart Account Creation**: Creates a Safe smart account controlled by your private key

- **Intuitive Transaction Interface**: Send crypto and messages with a clear preview of transaction details

- **Flexible Gas Payment**: Choose between different gas payment methods (including sponsored options)

- **Transaction Submission Options**: Use direct RPC calls or bundler service for optimal transaction handling

- **Clean Dark-themed UI**: Reduces eye strain while providing clear visual hierarchy

- **Amount Support**: Send ETH or USDC with your transactions

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

1. Create a Safe smart account controlled by your private key

2. Display the wallet address

3. Show the current balance

4. Provide instructions for using the account

#### Send a Transaction

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

3. **Gas Payment**: Can be paid normally, with USDC, or sponsored via Pimlico's paymaster

4. **Signature**: Your private key signs transactions, but never interacts directly with the blockchain