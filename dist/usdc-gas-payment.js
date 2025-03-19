import { http, parseUnits, encodeFunctionData, formatUnits, maxUint256, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { createSmartAccountClient } from "permissionless";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { validateEnvironment, createOwnerAccount, createPublicClientForSepolia, createPimlicoClientInstance, createSafeSmartAccount } from "./utils/client-setup.js";
import { sendUserOperation, waitForUserOperationReceipt } from './utils/bundler-service.js';
// Load environment variables
dotenv.config();
// Constants
const SEPOLIA_USDC_ADDRESS = getAddress("0x1c7d4B196Cb0C7B01D743FbC6116a902379c7238"); // USDC on Sepolia
// Pimlico's ERC-20 Paymaster address
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
];
// Available gas payment methods
export var GasPaymentMethod;
(function (GasPaymentMethod) {
    GasPaymentMethod["DEFAULT"] = "default";
    GasPaymentMethod["SPONSORED"] = "sponsored";
    GasPaymentMethod["USDC"] = "usdc";
    GasPaymentMethod["BUNDLER"] = "bundler"; // Use bundler service (SDK implementation)
})(GasPaymentMethod || (GasPaymentMethod = {}));
/**
 * Send a transaction with the specified gas payment method
 * @param options Transaction options including gas payment method
 * @returns Transaction hash
 */
export async function sendTransaction(options) {
    const { recipient, data = "0x68656c6c6f", // "hello" in hex by default
    value = 0n, gasPaymentMethod = GasPaymentMethod.DEFAULT } = options;
    console.log(`Starting transaction with gas payment method: ${gasPaymentMethod}`);
    // Use bundler if specified
    if (gasPaymentMethod === GasPaymentMethod.BUNDLER) {
        return await sendTransactionWithBundler({ recipient, data, value });
    }
    // Use specific or hybrid gas payment methods
    if (gasPaymentMethod === GasPaymentMethod.SPONSORED) {
        return await sendTransactionWithSponsoredGas({ recipient, data, value });
    }
    else if (gasPaymentMethod === GasPaymentMethod.USDC) {
        return await sendTransactionWithUsdcGas({ recipient, data, value });
    }
    else {
        // Default hybrid approach
        return await sendTransactionWithHybridGasPayment();
    }
}
/**
 * Send a transaction using a bundler service
 */
async function sendTransactionWithBundler({ recipient, data = "0x68656c6c6f", value = 0n }) {
    console.log("🚀 Starting bundled transaction...");
    try {
        // Get environment variables
        const { apiKey, privateKey } = validateEnvironment();
        // Send the transaction using our unified bundler service
        const transactionHash = await sendUserOperation({
            privateKey,
            apiKey,
            to: recipient,
            data: data,
            value
        });
        console.log(`✅ Bundled transaction sent: ${transactionHash}`);
        // Wait for transaction to be mined
        console.log(`Waiting for bundled transaction to be confirmed...`);
        const receipt = await waitForUserOperationReceipt(transactionHash, privateKey, apiKey);
        console.log(`✅ Bundled transaction confirmed: ${receipt.transactionHash}`);
        return receipt.transactionHash;
    }
    catch (error) {
        console.error(`❌ Error in bundled transaction:`, error);
        throw error;
    }
}
/**
 * Send a transaction with sponsored gas only (no fallback)
 */
async function sendTransactionWithSponsoredGas({ recipient, data = "0x68656c6c6f", value = 0n }) {
    console.log("Starting sponsored transaction...");
    try {
        // Use shared utilities to validate environment and set up clients
        const { apiKey, privateKey } = validateEnvironment();
        const owner = createOwnerAccount(privateKey);
        const publicClient = createPublicClientForSepolia();
        const pimlicoClient = createPimlicoClientInstance(apiKey);
        // Create Pimlico transport URL
        const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
        // Create a Safe smart account
        const safeAccount = await createSafeSmartAccount(publicClient, owner);
        console.log(`Smart account address: ${safeAccount.address}`);
        // Create a sponsored client
        const sponsoredClient = createSmartAccountClient({
            account: safeAccount,
            chain: sepolia,
            bundlerTransport: http(pimlicoUrl),
            paymaster: pimlicoClient,
            userOperation: {
                estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
            }
        });
        // Get gas prices
        const gasPrices = await pimlicoClient.getUserOperationGasPrice();
        // Send the transaction with sponsorship
        const hash = await sponsoredClient.sendTransaction({
            to: recipient,
            data: data,
            value: value,
            maxFeePerGas: gasPrices.fast.maxFeePerGas,
            maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
        });
        console.log(`✅ Sponsored transaction sent: ${hash}`);
        // Wait for confirmation
        console.log(`Waiting for transaction to be confirmed...`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
        return hash;
    }
    catch (error) {
        console.error(`❌ Error in sponsored transaction:`, error);
        throw error;
    }
}
/**
 * Send a transaction with USDC gas payment only (no sponsorship attempt)
 */
async function sendTransactionWithUsdcGas({ recipient, data = "0x68656c6c6f", value = 0n }) {
    console.log("Starting USDC-paid transaction...");
    try {
        // Set up clients
        const { apiKey, privateKey } = validateEnvironment();
        const owner = createOwnerAccount(privateKey);
        const publicClient = createPublicClientForSepolia();
        const pimlicoClient = createPimlicoClientInstance(apiKey);
        const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
        const safeAccount = await createSafeSmartAccount(publicClient, owner);
        console.log(`Smart account address: ${safeAccount.address}`);
        // Check USDC balance
        const usdcBalance = await publicClient.readContract({
            address: SEPOLIA_USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [safeAccount.address],
        });
        const humanReadableUsdcBalance = formatUnits(usdcBalance, 6);
        console.log(`USDC balance: ${humanReadableUsdcBalance} USDC (${usdcBalance} units)`);
        // Minimum balance check
        const minimumUsdcBalance = parseUnits("1", 6); // 1 USDC minimum
        if (usdcBalance < minimumUsdcBalance) {
            throw new Error(`❌ Insufficient USDC balance. You need at least 1 USDC for gas payments.`);
        }
        // Get token quotes
        const quotes = await pimlicoClient.getTokenQuotes({
            chain: sepolia,
            tokens: [SEPOLIA_USDC_ADDRESS],
        });
        if (!quotes || quotes.length === 0) {
            throw new Error("❌ No token quotes returned for USDC");
        }
        const { paymaster, exchangeRate } = quotes[0];
        console.log(`💱 Exchange rate: 1 ETH = ${exchangeRate} USDC tokens`);
        // Check current allowance
        const currentAllowance = await publicClient.readContract({
            address: SEPOLIA_USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [safeAccount.address, paymaster],
        });
        console.log(`Current allowance: ${formatUnits(currentAllowance, 6)} USDC units`);
        // Approve if needed
        if (currentAllowance < parseUnits("1", 6)) {
            await approveUsdcForPaymaster(safeAccount, paymaster, pimlicoUrl, pimlicoClient, publicClient);
        }
        else {
            console.log(`✅ Sufficient allowance already exists`);
        }
        // Create client with USDC paymaster
        const erc20SmartAccountClient = createSmartAccountClient({
            account: safeAccount,
            chain: sepolia,
            bundlerTransport: http(pimlicoUrl),
            paymaster: pimlicoClient,
            userOperation: {
                estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
            }
        });
        // Send transaction
        console.log(`Sending transaction using USDC for gas...`);
        const gasPrices = await pimlicoClient.getUserOperationGasPrice();
        const hash = await erc20SmartAccountClient.sendTransaction({
            to: recipient,
            data: data,
            value: value,
            maxFeePerGas: gasPrices.fast.maxFeePerGas,
            maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
            paymasterContext: {
                token: SEPOLIA_USDC_ADDRESS
            }
        });
        console.log(`✅ Transaction sent with USDC payment: ${hash}`);
        // Wait for confirmation
        console.log(`Waiting for transaction to be confirmed...`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
        return hash;
    }
    catch (error) {
        console.error(`❌ Error in USDC-paid transaction:`, error);
        throw error;
    }
}
/**
 * Helper function to approve USDC for the paymaster
 */
async function approveUsdcForPaymaster(safeAccount, paymaster, pimlicoUrl, pimlicoClient, publicClient) {
    console.log(`Approving USDC spending for the paymaster...`);
    // Create a standard client for approval
    const standardSmartAccountClient = createSmartAccountClient({
        account: safeAccount,
        chain: sepolia,
        bundlerTransport: http(pimlicoUrl),
        paymaster: pimlicoClient,
        userOperation: {
            estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
        },
    });
    // Get gas prices
    const gasPrices = await pimlicoClient.getUserOperationGasPrice();
    // Send approval
    const approvalHash = await standardSmartAccountClient.sendTransaction({
        to: SEPOLIA_USDC_ADDRESS,
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
    // Wait for approval
    console.log(`Waiting for approval transaction to be confirmed...`);
    await publicClient.waitForTransactionReceipt({
        hash: approvalHash,
    });
    console.log(`✅ Approval transaction confirmed`);
}
async function sendTransactionWithHybridGasPayment() {
    console.log("🚀 Starting hybrid gas payment transaction...");
    console.log("Will try sponsored transaction first, then fall back to USDC if needed.");
    try {
        // Use shared utilities to validate environment and set up clients
        const { apiKey, privateKey } = validateEnvironment();
        const owner = createOwnerAccount(privateKey);
        const publicClient = createPublicClientForSepolia();
        const pimlicoClient = createPimlicoClientInstance(apiKey);
        // Create Pimlico transport URL (needed for client configuration)
        const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
        // Create a Safe smart account using shared utility
        console.log(`Loading Safe smart account...`);
        const safeAccount = await createSafeSmartAccount(publicClient, owner);
        console.log(`Smart account address: ${safeAccount.address}`);
        // Check ETH balance
        const ethBalance = await publicClient.getBalance({
            address: safeAccount.address,
        });
        console.log(`ETH balance: ${ethBalance} wei`);
        // Define the recipient and amount for our transaction
        const recipient = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"; // vitalik.eth
        const amount = 0n; // We're sending 0 ETH, just a test transaction
        // STEP 1: Try with standard sponsorship first
        console.log(`Attempting sponsored transaction (free gas)...`);
        try {
            // Create a sponsored client without token context
            const sponsoredClient = createSmartAccountClient({
                account: safeAccount,
                chain: sepolia,
                bundlerTransport: http(pimlicoUrl),
                paymaster: pimlicoClient,
                userOperation: {
                    estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
                }
            });
            // Get gas prices for the transaction
            const gasPrices = await pimlicoClient.getUserOperationGasPrice();
            // Send the transaction with standard sponsorship (no token context)
            const hash = await sponsoredClient.sendTransaction({
                to: recipient,
                data: "0x68656c6c6f", // "hello" in hex
                value: amount,
                maxFeePerGas: gasPrices.fast.maxFeePerGas,
                maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
            });
            console.log(`✅ Sponsored transaction sent: ${hash}`);
            console.log(`⏳ Waiting for transaction to be confirmed...`);
            const receipt = await publicClient.waitForTransactionReceipt({
                hash,
            });
            console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
            return hash;
        }
        catch (error) {
            // Check if error is related to sponsorship rejection
            const errorMessage = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
                ? error.message.toLowerCase()
                : '';
            const sponsorshipFailed = errorMessage.includes("denied") ||
                errorMessage.includes("policy") ||
                errorMessage.includes("paymaster") ||
                errorMessage.includes("sponsor");
            if (sponsorshipFailed) {
                console.log(`Sponsorship unavailable, falling back to USDC payment...`);
                // Continue with USDC payment logic below
            }
            else {
                // For other errors, rethrow
                console.error(`❌ Error in transaction:`, error);
                throw error;
            }
        }
        // STEP 2: If we get here, sponsorship failed - proceed with USDC payment
        // Check USDC balance
        const usdcBalance = await publicClient.readContract({
            address: SEPOLIA_USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [safeAccount.address],
        });
        // Convert to human-readable format (6 decimals for USDC)
        const humanReadableUsdcBalance = formatUnits(usdcBalance, 6);
        console.log(`USDC balance: ${humanReadableUsdcBalance} USDC (${usdcBalance} units)`);
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
        console.log(`Exchange rate: 1 ETH = ${exchangeRate} USDC tokens`);
        // Create a smart account client for standard sponsored transaction
        console.log(`Checking current USDC allowance...`);
        // Check current allowance
        const currentAllowance = await publicClient.readContract({
            address: SEPOLIA_USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [safeAccount.address, paymaster],
        });
        console.log(`Current allowance: ${formatUnits(currentAllowance, 6)} USDC units`);
        // If allowance is insufficient, send an approval transaction first
        if (currentAllowance < parseUnits("1", 6)) {
            console.log(`Approving USDC spending for the paymaster...`);
            // Create a standard client for approval transaction
            const standardSmartAccountClient = createSmartAccountClient({
                account: safeAccount,
                chain: sepolia,
                bundlerTransport: http(pimlicoUrl),
                paymaster: pimlicoClient,
                userOperation: {
                    estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
                },
            });
            try {
                // Get gas prices for the transaction
                const gasPrices = await pimlicoClient.getUserOperationGasPrice();
                // Send the approval transaction
                const approvalHash = await standardSmartAccountClient.sendTransaction({
                    to: SEPOLIA_USDC_ADDRESS,
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
                console.log(`Waiting for approval transaction to be confirmed...`);
                await publicClient.waitForTransactionReceipt({
                    hash: approvalHash,
                });
                console.log(`✅ Approval transaction confirmed`);
            }
            catch (error) {
                console.error(`❌ Error sending approval transaction:`, error);
                throw error;
            }
        }
        else {
            console.log(`✅ Sufficient allowance already exists`);
        }
        // Create a smart account client with USDC paymaster context
        console.log(`Setting up smart account client with USDC paymaster...`);
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
        console.log(`Sending transaction using USDC for gas...`);
        try {
            // Get gas prices for the transaction
            const gasPrices = await pimlicoClient.getUserOperationGasPrice();
            // Send the transaction with USDC paymaster context
            const hash = await erc20SmartAccountClient.sendTransaction({
                to: recipient,
                data: "0x68656c6c6f", // "hello" in hex
                value: amount,
                maxFeePerGas: gasPrices.fast.maxFeePerGas,
                maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
                paymasterContext: {
                    token: SEPOLIA_USDC_ADDRESS
                }
            });
            console.log(`✅ Transaction sent with USDC payment: ${hash}`);
            console.log(`Waiting for transaction to be confirmed...`);
            const receipt = await publicClient.waitForTransactionReceipt({
                hash,
            });
            console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
            return hash;
        }
        catch (error) {
            console.error(`❌ Transaction with USDC payment failed:`, error);
            throw error;
        }
    }
    catch (error) {
        console.error(`❌ Error in hybrid gas payment process:`, error);
        throw error;
    }
}
// Check if this is the main file being executed (ESM version)
const currentModule = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === currentModule;
if (isMain) {
    sendTransactionWithHybridGasPayment()
        .then(() => {
        console.log("✅ Hybrid gas payment process completed successfully");
        process.exit(0);
    })
        .catch((error) => {
        console.error("❌ Hybrid gas payment process failed:", error);
        process.exit(1);
    });
}
