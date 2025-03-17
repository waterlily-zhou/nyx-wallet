import { parseEther, type Hex } from 'viem';

/**
 * Send an ETH transaction using a smart account
 * This function is compatible with the SmartAccountClient from permissionless.js
 */
export async function sendEthTransaction(
  smartAccountClient: any, // Using 'any' to avoid typing issues with different versions
  recipient: string,
  amount: string
): Promise<Hex> {
  // Parse the amount to wei
  const valueInWei = parseEther(amount);
  
  try {
    console.log(`🚀 Sending ${amount} ETH to ${recipient}...`);
    
    // Send the transaction
    const hash = await smartAccountClient.sendTransaction({
      to: recipient as Hex,
      value: valueInWei,
      data: '0x',
    });
    
    console.log(`✅ Transaction sent! User operation hash: ${hash}`);
    console.log(`🔍 Track on JiffyScan: https://jiffyscan.xyz/userOpHash/${hash}?network=sepolia`);
    
    return hash;
  } catch (error) {
    console.error('❌ Error sending transaction:', error);
    throw error;
  }
}

/**
 * Checks if a transaction hash exists on JiffyScan and provides tracking information
 */
export function getTransactionTrackingInfo(hash: Hex): string {
  return `🔍 Track on JiffyScan: https://jiffyscan.xyz/userOpHash/${hash}?network=sepolia`;
}

/**
 * Format transaction result information
 */
export function formatTransactionResult(hash: Hex): string {
  return `
✅ Transaction successfully sent!
${getTransactionTrackingInfo(hash)}
`;
} 