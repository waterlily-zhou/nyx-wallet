import { createPublicClient, http, type Account, type PublicClient } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createSmartAccountClient } from 'permissionless';
import { privateKeyToAccount } from 'viem/accounts';

// Constants
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const;

// Validate environment variables
export function validateEnvironment(): { apiKey: string; privateKey: string } {
    const apiKey = process.env.PIMLICO_API_KEY;
    const privateKey = process.env.WALLET_PRIVATE_KEY;

    if (!apiKey) {
        throw new Error('PIMLICO_API_KEY not found in environment variables');
    }

    if (!privateKey) {
        throw new Error('WALLET_PRIVATE_KEY not found in environment variables');
    }

    return { apiKey, privateKey };
}

// Create owner account from private key
export function createOwnerAccount(privateKey: string): Account {
    return privateKeyToAccount(privateKey as `0x${string}`);
}

// Create public client for Sepolia
export function createPublicClientForSepolia(): PublicClient {
    return createPublicClient({
        chain: baseSepolia,
        transport: http()
    });
}

// Create Pimlico client instance
export function createPimlicoClientInstance(apiKey: string) {
    return createPimlicoClient({
        transport: http('https://api.pimlico.io/v1/sepolia/rpc'),
        apiKey
    });
}

// Create Safe smart account
export async function createSafeSmartAccount(publicClient: PublicClient, owner: Account) {
    const pimlicoClient = createPimlicoClient({
        transport: http('https://api.pimlico.io/v1/sepolia/rpc'),
        apiKey: process.env.PIMLICO_API_KEY!
    });

    return createSmartAccountClient({
        account: owner,
        chain: baseSepolia,
        bundlerTransport: http('https://api.pimlico.io/v1/sepolia/rpc'),
        paymaster: pimlicoClient
    });
} 