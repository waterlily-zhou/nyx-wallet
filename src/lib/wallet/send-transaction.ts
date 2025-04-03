import { type Address, parseEther } from 'viem';
import { createUserOperation, signUserOperation } from '@zerodev/sdk';
import { createHash } from 'crypto';
import { bundlerClient, paymasterClient } from '@/lib/client-setup';
import { UserOperationStruct } from 'permissionless';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createSmartAccountClient } from 'permissionless';
import { http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { encodeUserOperation, keccak256 } from 'permissionless/utils';

export async function sendTransaction(
  deviceKey: string,
  serverKey: string,
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
    const finalKeyHex = createHash('sha256')
    .update(deviceKey + serverKey)
    .digest('hex');
    const finalPrivateKey = `0x${finalKeyHex}`;

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

export async function createUserOpWithoutSignature(params: {
  to: `0x${string}`,
  value: string,
  data: `0x${string}`,
  userId?: string,
}) {
  // 1. Connect to Pimlico
  const pimlicoClient = createPimlicoClient({
    transport: http('https://api.pimlico.io/v1/sepolia/rpc'),
    apiKey: process.env.PIMLICO_API_KEY || '',
  });
  const sac = createSmartAccountClient({
    chain: baseSepolia,
    transport: http('https://api.pimlico.io/v1/sepolia/rpc'),
    account: undefined, // This will be set later with the actual account
  });

  // 2. Construct a partial userOp (without signature)
  const sender = '0xyourSmartAccount'; // TODO: Get from userId
  const partial: Partial<UserOperationStruct> = {
    sender: sender as `0x${string}`,
    nonce: await pimlicoClient.getUserOperationCount({
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
      sender: sender as `0x${string}`,
    }),
    initCode: '0x',
    callData: '0x', // This should be encoded using sac.encodeExecute
    callGasLimit: 500000n,
    verificationGasLimit: 300000n,
    preVerificationGas: 21000n,
    maxFeePerGas: 1_000000000n,
    maxPriorityFeePerGas: 1_000000000n,
    paymasterAndData: '0x',
    signature: '0x',
  };
  const userOp = partial as UserOperationStruct;

  // 3. Calculate userOpHash
  const encoded = encodeUserOperation(userOp, false); // false -> don't include signature
  const userOpHash = keccak256(encoded);

  return { userOp, userOpHash };
}

export async function finalizeAndSendUserOp(userOp: UserOperationStruct): Promise<`0x${string}`> {
  // 1. Connect to Pimlico
  const pimlicoClient = createPimlicoClient({
    transport: http('https://api.pimlico.io/v1/sepolia/rpc'),
    apiKey: process.env.PIMLICO_API_KEY || '',
  });
  
  // 2. Send the UserOperation
  const userOpResult = await pimlicoClient.sendUserOperation({
    userOperation: userOp,
    entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  });
  
  return userOpResult; // userOpHash
}