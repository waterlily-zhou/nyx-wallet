import { createPublicClient, http } from 'viem';
/**
 * Initialize the Pimlico bundler transport
 */
export async function initializeBundler(chainId = 11155111) {
    // Determine the network part of the URL based on chainId
    let network = 'sepolia';
    if (chainId === 84532) {
        network = 'base-sepolia';
    }
    else if (chainId === 8453) {
        network = 'base';
    }
    if (!process.env.PIMLICO_API_KEY) {
        throw new Error("PIMLICO_API_KEY is required in the environment variables");
    }
    // Create a custom client with the bundler URL
    const bundlerUrl = `https://api.pimlico.io/v1/${network}/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
    const bundlerClient = createPublicClient({
        transport: http(bundlerUrl),
    });
    return bundlerClient;
}
/**
 * Send a user operation via the bundler
 * @param userOp The user operation to send
 * @param entryPoint The entry point address
 * @returns The user operation hash
 */
export async function sendUserOperation(userOp, entryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' // Default EntryPoint
) {
    const bundlerClient = await initializeBundler();
    try {
        // We need to convert all bigint fields to hex strings to ensure proper JSON serialization
        const serializedUserOp = Object.entries(userOp).reduce((acc, [key, value]) => {
            acc[key] = typeof value === 'bigint' ? `0x${value.toString(16)}` : value;
            return acc;
        }, {});
        // Manually call the RPC method with the correct data format
        const userOpHash = await bundlerClient.transport.request({
            method: 'eth_sendUserOperation',
            params: [serializedUserOp, entryPoint],
        });
        console.log(`UserOperation sent via bundler. Hash: ${userOpHash}`);
        return userOpHash;
    }
    catch (error) {
        console.error('Error sending user operation:', error);
        throw error;
    }
}
/**
 * Wait for a user operation to be mined
 * @param userOpHash The user operation hash
 * @param entryPoint The entry point address
 * @returns The transaction hash
 */
export async function waitForUserOperationReceipt(userOpHash, entryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789') {
    const bundlerClient = await initializeBundler();
    // Poll for the receipt
    let receipt = null;
    const maxRetries = 30;
    let retries = 0;
    while (!receipt && retries < maxRetries) {
        try {
            // Manually call the RPC method
            const response = await bundlerClient.transport.request({
                method: 'eth_getUserOperationReceipt',
                params: [userOpHash],
            });
            // Try to parse the response as our expected type
            receipt = response;
            if (receipt && receipt.receipt && receipt.receipt.transactionHash) {
                console.log(`UserOperation mined! Transaction hash: ${receipt.receipt.transactionHash}`);
                return {
                    transactionHash: receipt.receipt.transactionHash
                };
            }
        }
        catch (error) {
            console.log(`Waiting for UserOperation to be mined... (${retries + 1}/${maxRetries})`);
        }
        // Wait 2 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
        retries++;
    }
    throw new Error('Timeout waiting for UserOperation receipt');
}
