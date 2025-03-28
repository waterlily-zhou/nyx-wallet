import { parseEther } from 'viem';
import type { Address, SendTransactionParameters } from 'viem';
import type { SmartAccountClient } from 'permissionless';
import { baseSepolia } from 'viem/chains';

/**
 * Send an ETH transaction using a smart account
 * This function is compatible with the SmartAccountClient from permissionless.js
 */
export async function sendEthTransaction(
    smartAccountClient: SmartAccountClient,
    recipient: Address,
    amount: string
): Promise<`0x${string}`> {
    // Parse the amount to wei
    const valueInWei = parseEther(amount);
    try {
        console.log(`🚀 Sending ${amount} ETH to ${recipient}...`);
        
        // Check if account is defined
        if (!smartAccountClient.account) {
            throw new Error('Smart account client has no account configured');
        }
        
        // Send the transaction
        const txParams: SendTransactionParameters = {
            account: smartAccountClient.account.address as Address,
            chain: baseSepolia,
            to: recipient,
            value: valueInWei,
            data: '0x',
        };
        const hash = await smartAccountClient.sendTransaction(txParams);
        console.log(`✅ Transaction sent! User operation hash: ${hash}`);
        console.log(`🔍 Track on JiffyScan: https://jiffyscan.xyz/userOpHash/${hash}?network=sepolia`);
        return hash;
    }
    catch (error) {
        console.error('❌ Error sending transaction:', error);
        throw error;
    }
} 