/**
 * Unified Bundler Service
 * 
 * This file serves as a single entry point for all bundler operations,
 * using the permissionless.js SDK implementation internally.
 */

import { Hex } from 'viem';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint06Address } from 'viem/account-abstraction';

// Define common types used in the service
export type UserOperation = {
  sender: string;
  nonce: string | bigint;
  initCode: string;
  callData: string;
  callGasLimit: string | bigint;
  verificationGasLimit: string | bigint;
  preVerificationGas: string | bigint;
  maxFeePerGas: string | bigint;
  maxPriorityFeePerGas: string | bigint;
  paymasterAndData: string;
  signature: string;
}

/**
 * Initialize a Pimlico bundler client with permissionless.js SDK
 * @param privateKey The private key to use for the smart account
 * @param apiKey The Pimlico API key
 * @param chainId The chain ID (defaults to Sepolia testnet)
 */
export async function initializeBundler(
  privateKey: Hex,
  apiKey: string,
  chainId: number = 11155111 // Sepolia by default
) {
  // Determine the network part of the URL based on chainId
  let network = 'sepolia';
  if (chainId === 84532) {
    network = 'base-sepolia';
  } else if (chainId === 8453) {
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
  entryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Hex
}: {
  privateKey: Hex,
  apiKey: string,
  userOp?: UserOperation,
  to?: Hex,
  data?: Hex,
  value?: bigint,
  entryPoint?: Hex
}): Promise<Hex> {
  try {
    // Initialize all the clients using Pimlico's SDK
    const { smartAccountClient } = await initializeBundler(privateKey, apiKey);
    
    console.log(`📦 Sending transaction via bundler...`);
    
    // If a specific userOp is provided, we could handle it here,
    // but for now we'll use the smartAccountClient which handles this internally
    
    // Send the transaction using the smartAccountClient
    // This internally creates a user operation, sponsors it with the paymaster, signs it, and sends it to the bundler
    const hash = await smartAccountClient.sendTransaction({
      to: to || '0x0000000000000000000000000000000000000000' as Hex,
      data: data || '0x',
      value,
    });
    
    console.log(`✅ Transaction sent via bundler. Hash: ${hash}`);
    return hash;
  } catch (error) {
    console.error('Error sending user operation:', error);
    throw error;
  }
}

/**
 * Wait for a transaction receipt
 * @param transactionHash The transaction hash to wait for
 * @param privateKey The private key of the owner
 * @param apiKey The Pimlico API key
 */
export async function waitForUserOperationReceipt(
  transactionHash: Hex,
  privateKey: Hex, 
  apiKey: string
): Promise<any> {
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
  } catch (error) {
    console.error('Error waiting for transaction receipt:', error);
    throw error;
  }
} 