import * as dotenv from 'dotenv';
import { initializeSafeClients } from './utils/client-setup.js';
import { sendEthTransaction } from './utils/transaction-utils.js';

// Load environment variables
dotenv.config();

/**
 * Main function to initialize the wallet and demonstrate functionality
 */
async function main() {
  try {
    // Initialize all necessary clients and accounts using Safe implementation
    const { smartAccountClient, smartAccount, publicClient } = await initializeSafeClients();
    
    console.log('Smart account created successfully!');
    console.log('Now you can use this smart account to perform transactions.');
    console.log('To fund your wallet, send ETH to:', smartAccount.address);
    console.log('Explorer: https://sepolia.etherscan.io/address/' + smartAccount.address);
    
    // Example: Uncomment to send a transaction
    /*
    const recipientAddress = "0x0000000000000000000000000000000000000000"; // Replace with actual recipient
    const amountInEth = "0.000001"; // Very small amount (1 microETH) to test with
    
    try {
      const hash = await sendEthTransaction(smartAccountClient, recipientAddress, amountInEth);
      console.log('Transaction sent successfully!');
    } catch (error) {
      console.error('Error sending transaction:', error);
    }
    */
    
    return {
      smartAccountAddress: smartAccount.address,
      smartAccountClient,
      publicClient
    };
  } catch (error) {
    console.error('❌ Error in setup:', error);
    throw error;
  }
}

// Run the main function
main()
  .then(() => console.log('✅ Wallet initialized successfully'))
  .catch((error) => console.error('❌ Error:', error)); 