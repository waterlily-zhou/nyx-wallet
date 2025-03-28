/**
 * Unified Bundler Service
 *
 * This file serves as a single entry point for all bundler operations,
 * using the permissionless.js SDK implementation internally.
 */
import { createPublicClient, http, type Address, type Chain } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount, type Account } from 'viem/accounts';
import { createSmartAccountClient, type SmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient, type PimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint06Address } from 'viem/account-abstraction';

interface BundlerClients {
    publicClient: ReturnType<typeof createPublicClient>;
    pimlicoClient: PimlicoClient;
    owner: Account;
    safeAccount: Awaited<ReturnType<typeof toSafeSmartAccount>>;
    smartAccountClient: SmartAccountClient;
    chainId: number;
    privateKey: string;
    apiKey: string;
}

// Global cache to store initialized clients
const clientCache: Record<string, BundlerClients> = {};

/**
 * Initialize a Pimlico bundler client with permissionless.js SDK
 * @param privateKey The private key to use for the smart account
 * @param apiKey The Pimlico API key
 * @param chainId The chain ID (defaults to Base Sepolia testnet)
 */
export async function initializeBundler(
    privateKey: string,
    apiKey: string,
    chainId = 84532 // Base Sepolia by default
): Promise<BundlerClients> {
    // Create a cache key based on privateKey, apiKey, and chainId
    const cacheKey = `${privateKey}_${apiKey}_${chainId}`;
    
    // Check if we already have initialized clients for this key
    if (clientCache[cacheKey]) {
        console.log('🔄 Using cached clients from previous initialization');
        return clientCache[cacheKey];
    }
    
    console.log('🔨 Initializing new clients...');
    
    // Determine the network part of the URL based on chainId
    let network = 'base-sepolia';
    if (chainId === 8453) {
        network = 'base';
    }
    
    // Create the EOA owner account from the private key
    const owner = privateKeyToAccount(privateKey as `0x${string}`);
    console.log(`👤 Owner address: ${owner.address}`);
    
    // Create a public client for blockchain interaction
    const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(process.env.RPC_URL),
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
        chain: baseSepolia,
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
    
    // Cache the initialized clients
    const clients: BundlerClients = {
        publicClient,
        pimlicoClient,
        owner,
        safeAccount,
        smartAccountClient,
        chainId,
        privateKey,
        apiKey
    };
    
    clientCache[cacheKey] = clients;
    console.log('✅ Clients initialized and cached successfully');
    return clients;
}

interface SendUserOperationOptions {
    privateKey: string;
    apiKey: string;
    userOp?: any;
    to?: Address;
    data?: `0x${string}`;
    value?: bigint;
    entryPoint?: Address;
}

/**
 * Send a user operation via the bundler
 * @param options The options for the transaction
 * @returns The transaction hash
 */
export async function sendUserOperation({
    privateKey,
    apiKey,
    userOp,
    to,
    data,
    value = 0n,
    entryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address
}: SendUserOperationOptions): Promise<`0x${string}`> {
    try {
        // Initialize all the clients using Pimlico's SDK
        const { smartAccountClient } = await initializeBundler(privateKey, apiKey);
        console.log(`📦 Sending transaction via bundler...`);
        
        // If a specific userOp is provided, we could handle it here,
        // but for now we'll use the smartAccountClient which handles this internally
        // Send the transaction using the smartAccountClient
        // This internally creates a user operation, sponsors it with the paymaster, signs it, and sends it to the bundler
        const hash = await smartAccountClient.sendTransaction({
            account: smartAccountClient.account.address as Address,
            chain: baseSepolia,
            to: to || '0x0000000000000000000000000000000000000000' as Address,
            data: data || '0x',
            value,
        });
        console.log(`✅ Transaction sent via bundler. Hash: ${hash}`);
        return hash;
    }
    catch (error) {
        console.error('Error sending user operation:', error);
        throw error;
    }
}

interface TransactionReceipt {
    transactionHash: `0x${string}`;
    blockNumber: bigint;
    status: 'success' | 'reverted';
}

/**
 * Wait for a transaction receipt
 * @param transactionHash The transaction hash to wait for
 * @param privateKey The private key of the owner
 * @param apiKey The Pimlico API key
 */
export async function waitForUserOperationReceipt(
    transactionHash: `0x${string}`,
    privateKey: string,
    apiKey: string
): Promise<TransactionReceipt> {
    try {
        const { publicClient } = await initializeBundler(privateKey, apiKey);
        console.log(`⏳ Waiting for transaction to be confirmed: ${transactionHash}`);
        
        // Wait for the transaction receipt using the public client
        const receipt = await publicClient.waitForTransactionReceipt({
            hash: transactionHash,
        });
        
        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
        
        // Return a consistent format matching our previous implementation
        return {
            transactionHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status
        };
    }
    catch (error) {
        console.error('Error waiting for transaction receipt:', error);
        throw error;
    }
} 