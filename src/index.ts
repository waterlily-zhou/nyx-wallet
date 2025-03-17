import { createPublicClient, http, type Hex } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import * as dotenv from 'dotenv';
import { writeFileSync } from 'fs';

// Load environment variables
dotenv.config();

// Constants
const ENTRY_POINT_ADDRESS_07 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

async function main() {
  // Check for required env variables
  if (!process.env.PIMLICO_API_KEY) {
    throw new Error('PIMLICO_API_KEY is required');
  }

  const apiKey = process.env.PIMLICO_API_KEY;
  if (!apiKey) throw new Error("Missing PIMLICO_API_KEY");

  // Use or generate a private key
  const privateKey = 
    (process.env.PRIVATE_KEY as Hex) ?? 
    (() => {
      const pk = generatePrivateKey();
      writeFileSync(".env", `PRIVATE_KEY=${pk}`);
      return pk;
    })();

  // Create a wallet from the private key
  const owner = privateKeyToAccount(privateKey);
  console.log('👤 Owner address:', owner.address);

  // Create a public client for Sepolia
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http("https://rpc.ankr.com/eth_sepolia"),
  });
    
  const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
  console.log('Bundler URL:', pimlicoUrl);
    
  // Create Pimlico client
  const pimlicoClient = createPimlicoClient({
    transport: http(pimlicoUrl),
    entryPoint: {
      address: ENTRY_POINT_ADDRESS_07,
      version: "0.6",
    },
  });

  // Create a Safe smart account
  console.log('🔨 Creating Safe smart account...');
  const account = await toSafeSmartAccount({
    client: publicClient,
    owners: [owner],
    entryPoint: {
      address: ENTRY_POINT_ADDRESS_07,
      version: "0.6",
    },
    version: "1.4.1",
  });

  console.log(`✅ Smart account created!`);
  console.log(`💼 Smart account address: ${account.address}`);
  console.log(`🔍 Explorer: https://sepolia.etherscan.io/address/${account.address}`);

  // Create a smart account client
  const smartAccountClient = createSmartAccountClient({
    account,
    chain: sepolia, // Use sepolia rather than baseSepolia
    bundlerTransport: http(pimlicoUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  });

  // Get balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('💰 Smart account balance:', balance.toString(), 'wei');
  
  return {
    smartAccountAddress: account.address,
    smartAccountClient,
    publicClient
  };
}

// Run the main function
main()
  .then((result) => {
    console.log('\n✅ Setup complete!');
    console.log('You can now send transactions using your Smart Account.');
    console.log('To send a transaction, use:');
    console.log(`
    const hash = await result.smartAccountClient.sendTransaction({
      to: "0xRecipientAddress",
      value: 1000000000000000n, // 0.001 ETH
      data: "0x"
    });
    `);
  })
  .catch((error) => console.error('❌ Error:', error)); 