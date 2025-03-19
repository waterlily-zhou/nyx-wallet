import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import * as dotenv from 'dotenv';
// Load environment variables
dotenv.config();
// Constants
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
export function validateEnvironment() {
    if (!process.env.PIMLICO_API_KEY) {
        throw new Error('PIMLICO_API_KEY is required');
    }
    if (!process.env.PRIVATE_KEY) {
        throw new Error('PRIVATE_KEY is required');
    }
    return {
        apiKey: process.env.PIMLICO_API_KEY,
        privateKey: process.env.PRIVATE_KEY
    };
}
export function createOwnerAccount(privateKey) {
    const owner = privateKeyToAccount(privateKey);
    console.log('👤 Owner address:', owner.address);
    return owner;
}
export function createPublicClientForSepolia() {
    // Use a public Sepolia RPC endpoint without API key requirements
    return createPublicClient({
        chain: sepolia,
        transport: http("https://ethereum-sepolia.publicnode.com"),
    });
}
export function createPimlicoClientInstance(apiKey) {
    const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
    return createPimlicoClient({
        transport: http(pimlicoUrl),
        entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.6",
        },
    });
}
export async function createSafeSmartAccount(publicClient, owner) {
    console.log('🔨 Loading Safe smart account...');
    const account = await toSafeSmartAccount({
        client: publicClient,
        owners: [owner],
        entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.6",
        },
        version: "1.4.1",
    });
    console.log(`💼 Smart account address: ${account.address}`);
    return account;
}
export async function createSimpleSmartAccount(publicClient, owner) {
    console.log('🔨 Loading Smart account (using Safe implementation)...');
    console.log('⚠️ Note: Using Safe implementation as Simple Account API has changed in permissionless.js');
    // For simplicity, using Safe account implementation
    return createSafeSmartAccount(publicClient, owner);
}
export async function checkAccountBalance(publicClient, address) {
    const balance = await publicClient.getBalance({ address });
    console.log('💰 Current balance:', balance.toString(), 'wei');
    return balance;
}
export function createSmartAccountClientWithPaymaster(account, // Using 'any' to handle different account types
pimlicoClient, pimlicoUrl) {
    console.log('Setting up smart account client with paymaster...');
    return createSmartAccountClient({
        account,
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
}
// Initialize all clients and accounts for Safe implementation
export async function initializeSafeClients() {
    const { apiKey, privateKey } = validateEnvironment();
    const owner = createOwnerAccount(privateKey);
    const publicClient = createPublicClientForSepolia();
    const pimlicoClient = createPimlicoClientInstance(apiKey);
    const smartAccount = await createSafeSmartAccount(publicClient, owner);
    const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
    const smartAccountClient = createSmartAccountClientWithPaymaster(smartAccount, pimlicoClient, pimlicoUrl);
    await checkAccountBalance(publicClient, smartAccount.address);
    return {
        publicClient,
        pimlicoClient,
        owner,
        smartAccount,
        smartAccountClient
    };
}
/*
  Initialize all clients and accounts for Simple Account implementation
  (Currently using Safe implementation under the hood)
 */
export async function initializeSimpleAccountClients() {
    const { apiKey, privateKey } = validateEnvironment();
    const owner = createOwnerAccount(privateKey);
    const publicClient = createPublicClientForSepolia();
    const pimlicoClient = createPimlicoClientInstance(apiKey);
    const smartAccount = await createSimpleSmartAccount(publicClient, owner);
    const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
    const smartAccountClient = createSmartAccountClientWithPaymaster(smartAccount, pimlicoClient, pimlicoUrl);
    await checkAccountBalance(publicClient, smartAccount.address);
    return {
        publicClient,
        pimlicoClient,
        owner,
        smartAccount,
        smartAccountClient
    };
}
