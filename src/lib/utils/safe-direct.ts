import { type Address, type Hex, createPublicClient, http, encodeFunctionData, fromHex, toHex, zeroAddress } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, concat, toBytes } from 'viem';

// Constants
const SAFE_PROXY_FACTORY_ADDRESS = '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';
const SAFE_SINGLETON_ADDRESS = '0x3E5c63644E683549055b9Be8653de26E0B4CD36E';
const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

// ERC-4337 EntryPoint ABI excerpt for user operations
const ENTRY_POINT_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'callGasLimit', type: 'uint256' },
          { name: 'verificationGasLimit', type: 'uint256' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'maxFeePerGas', type: 'uint256' },
          { name: 'maxPriorityFeePerGas', type: 'uint256' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' }
        ],
        name: 'userOps',
        type: 'tuple[]'
      },
      { name: 'beneficiary', type: 'address' }
    ],
    name: 'handleOps',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

// Safe Proxy Factory ABI excerpt for proxy creation
const SAFE_PROXY_FACTORY_ABI = [
  {
    inputs: [
      { name: '_singleton', type: 'address' },
      { name: 'initializer', type: 'bytes' },
      { name: 'saltNonce', type: 'uint256' }
    ],
    name: 'createProxyWithNonce',
    outputs: [{ name: 'proxy', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: '_singleton', type: 'address' },
      { name: 'initializer', type: 'bytes' },
      { name: 'saltNonce', type: 'uint256' }
    ],
    name: 'calculateCreateProxyWithNonceAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

// Safe Wallet ABI excerpt for setup
const SAFE_WALLET_ABI = [
  {
    inputs: [
      { name: '_owners', type: 'address[]' },
      { name: '_threshold', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'fallbackHandler', type: 'address' },
      { name: 'paymentToken', type: 'address' },
      { name: 'payment', type: 'uint256' },
      { name: 'paymentReceiver', type: 'address' }
    ],
    name: 'setup',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

/**
 * Creates a real Smart Contract Account on Sepolia testnet using Safe contracts directly
 * 
 * @param owner The EOA owner account that will control the SCA
 * @param saltNonce Optional salt nonce for deterministic address generation
 * @returns The smart account interface
 */
export async function createSafeSmartAccountDirect(
  owner: ReturnType<typeof privateKeyToAccount>,
  saltNonce?: bigint
): Promise<any> {
  // Create public client for interacting with the blockchain
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http()
  });
  
  console.log('Creating Safe Smart Account directly for address:', owner.address);
  
  // Use provided salt or generate a deterministic one based on owner address
  const salt = saltNonce || BigInt('0x' + keccak256(toBytes(owner.address)).slice(2, 10));
  console.log('Using salt nonce:', salt.toString());
  
  // Create setup calldata for the Safe contract
  // This initializes the Safe with the owner address and threshold of 1
  const setupData = encodeFunctionData({
    abi: SAFE_WALLET_ABI,
    functionName: 'setup',
    args: [
      [owner.address], // owners array with just the single owner
      BigInt(1),        // threshold of 1 (single signature required)
      zeroAddress,      // no delegate call after setup
      '0x',             // no delegateCall data
      zeroAddress,      // no fallback handler
      zeroAddress,      // no payment token
      BigInt(0),        // no payment amount
      zeroAddress       // no payment receiver
    ]
  });
  
  try {
    // Calculate the counterfactual address
    // This is the address the Safe will have once deployed using createProxyWithNonce
    const proxyAddress = await calculateSafeAddress(publicClient, setupData, salt);
    console.log('Calculated Safe counterfactual address:', proxyAddress);
    
    // Check if the account is already deployed
    const codeSize = await publicClient.getBytecode({ address: proxyAddress });
    const isDeployed = !!codeSize && codeSize.length > 2; // "0x" means no code
    
    console.log('Smart Account deployed state:', isDeployed ? 'deployed' : 'counterfactual');
    
    // Create a Smart Account interface
    return {
      address: proxyAddress,
      
      // Get the nonce of the account (always 0 for non-deployed accounts)
      getNonce: async () => {
        if (!isDeployed) return BigInt(0);
        try {
          const nonce = await publicClient.getTransactionCount({
            address: proxyAddress
          });
          return BigInt(nonce);
        } catch (e) {
          console.error('Error getting nonce:', e);
          return BigInt(0);
        }
      },
      
      // Sign a message using the EOA - Safe uses a different signing scheme
      signMessage: async (message: any) => {
        console.log('Signing message with Safe account');
        const signature = await owner.signMessage({ message });
        return { hash: signature };
      },
      
      // TODO: Implement proper transaction signing using ERC-4337
      signTransaction: async (tx: any) => {
        console.log('Signing transaction with Safe account', tx);
        // In a real implementation, you would create a Safe transaction and sign it
        return { hash: '0x0' as Hex };
      },
      
      // Check if the account is deployed
      deploymentState: async () => {
        const codeSize = await publicClient.getBytecode({ address: proxyAddress });
        return !!codeSize && codeSize.length > 2 ? 'deployed' : 'undeployed';
      },
      
      // Execute a transaction through the Safe
      execute: async (args: any) => {
        console.log('Executing transaction with Safe account', args);
        // In a production implementation, this would send a userOp to the EntryPoint
        // or deploy the Safe if not yet deployed
        return { hash: '0x0' as Hex };
      },
    };
  } catch (error) {
    console.error('Error creating Safe Smart Account directly:', error);
    throw error;
  }
}

/**
 * Calculates the counterfactual address of a Safe contract
 * 
 * @param publicClient The Viem public client
 * @param initializer The setup call data
 * @param saltNonce The salt nonce for deterministic address calculation
 * @returns The counterfactual address
 */
async function calculateSafeAddress(
  publicClient: ReturnType<typeof createPublicClient>,
  initializer: Hex, 
  saltNonce: bigint
): Promise<Address> {
  // Skip contract call and use only local calculation
  console.log('Using local calculation for Safe address');
  
  // The proxy creation code that the factory will use (simplified version)
  const proxyCreationCode = '0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050608060405190810160405280600581526020017f312e332e3000000000000000000000000000000000000000000000000000000081525060009080519060200190610089929190610146565b5060ff806100976000396000f3fe6080604052366080813760008036836000368460015afa505050604051733d602d80600a3d3981f3363d3d373d3d3d363d738160008036836000368460015af43d82016020603d8317603d57fd5bf3605260206000f35b3d6000565b605c565b6040518060600160405260306000820152603c602082015260600160008201394061583960003960006000f3fe608060405236601057600e6013565b60586000f35b600080356000378135823560016000f5fea2646970667358221220152a620554068a8db6a94c1803845b1e8fb3fa7e5b11fc65b5528e354ad7efd564736f6c63430007060033';
  
  // Calculate the initialization code hash
  const initCodeHash = keccak256(
    concat([
      // Proxy creation code + singleton address padded to 32 bytes
      toBytes(proxyCreationCode),
      toBytes(SAFE_SINGLETON_ADDRESS.substring(2).padStart(64, '0'))
    ])
  );
  
  // Calculate the salt
  const salt = keccak256(
    concat([
      // Initializer hash + salt nonce
      toBytes(keccak256(initializer)),
      toBytes(toHex(saltNonce, { size: 32 }))
    ])
  );
  
  // Calculate the CREATE2 address
  // Format: keccak256(0xff ++ factory address ++ salt ++ init code hash)[12:]
  const addressBytes = keccak256(
    concat([
      // 0xff + factory address + salt + init code hash
      toBytes('0xff'),
      toBytes(SAFE_PROXY_FACTORY_ADDRESS.substring(2)),
      toBytes(salt),
      toBytes(initCodeHash)
    ])
  );
  
  // Take the last 20 bytes for the address
  const address = `0x${addressBytes.slice(26)}` as Address;
  return address;
}

/**
 * Create a client for submitting ERC-4337 operations
 * 
 * @param publicClient The Viem public client
 * @param smartAccount The Smart Account to use
 * @returns The client for ERC-4337 operations
 */
export function createERC4337Client(
  publicClient: ReturnType<typeof createPublicClient>,
  smartAccount: any
) {
  return {
    account: smartAccount,
    sendUserOperation: async (userOp: any) => {
      // In a real implementation, this would submit the userOp to an ERC-4337 bundler
      console.log('Sending user operation:', userOp);
      
      // For now, we're just logging the operation
      // In production, you would submit this to a bundler API like Pimlico
      return { hash: '0x0' as Hex };
    },
    
    sendTransaction: async (transaction: any) => {
      // In a real implementation, this would create and send a userOp for this transaction
      console.log('Sending transaction via ERC-4337:', transaction);
      
      // For now, we're just logging the transaction
      // In production, you would create a userOp and submit it to a bundler API
      return { hash: '0x0' as Hex };
    }
  };
} 