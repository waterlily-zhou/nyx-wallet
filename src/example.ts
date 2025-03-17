import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import {
  createSmartAccountClient,
  signerToSimpleSmartAccount,
  type SmartAccount
} from 'permissionless';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Constants
const ENTRYPOINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

async function main() {
  // Check for required env variables
  if (!process.env.PIMLICO_API_KEY) {
    throw new Error('PIMLICO_API_KEY is required');
  }

  // Generate a new private key if one doesn't exist
  const privateKey = process.env.PRIVATE_KEY || '0x' + Array(64).fill('0').map(() => Math.floor(Math.random() * 16).toString(16)).join('');
  console.log('Using private key:', privateKey.slice(0, 6) + '...' + privateKey.slice(-4));

  // Set up the Ethereum account from the private key
  const owner = privateKeyToAccount(privateKey as `0x${string}`);
  console.log('Owner EOA address:', owner.address);

  // Create a public client for Sepolia testnet
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http()
  });

  // Pimlico API URL with your API key
  const pimlicoApiKey = process.env.PIMLICO_API_KEY;
  const bundlerUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${pimlicoApiKey}`;

  console.log('Setting up Pimlico client...');
  // Create the Pimlico client
  const pimlicoClient = createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: {
      address: ENTRYPOINT_ADDRESS,
      version: '0.6'
    }
  });

  console.log('Creating smart account...');
  // Create a simple smart account using the private key as the signer
  const smartAccount = await signerToSimpleSmartAccount(publicClient, {
    entryPoint: ENTRYPOINT_ADDRESS,
    signer: owner,
    factoryAddress: '0x9406Cc6185a346906296840746125a0E44976454' // SimpleAccountFactory address for Sepolia
  });

  console.log('Smart Account Address:', smartAccount.address);

  // Create a smart account client
  const smartAccountClient = createSmartAccountClient({
    account: smartAccount,
    chain: sepolia,
    bundlerTransport: http(bundlerUrl),
    middleware: {
      gasPrice: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
      sponsorUserOperation: pimlicoClient.sponsorUserOperation
    }
  });

  console.log('Smart account created successfully!');
  console.log('Now you can use this smart account to perform transactions.');
  console.log('To fund your wallet, send ETH to:', smartAccount.address);
  console.log('Explorer: https://sepolia.etherscan.io/address/' + smartAccount.address);

  // Get smart account balance
  const balance = await publicClient.getBalance({
    address: smartAccount.address
  });
  console.log('Smart account balance:', balance.toString());

  // Example: Send a transaction (uncomment to use)
  /*
  try {
    console.log('Sending a test transaction...');
    const userOpHash = await smartAccountClient.sendTransaction({
      to: '0x0000000000000000000000000000000000000000', // Replace with recipient
      value: 0n, // 0 ETH
      data: '0x'
    });
    console.log('Transaction sent! UserOpHash:', userOpHash);
    console.log('Track on JiffyScan: https://jiffyscan.xyz/userOpHash/' + userOpHash);
  } catch (error) {
    console.error('Error sending transaction:', error);
  }
  */

  return {
    smartAccountAddress: smartAccount.address,
    smartAccountClient,
    publicClient
  };
}

// Run the main function
main()
  .then((result) => console.log('✅ Setup complete'))
  .catch((error) => console.error('❌ Error:', error)); 