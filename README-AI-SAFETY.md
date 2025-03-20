# AI-Powered Transaction Verification for Nyx Wallet

## Overview

This feature adds AI-powered transaction safety verification to the Nyx Wallet, providing users with a comprehensive security analysis before they send transactions. It helps users identify potential scams, suspicious activities, and technical issues with their transactions.

## Features

The AI transaction verification system performs the following checks:

1. **Call Data Verification**
   - Validates that the calldata shown to the user matches what will be executed on-chain
   - Detects suspicious function signatures that could indicate scams (e.g., unlimited approvals)
   - Ensures values and recipients match what's displayed in the UI

2. **Recipient Risk Assessment**
   - Checks if the recipient is a contract or a regular address
   - Evaluates the transaction history of the recipient
   - Identifies new addresses that may be suspicious
   - Generates a risk score based on multiple factors

3. **Transaction Simulation**
   - Simulates the transaction execution using Tenderly API
   - Predicts if the transaction will succeed or fail
   - Estimates gas usage and identifies unusual state changes
   - Warns about unexpected behavior

4. **Etherscan Data Analysis**
   - Checks if contract code is verified on Etherscan
   - Reviews the contract's deployment date and recent activity
   - Counts transaction volume to identify legitimacy
   - Flags newly deployed or unverified contracts

5. **AI Analysis**
   - Uses Claude (Anthropic) to analyze all collected data
   - Provides a comprehensive safety score from 0-100
   - Offers clear recommendations for the user
   - Identifies red flags in plain language

## How to Use

1. Start your transaction as usual in the Nyx Wallet
2. After clicking "Review Transaction," you'll see the transaction preview
3. Click the "Check Transaction Safety" button to run the AI verification
4. Review the safety analysis, including the overall safety score
5. See recommendations and red flags identified by the AI
6. Click "View Detailed Report" to see the complete technical analysis
7. Make an informed decision whether to proceed with the transaction

## Configuration

To use this feature, you'll need to configure the following API keys in your `.env` file:

```
ETHERSCAN_API_KEY=your_etherscan_api_key
TENDERLY_ACCESS_KEY=your_tenderly_access_key
TENDERLY_USER=your_tenderly_username
TENDERLY_PROJECT=your_tenderly_project
CLAUDE_API_KEY=your_claude_api_key
```

If any API key is missing, the system will still function with reduced capabilities.

## Technical Implementation

The verification system is built with three main components:

1. **Backend API Endpoint** (`/api/transaction-safety-check`): Orchestrates all verification services and returns combined results.

2. **Utility Functions** (`utils/transaction-safety.ts`): Contains all the verification logic, API integrations, and analysis algorithms.

3. **Frontend UI** (`main.js`): Collects transaction data, displays results with a user-friendly interface, and provides detailed reports.

## Limitations

- The system cannot detect all possible scams or security issues
- Risk assessment is based on heuristics and may produce false positives or negatives
- Transaction simulation has limitations and may not perfectly predict on-chain behavior
- API rate limits may affect the speed or completeness of the verification
- Always exercise caution and personal judgment when sending transactions

## Future Improvements

- Integration with more blockchain security services
- Enhanced AI model training with blockchain-specific scam patterns
- Support for more complex DeFi transactions and protocols
- Community-based threat intelligence database
- Real-time monitoring of suspicious activity on connected addresses 