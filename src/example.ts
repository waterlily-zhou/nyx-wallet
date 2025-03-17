import * as dotenv from 'dotenv';
import { initializeSimpleAccountClients } from './utils/client-setup.js';

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Initialize all necessary clients and accounts using Simple Account implementation
    const { smartAccountClient, smartAccount, publicClient } = await initializeSimpleAccountClients();
    
    console.log('Smart account created successfully!');
    console.log('Now you can use this smart account to perform transactions.');
    console.log('To fund your wallet, send ETH to:', smartAccount.address);
    console.log('Explorer: https://sepolia.etherscan.io/address/' + smartAccount.address);

    // Example: Send a transaction (uncomment to use)
    /*
    try {
      console.log('Sending a test transaction...');
      const userOpHash = await smartAccountClient.sendTransaction({
        to: '0x0000000000000000000000000000000000000000', // Replace with recipient
        value: 0n, // 0 ETH
        data: '0x'
      });
      console.log('Transaction sent! UserOpHash:', userOpHash);
      console.log('Track on JiffyScan: https://jiffyscan.xyz/userOpHash/' + userOpHash);
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
    console.error('❌ Error in example setup:', error);
    throw error;
  }
}

// Run the main function
main()
  .then((result) => console.log('✅ Setup complete'))
  .catch((error) => console.error('❌ Error:', error)); 