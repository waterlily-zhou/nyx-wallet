import { parseEther, type Hex } from 'viem';
import * as dotenv from 'dotenv';
import { initializeSafeClients } from './utils/client-setup.js';
import { sendEthTransaction, getTransactionTrackingInfo } from './utils/transaction-utils.js';

// Load environment variables
dotenv.config();

// Function to send a transaction using your AA wallet
async function sendTransaction(recipient: string, amount: string) {
  try {
    // Initialize all necessary clients and accounts
    const { smartAccountClient } = await initializeSafeClients();
    
    // Send the transaction using the utility function
    const hash = await sendEthTransaction(smartAccountClient, recipient, amount);
    
    return hash;
  } catch (error) {
    console.error('❌ Error in transaction process:', error);
    throw error;
  }
}

// Example usage
const recipientAddress = "0x0000000000000000000000000000000000000000"; // Replace with actual recipient
const amountInEth = "0.000001"; // Very small amount (1 microETH) to test with

sendTransaction(recipientAddress, amountInEth)
  .then((hash) => {
    console.log('✅ Transaction process complete');
  })
  .catch((error) => {
    console.error('❌ Transaction failed');
  }); 