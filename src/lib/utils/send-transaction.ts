import * as dotenv from 'dotenv';
import { initializeSafeClients } from '@/lib/client-setup';
import { sendEthTransaction } from '@/lib/utils/transaction-utils';
import type { Address } from 'viem';

// Load environment variables
dotenv.config();

/**
 * Function to send a transaction using your AA wallet
 * @param recipient The recipient address
 * @param amount The amount in ETH
 * @returns The transaction hash
 */
export async function sendTransaction(recipient: Address, amount: string): Promise<`0x${string}`> {
    try {
        // Initialize all necessary clients and accounts
        const { smartAccountClient } = await initializeSafeClients();

        // Send the transaction using the utility function
        const hash = await sendEthTransaction(smartAccountClient, recipient, amount);
        return hash;
    }
    catch (error) {
        console.error('❌ Error in transaction process:', error);
        throw error;
    }
}

// Example usage
const recipientAddress = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045" as const; // vitalik.eth
const amountInEth = "0.000001"; // Very small amount to test with

sendTransaction(recipientAddress, amountInEth)
    .then((hash) => {
        console.log('✅ Transaction process complete');
    })
    .catch((error) => {
        console.error('❌ Transaction failed');
    }); 