import { parseEther } from 'viem';
/**
 * Send an ETH transaction using a smart account
 * This function is compatible with the SmartAccountClient from permissionless.js
 */
export async function sendEthTransaction(smartAccountClient, // Using 'any' to avoid typing issues with different versions
recipient, amount) {
    // Parse the amount to wei
    const valueInWei = parseEther(amount);
    try {
        console.log(`🚀 Sending ${amount} ETH to ${recipient}...`);
        // Send the transaction
        const hash = await smartAccountClient.sendTransaction({
            to: recipient,
            value: valueInWei,
            data: '0x',
        });
        console.log(`✅ Transaction sent! User operation hash: ${hash}`);
        console.log(`🔍 Track on JiffyScan: https://jiffyscan.xyz/userOpHash/${hash}?network=sepolia`);
        return hash;
    }
    catch (error) {
        console.error('❌ Error sending transaction:', error);
        throw error;
    }
}
