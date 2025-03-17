import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, parseUnits, Address, Hex, encodeFunctionData, formatUnits, maxUint256, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { entryPoint06Address } from "viem/account-abstraction";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Constants
const SEPOLIA_USDC_ADDRESS = getAddress("0x1c7d4B196Cb0C7B01D743FbC6116a902379c7238"); // USDC on Sepolia

// Pimlico's ERC-20 Paymaster address - using the official one from the tutorial
// This is a special contract that accepts ERC-20 tokens for gas payment
const SEPOLIA_ERC20_PAYMASTER = "0x00000000000000fB866DaAA79352cC568a005D96";

// Define ABI for ERC-20 tokens
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Send a transaction using USDC to pay for gas
 */
async function sendTransactionWithUsdcGas() {
  console.log("🚀 Starting USDC gas payment transaction...");
  console.log("This transaction will use your USDC tokens to pay for gas fees!");

  try {
    // Get the private key
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("❌ Private key not found in environment variables");
    }

    // Get the API key
    const apiKey = process.env.PIMLICO_API_KEY;
    if (!apiKey) {
      throw new Error("❌ Pimlico API key not found in environment variables");
    }

    // Create Pimlico transport URL
    const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;

    // Create a client for the owner account
    const owner = privateKeyToAccount(privateKey as Hex);
    console.log(`👤 Owner address: ${owner.address}`);

    // Create public client
    const publicClient = createPublicClient({
      transport: http("https://rpc.ankr.com/eth_sepolia"),
      chain: sepolia,
    });

    // Create Pimlico client for sponsoring and fee estimation
    console.log(`🔄 Creating Pimlico client...`);
    const pimlicoClient = createPimlicoClient({
      transport: http(pimlicoUrl),
      entryPoint: {
        address: entryPoint06Address,
        version: "0.6",
      },
    });

    // Create a Safe smart account
    console.log(`🔨 Loading Safe smart account...`);
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

    // Check ETH balance
    const ethBalance = await publicClient.getBalance({
      address: safeAccount.address,
    });
    console.log(`💰 ETH balance: ${ethBalance} wei`);

    // Check USDC balance
    const usdcBalance = await publicClient.readContract({
      address: SEPOLIA_USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [safeAccount.address],
    });
    console.log(`💵 USDC balance: ${usdcBalance} units`);
    
    // Convert to human-readable format (6 decimals for USDC)
    const humanReadableUsdcBalance = formatUnits(usdcBalance, 6);
    console.log(`💵 USDC balance: ${humanReadableUsdcBalance} USDC`);

    // Minimum balance required for gas payment
    const minimumUsdcBalance = parseUnits("1", 6); // 1 USDC minimum
    if (usdcBalance < minimumUsdcBalance) {
      throw new Error(`❌ Insufficient USDC balance. You need at least 1 USDC for gas payments.`);
    }

    // Get token quotes from Pimlico
    const quotes = await pimlicoClient.getTokenQuotes({
      chain: sepolia,
      tokens: [SEPOLIA_USDC_ADDRESS],
    });

    if (!quotes || quotes.length === 0) {
      throw new Error("❌ No token quotes returned for USDC");
    }

    const { paymaster, exchangeRate, postOpGas } = quotes[0];
    
    // Create a smart account client for standard sponsored transaction
    console.log(`🔄 Setting up a standard sponsored client for approval...`);
    const standardSmartAccountClient = createSmartAccountClient({
      account: safeAccount,
      chain: sepolia,
      bundlerTransport: http(pimlicoUrl),
      paymaster: pimlicoClient,
      userOperation: {
        estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
      },
    });

    // Check current allowance
    console.log(`🔍 Checking current USDC allowance...`);
    const currentAllowance = await publicClient.readContract({
      address: SEPOLIA_USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [safeAccount.address, paymaster],
    });
    
    console.log(`Current allowance: ${formatUnits(currentAllowance, 6)} USDC units`);
    
    // Define the recipient and amount for our main transaction
    const recipient = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
    const amount = 0n; // We're sending 0 ETH, just a test transaction
    
    // If allowance is insufficient, send an approval transaction first
    if (currentAllowance < parseUnits("1", 6)) {
      console.log(`🔄 Approving USDC spending for the paymaster...`);
      
      try {
        // Get gas prices for the transaction
        const gasPrices = await pimlicoClient.getUserOperationGasPrice();

        // Send the approval transaction
        const approvalHash = await standardSmartAccountClient.sendTransaction({
          to: SEPOLIA_USDC_ADDRESS as Hex,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "approve",
            args: [paymaster, maxUint256],
          }),
          value: 0n,
          maxFeePerGas: gasPrices.fast.maxFeePerGas,
          maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
        });
        
        console.log(`✅ Approval transaction sent: ${approvalHash}`);
        
        // Wait for approval to be confirmed
        console.log(`⏳ Waiting for approval transaction to be confirmed...`);
        await publicClient.waitForTransactionReceipt({
          hash: approvalHash,
        });
        console.log(`✅ Approval transaction confirmed`);
      } catch (error) {
        console.error(`❌ Error sending approval transaction:`, error);
        throw error;
      }
    } else {
      console.log(`✅ Sufficient allowance already exists`);
    }
    
    // Create a smart account client with USDC paymaster context
    console.log(`🔄 Setting up smart account client with USDC paymaster...`);
    
    // Create a smart account client with the same account but with USDC paymaster context
    const erc20SmartAccountClient = createSmartAccountClient({
      account: safeAccount,
      chain: sepolia,
      bundlerTransport: http(pimlicoUrl),
      paymaster: pimlicoClient,
      userOperation: {
        estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
      }
    });
    
    // Send the actual transaction with USDC as gas
    console.log(`🔄 Sending transaction using USDC for gas...`);
    try {
      // Get gas prices for the transaction
      const gasPrices = await pimlicoClient.getUserOperationGasPrice();

      // Send the transaction with USDC paymaster context
      const hash = await erc20SmartAccountClient.sendTransaction({
        to: recipient as Hex,
        data: "0x68656c6c6f" as Hex, // "hello" in hex
        value: amount,
        maxFeePerGas: gasPrices.fast.maxFeePerGas,
        maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
        paymasterContext: {
          token: SEPOLIA_USDC_ADDRESS
        }
      });
      
      console.log(`✅ Transaction sent: ${hash}`);
      
      console.log(`⏳ Waiting for transaction to be confirmed...`);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });
      
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      return hash;
    } catch (error) {
      console.error(`❌ Transaction failed:`, error);
      throw error;
    }
  } catch (error) {
    console.error(`❌ Error sending transaction with USDC gas payment:`, error);
    throw error;
  }
}

// Check if this is the main file being executed (ESM version)
const currentModule = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === currentModule;

if (isMain) {
  sendTransactionWithUsdcGas()
    .then(() => {
      console.log("✅ USDC gas payment completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ USDC gas payment failed:", error);
      process.exit(1);
    });
}

export { sendTransactionWithUsdcGas }; 