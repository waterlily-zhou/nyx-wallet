import { type Address, parseEther, encodeFunctionData } from 'viem';
import { signUserOperation } from '@zerodev/sdk';
import { createHash } from 'crypto';
import { bundlerClient, paymasterClient } from '@/lib/client-setup';
import { type UserOperation } from '@permissionless/types';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createSmartAccountClient } from 'permissionless';
import { http } from 'viem';
import { base } from 'viem/chains';
import { createUserOperation } from '@zerodev/sdk';
import { encodeUserOperation, keccak256 } from 'permissionless/utils';
import { signMessage } from 'viem/accounts';

export async function sendTransaction(
  deviceKey: string,
  serverKey: string,
  from: Address,
  to: Address,
  value: bigint,
  data: string = '0x'
) {
  try {
    // Get the current nonce
    const nonce = await bundlerClient.getUserOperationCount({
      entryPoint: process.env.ENTRYPOINT_ADDRESS as Address,
      sender: from,
    });

    // Encode the transfer calldata
    const callData = encodeFunctionData({
      abi: [{
        type: 'function',
        name: 'execute',
        inputs: [
          { type: 'address', name: 'to' },
          { type: 'uint256', name: 'value' },
          { type: 'bytes', name: 'data' }
        ],
        outputs: [{ type: 'bytes', name: 'result' }],
        stateMutability: 'payable'
      }],
      args: [to, value, data as `0x${string}`]
    });

    // Create the user operation
    const userOperation: UserOperation = {
      sender: from,
      nonce: nonce,
      initCode: '0x' as `0x${string}`,
      callData: callData,
      callGasLimit: BigInt(100000),
      verificationGasLimit: BigInt(100000),
      preVerificationGas: BigInt(100000),
      maxFeePerGas: parseEther('0.000000001'),
      maxPriorityFeePerGas: parseEther('0.000000001'),
      paymasterAndData: '0x' as `0x${string}`,
      signature: '0x' as `0x${string}`,
    };

    // Get paymaster data
    const sponsorResult = await paymasterClient.sponsorUserOperation({
      userOperation,
      entryPoint: process.env.ENTRYPOINT_ADDRESS as Address,
    });

    userOperation.paymasterAndData = sponsorResult.paymasterAndData;

    // Generate the final private key from device and server keys
    const finalKeyHex = createHash('sha256')
      .update(deviceKey + serverKey)
      .digest('hex');
    const finalPrivateKey = `0x${finalKeyHex}` as `0x${string}`;

    // Sign the user operation hash
    const userOpHash = await bundlerClient.getUserOperationHash({
      userOperation,
      entryPoint: process.env.ENTRYPOINT_ADDRESS as Address,
    });
    const signature = await signMessage({
      message: { raw: userOpHash },
      privateKey: finalPrivateKey,
    });
    userOperation.signature = signature;

    // Send the user operation
    const hash = await bundlerClient.sendUserOperation({
      userOperation,
      entryPoint: process.env.ENTRYPOINT_ADDRESS as Address,
    });

    return hash;
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
}): Promise<UserOperation> {
  // Connect to Pimlico
  const pimlicoClient = createPimlicoClient({
    chain: base,
    transport: http(process.env.RPC_URL || ''),
  });

  // Create smart account client
  const sac = createSmartAccountClient({
    chain: base,
    transport: http(process.env.RPC_URL || ''),
    account: undefined,
  });

  // Get the nonce
  const nonce = await pimlicoClient.getUserOperationCount({
    entryPoint: process.env.ENTRYPOINT_ADDRESS as Address,
    sender: (params.userId || '0x') as Address,
  });

  // Construct the user operation
  const userOperation: UserOperation = {
    sender: (params.userId || '0x') as Address,
    nonce: nonce,
    initCode: '0x' as `0x${string}`,
    callData: await sac.account?.encodeCallData({
      to: params.to,
      value: BigInt(params.value),
      data: params.data,
    }) || '0x',
    callGasLimit: BigInt(500000),
    verificationGasLimit: BigInt(300000),
    preVerificationGas: BigInt(21000),
    maxFeePerGas: parseEther('0.000000001'),
    maxPriorityFeePerGas: parseEther('0.000000001'),
    paymasterAndData: '0x' as `0x${string}`,
    signature: '0x' as `0x${string}`,
  };

  return userOperation;
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