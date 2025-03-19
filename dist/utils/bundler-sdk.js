import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint06Address } from 'viem/account-abstraction';
/**
 * Initialize a Pimlico bundler client using their SDK approach
 * @param privateKey The private key to use for the smart account
 * @param apiKey The Pimlico API key
 * @param chainId The chain ID (defaults to Sepolia testnet)
 */
export async function initializePimlicoBundler(privateKey, apiKey, chainId = 11155111 // Sepolia by default
) {
    // Determine the network part of the URL based on chainId
    let network = 'sepolia';
    if (chainId === 84532) {
        network = 'base-sepolia';
    }
    else if (chainId === 8453) {
        network = 'base';
    }
    // Create the EOA owner account from the private key
    const owner = privateKeyToAccount(privateKey);
    console.log(`👤 Owner address: ${owner.address}`);
    // Create a public client for blockchain interaction
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http("https://ethereum-sepolia.publicnode.com"),
    });
    // Create the Pimlico client for bundler and paymaster services
    const pimlicoUrl = `https://api.pimlico.io/v2/${network}/rpc?apikey=${apiKey}`;
    const pimlicoClient = createPimlicoClient({
        transport: http(pimlicoUrl),
        entryPoint: {
            address: entryPoint06Address,
            version: "0.6",
        },
    });
    // Create a Safe smart account for the owner
    console.log('🔨 Loading Safe smart account...');
    const safeAccount = await toSafeSmartAccount({
        client: publicClient,
        owners: [owner],
        entryPoint: {
            address: entryPoint06Address,
            version: "0.6",
        },
        version: "1.4.1",
    });
    console.log(`💼 Smart account address: ${safeAccount.address}`);
    // Create the smart account client with Pimlico as bundler and paymaster
    const smartAccountClient = createSmartAccountClient({
        account: safeAccount,
        chain: sepolia,
        bundlerTransport: http(pimlicoUrl),
        paymaster: pimlicoClient,
        userOperation: {
            estimateFeesPerGas: async () => {
                const gasPrice = await pimlicoClient.getUserOperationGasPrice();
                console.log('Gas price estimation:', gasPrice);
                return gasPrice.fast;
            },
        },
    });
    return {
        publicClient,
        pimlicoClient,
        owner,
        safeAccount,
        smartAccountClient
    };
}
/**
 * Send a user operation via the bundler using Pimlico's SDK
 * @param options The options for the transaction
 * @returns The transaction hash
 */
export async function sendUserOperationWithSDK({ privateKey, apiKey, to, data, value = 0n }) {
    try {
        // Initialize all the clients using Pimlico's SDK
        const { smartAccountClient } = await initializePimlicoBundler(privateKey, apiKey);
        console.log(`📦 Sending transaction via bundler to ${to}...`);
        // Send the transaction using the smartAccountClient
        // This internally creates a user operation, sponsors it with the paymaster, signs it, and sends it to the bundler
        const hash = await smartAccountClient.sendTransaction({
            to,
            data: data || '0x',
            value,
        });
        console.log(`✅ Transaction sent via bundler. Hash: ${hash}`);
        return hash;
    }
    catch (error) {
        console.error('Error sending user operation with SDK:', error);
        throw error;
    }
}
/**
 * Wait for a transaction receipt using the SDK's client
 * @param transactionHash The transaction hash to wait for
 * @param privateKey The private key of the owner
 * @param apiKey The Pimlico API key
 */
export async function waitForTransactionReceipt(transactionHash, privateKey, apiKey) {
    try {
        const { publicClient } = await initializePimlicoBundler(privateKey, apiKey);
        console.log(`⏳ Waiting for transaction to be confirmed: ${transactionHash}`);
        // Wait for the transaction receipt using the public client
        const receipt = await publicClient.waitForTransactionReceipt({
            hash: transactionHash,
        });
        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
        return receipt;
    }
    catch (error) {
        console.error('Error waiting for transaction receipt:', error);
        throw error;
    }
}
