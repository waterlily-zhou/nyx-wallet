import { createPublicClient, http, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Constants
const ENTRY_POINT_ADDRESS_07 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

// Function to send a transaction using your AA wallet
async function sendTransaction(recipient: string, amount: string) {
  // Check for required env variables
  if (!process.env.PIMLICO_API_KEY) {
    throw new Error('PIMLICO_API_KEY is required');
  }
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY is required');
  }

  const apiKey = process.env.PIMLICO_API_KEY;
  const privateKey = process.env.PRIVATE_KEY as Hex;

  // Create a wallet from the private key
  const owner = privateKeyToAccount(privateKey);
  console.log('👤 Owner address:', owner.address);

  // Create a public client for Sepolia
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http("https://rpc.ankr.com/eth_sepolia"),
  });
    
  const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
    
  // Create Pimlico client
  const pimlicoClient = createPimlicoClient({
    transport: http(pimlicoUrl),
    entryPoint: {
      address: ENTRY_POINT_ADDRESS_07,
      version: "0.6",
    },
  });

  // Create a Safe smart account
  console.log('🔨 Loading Safe smart account...');
  const account = await toSafeSmartAccount({
    client: publicClient,
    owners: [owner],
    entryPoint: {
      address: ENTRY_POINT_ADDRESS_07,
      version: "0.6",
    },
    version: "1.4.1",
  });

  console.log(`💼 Smart account address: ${account.address}`);

  // Get balance before transaction
  const balanceBefore = await publicClient.getBalance({ address: account.address });
  console.log('💰 Current balance:', balanceBefore.toString(), 'wei');
  
  if (balanceBefore === 0n) {
    console.log('⚠️ Warning: Smart account has no ETH. Will attempt to use Pimlico paymaster for sponsorship.');
  }

  // Create a smart account client
  console.log('Setting up smart account client with paymaster...');
  const smartAccountClient = createSmartAccountClient({
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

// Example usage
const recipientAddress = "0x0000000000000000000000000000000000000000"; // Replace with actual recipient
const amountInEth = "0.000001"; // Very small amount (1 microETH) to test with

sendTransaction(recipientAddress, amountInEth)
  .then((hash) => {
    console.log('✅ Transaction process complete');
  })
  .catch((error) => {
    console.error('❌ Transaction failed');
  }); 