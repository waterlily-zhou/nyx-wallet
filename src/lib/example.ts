import * as dotenv from 'dotenv';
import { initializeSimpleAccountClients } from '@/lib/client-setup';
import type { SmartAccountClient } from 'permissionless';
import type { PublicClient } from 'viem';
import { baseSepolia } from 'viem/chains';

// Load environment variables
dotenv.config();

interface ExampleSetup {
    smartAccountAddress: `0x${string}`;
    smartAccountClient: SmartAccountClient;
    publicClient: PublicClient;
}

async function main(): Promise<ExampleSetup> {
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
          if (!smartAccountClient.account) {
            throw new Error('Smart account client has no account configured');
          }

          console.log('Sending a test transaction...');
          const userOpHash = await smartAccountClient.sendTransaction({
            account: smartAccountClient.account.address,
            chain: baseSepolia,
            to: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Replace with recipient
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
    }
    catch (error) {
        console.error('❌ Error in example setup:', error);
        throw error;
    }
}

// Run the main function
main()
    .then((result) => console.log('✅ Setup complete'))
    .catch((error) => console.error('❌ Error:', error)); 