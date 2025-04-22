import { type Address, parseEther, encodeFunctionData, keccak256 } from 'viem';
import { createPublicClientForSepolia } from '../client-setup';

// Define UserOperation type if not available from imports
type UserOperation = {
  sender: string;
  nonce: bigint | string;
  initCode: string;
  callData: string;
  callGasLimit: bigint | string;
  verificationGasLimit: bigint | string;
  preVerificationGas: bigint | string;
  maxFeePerGas: bigint | string;
  maxPriorityFeePerGas: bigint | string;
  paymasterAndData: string;
  signature?: string;
};

// Constants
const ENTRYPOINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

export async function sendTransaction(
  from: Address,
  to: Address,
  value: `0x${string}`,
  data: `0x${string}` = '0x',
  gasPaymentMethod: string = 'default'
) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || process.env.PIMLICO_API_KEY;
    const entryPoint = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS || process.env.ENTRYPOINT_ADDRESS || ENTRYPOINT_ADDRESS;
    const pimlicoUrl = `https://api.pimlico.io/v1/sepolia/rpc?apikey=${apiKey}`;
    
    console.log('Sending transaction:', {
      from,
      to,
      value,
      entryPoint,
      gasPaymentMethod
    });
    
    // Check if the account is deployed first
    console.log('Checking if account is deployed');
    const publicClient = createPublicClientForSepolia();
    const code = await publicClient.getBytecode({ address: from });
    const isDeployed = !!code && code.length > 2;
    
    console.log(`Account deployed: ${isDeployed ? 'yes' : 'no'}`);
    
    if (!isDeployed) {
      // If the account is not deployed, we need to include initCode
      console.warn('Account not deployed - initCode would be required');
      // Let the transaction continue, as our API endpoint should deploy the account
    }
    
    // 1. Use a hardcoded nonce for now since Pimlico doesn't expose a direct method
    // Alternatively, we could use bundler.getUserOperationCount but that requires setting up the client
    console.log('Getting nonce for account:', from);
    let nonce = BigInt(0);  // Start with 0
    
    try {
      // Use the pimlico_getUserOperationStatus method to check if there are pending ops
      // If there are pending ops, we should use a higher nonce
      const statusResponse = await fetch(pimlicoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'pimlico_getUserOperationStatus',
          params: [
            entryPoint,
            from
          ]
        })
      });
      
      const statusResult = await statusResponse.json();
      console.log('Operation status result:', statusResult);
      
      if (statusResult.result && Array.isArray(statusResult.result) && statusResult.result.length > 0) {
        // Count pending operations to estimate nonce
        const pendingOps = statusResult.result.filter((op: { status: string }) => 
          op.status === 'pending' || op.status === 'submitted' || op.status === 'confirmed'
        );
        console.log('Pending operations:', pendingOps.length);
        nonce = BigInt(pendingOps.length);
      }
    } catch (nonceError) {
      console.warn('Failed to get pending operations, using nonce 0:', nonceError);
    }
    
    console.log('Using nonce:', nonce.toString());
    
    // 2. Encode the calldata for execute function
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
      args: [to, BigInt(value), data]
    });
    
    // 3. Create the user operation
    const userOperation = {
      sender: from,
      nonce: `0x${nonce.toString(16)}`,
      initCode: '0x',
      callData: callData,
      callGasLimit: '0x186a0', // 100000 in hex
      verificationGasLimit: '0x186a0', // 100000 in hex
      preVerificationGas: '0x186a0', // 100000 in hex
      maxFeePerGas: '0x3b9aca00', // 1 Gwei in hex
      maxPriorityFeePerGas: '0x3b9aca00', // 1 Gwei in hex
      paymasterAndData: '0x',
      signature: '0x'
    };
    
    console.log('Created user operation:', userOperation);
    
    // 4. Get paymaster sponsorship if needed
    if (gasPaymentMethod === 'sponsored') {
      try {
        console.log('Getting sponsorship from Pimlico');
        const sponsorResponse = await fetch(pimlicoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'pm_sponsorUserOperation',
            params: [userOperation, entryPoint]
          })
        });
        
        const sponsorResult = await sponsorResponse.json();
        console.log('Sponsor result:', sponsorResult);
        
        if (sponsorResult.result) {
          userOperation.paymasterAndData = sponsorResult.result.paymasterAndData;
        } else {
          console.warn('Sponsorship failed:', sponsorResult.error);
        }
      } catch (sponsorError) {
        console.error('Error getting sponsorship:', sponsorError);
      }
    }
    
    // 5. Generate user operation hash locally
    // Since Pimlico doesn't expose a direct method for this
    const userOpHash = calculateUserOpHash(userOperation, entryPoint, 84531); // 84531 = Base Sepolia chain ID
    console.log('Calculated user operation hash:', userOpHash);
    
    // 6. Sign the user operation with dummy signature for now
    userOperation.signature = '0x0000000000000000000000000000000000000000000000000000000000000000';
    
    // 7. Send the user operation
    console.log('Sending user operation to bundler');
    try {
      const sendResponse = await fetch(pimlicoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'eth_sendUserOperation',
          params: [userOperation, entryPoint]
        })
      });
      
      const sendResult = await sendResponse.json();
      console.log('Send result:', sendResult);
      
      if (sendResult.result) {
        return sendResult.result;
      } else if (sendResult.error) {
        // Check for AA20 account not deployed error
        const errorMessage = sendResult.error.message || '';
        if (errorMessage.includes('AA20') && errorMessage.includes('account not deployed')) {
          throw new Error('Account not deployed: The smart account contract must be deployed before sending transactions.');
        }
        throw new Error(`Failed to send user operation: ${JSON.stringify(sendResult.error)}`);
      } else {
        throw new Error(`Failed to send user operation: Unknown error`);
      }
    } catch (sendError) {
      console.error('Error sending user operation:', sendError);
      throw sendError;
    }
  } catch (error) {
    console.error('Error in sendTransaction:', error);
    throw error;
  }
}

// Helper function to calculate userOpHash locally
function calculateUserOpHash(userOp: UserOperation, entryPoint: string, chainId: number): string {
  // Pack the user operation data
  const packedUserOp = {
    sender: userOp.sender,
    nonce: typeof userOp.nonce === 'bigint' ? userOp.nonce.toString() : userOp.nonce,
    initCode: userOp.initCode,
    callData: userOp.callData,
    callGasLimit: typeof userOp.callGasLimit === 'bigint' ? userOp.callGasLimit.toString() : userOp.callGasLimit,
    verificationGasLimit: typeof userOp.verificationGasLimit === 'bigint' ? userOp.verificationGasLimit.toString() : userOp.verificationGasLimit,
    preVerificationGas: typeof userOp.preVerificationGas === 'bigint' ? userOp.preVerificationGas.toString() : userOp.preVerificationGas,
    maxFeePerGas: typeof userOp.maxFeePerGas === 'bigint' ? userOp.maxFeePerGas.toString() : userOp.maxFeePerGas,
    maxPriorityFeePerGas: typeof userOp.maxPriorityFeePerGas === 'bigint' ? userOp.maxPriorityFeePerGas.toString() : userOp.maxPriorityFeePerGas,
    paymasterAndData: userOp.paymasterAndData
  };
  
  // Convert to string for hashing
  const userOpString = JSON.stringify(packedUserOp);
  
  // Hash the userOp, entryPoint, and chainId together
  const hash = keccak256(
    Buffer.from(userOpString + entryPoint + chainId.toString())
  );
  
  return hash;
}

/**
 * Creates a user operation without signature (for later signing)
 */
export async function createUserOpWithoutSignature(params: {
  to: `0x${string}`,
  value: string,
  data: `0x${string}`,
  userId?: string,
}): Promise<any> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || process.env.PIMLICO_API_KEY;
    const entryPoint = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS || process.env.ENTRYPOINT_ADDRESS || ENTRYPOINT_ADDRESS;
    const pimlicoUrl = `https://api.pimlico.io/v1/sepolia/rpc?apikey=${apiKey}`;
    const userId = params.userId as Address || '0x' as Address;
    
    // Use hardcoded nonce for now
    console.log('Getting nonce for account:', userId);
    let nonce = '0x0';
    
    // 2. Encode the calldata for execute function
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
      args: [params.to, BigInt(params.value), params.data]
    });
    
    // 3. Create the user operation
    const userOperation = {
      sender: userId,
      nonce: nonce,
      initCode: '0x',
      callData: callData,
      callGasLimit: '0x' + BigInt(500000).toString(16),
      verificationGasLimit: '0x' + BigInt(300000).toString(16),
      preVerificationGas: '0x' + BigInt(21000).toString(16),
      maxFeePerGas: '0x' + BigInt(parseEther('0.000000001')).toString(16),
      maxPriorityFeePerGas: '0x' + BigInt(parseEther('0.000000001')).toString(16),
      paymasterAndData: '0x',
      signature: '0x'
    };
    
    return userOperation;
    
  } catch (error) {
    console.error('Error creating user operation:', error);
    throw error;
  }
}

/**
 * Finalizes and sends a user operation
 */
export async function finalizeAndSendUserOp(userOp: any): Promise<`0x${string}`> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || process.env.PIMLICO_API_KEY;
    const entryPoint = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS || process.env.ENTRYPOINT_ADDRESS || ENTRYPOINT_ADDRESS;
    const pimlicoUrl = `https://api.pimlico.io/v1/sepolia/rpc?apikey=${apiKey}`;
    
    // Send the user operation
    const sendResponse = await fetch(pimlicoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'eth_sendUserOperation',
        params: [userOp, entryPoint]
      })
    });
    
    const sendResult = await sendResponse.json();
    console.log('Send result:', sendResult);
    
    if (sendResult.result) {
      return sendResult.result as `0x${string}`;
    } else {
      throw new Error(`Failed to send user operation: ${JSON.stringify(sendResult.error)}`);
    }
  } catch (error) {
    console.error('Error finalizing and sending user operation:', error);
    throw error;
  }
}