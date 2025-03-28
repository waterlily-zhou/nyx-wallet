import { publicClient, createSafeSmartAccount, createSmartAccountClientWithPaymaster, bundlerClient, paymasterClient } from './client-setup';
import { type Address, parseEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export async function createWallet(owner: Address): Promise<Address> {
  try {
    // Generate a new private key for the smart account
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    // Create the smart account
    const smartAccount = await createSafeSmartAccount(account);

    // Set up the smart account client with paymaster
    const pimlicoUrl = `https://api.pimlico.io/v2/base-sepolia/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
    const smartAccountClient = createSmartAccountClientWithPaymaster(smartAccount, pimlicoUrl);

    // Deploy the smart account using the paymaster
    const userOp = await smartAccountClient.sendTransaction({
      account: smartAccount,
      to: smartAccount.address,
      data: '0x',
      value: BigInt(0),
    });

    // Wait for the transaction to be mined
    await smartAccountClient.waitForUserOperationReceipt({ hash: userOp });

    return smartAccount.address;
  } catch (error) {
    console.error('Error creating wallet:', error);
    throw error;
  }
}

export async function sendTransaction(
  from: Address,
  to: Address,
  value: bigint,
  data: string = '0x'
) {
  try {
    const nonce = await bundlerClient.getUserOperationCount({
      entryPoint: process.env.ENTRYPOINT_ADDRESS!,
      sender: from,
    });

    const userOperation = {
      sender: from,
      nonce,
      initCode: '0x',
      callData: data,
      callGasLimit: BigInt(100000),
      verificationGasLimit: BigInt(100000),
      preVerificationGas: BigInt(100000),
      maxFeePerGas: parseEther('0.000000001'),
      maxPriorityFeePerGas: parseEther('0.000000001'),
      paymasterAndData: '0x',
      signature: '0x',
    };

    // Get paymaster data
    const paymasterAndData = await paymasterClient.sponsorUserOperation({
      userOperation,
      entryPoint: process.env.ENTRYPOINT_ADDRESS!,
    });

    userOperation.paymasterAndData = paymasterAndData;

    // Sign the user operation
    // TODO: Implement signing logic

    // Send the user operation
    const userOpHash = await bundlerClient.sendUserOperation({
      userOperation,
      entryPoint: process.env.ENTRYPOINT_ADDRESS!,
    });

    return userOpHash;
  } catch (error) {
    console.error('Error sending transaction:', error);
    throw error;
  }
} 