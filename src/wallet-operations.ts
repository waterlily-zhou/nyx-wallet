import { type SmartAccountClient } from 'permissionless';
import { type PublicClient, type Address, parseEther, formatEther, encodeFunctionData, zeroAddress } from 'viem';

// ERC20 Token ABI for transfers
const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

/**
 * Utility functions for performing common wallet operations
 */
export class WalletOperations {
  private smartAccountClient: SmartAccountClient;
  private publicClient: PublicClient;
  private smartAccountAddress: Address;

  constructor(
    smartAccountClient: SmartAccountClient,
    publicClient: PublicClient,
    smartAccountAddress: Address
  ) {
    this.smartAccountClient = smartAccountClient;
    this.publicClient = publicClient;
    this.smartAccountAddress = smartAccountAddress;
  }

  /**
   * Get the wallet balance
   */
  async getBalance(): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: this.smartAccountAddress
    });
    return formatEther(balance);
  }

  /**
   * Send ETH to an address
   */
  async sendETH(toAddress: Address, amount: string): Promise<`0x${string}`> {
    try {
      const userOpHash = await this.smartAccountClient.sendTransaction({
        to: toAddress,
        value: parseEther(amount),
        data: '0x'
      });
      
      console.log(`Transaction sent! UserOpHash: ${userOpHash}`);
      return userOpHash;
    } catch (error) {
      console.error('Error sending ETH:', error);
      throw error;
    }
  }

  /**
   * Send an ERC20 token
   */
  async sendERC20(
    tokenAddress: Address,
    toAddress: Address,
    amount: bigint
  ): Promise<`0x${string}`> {
    try {
      // ERC20 transfer function ABI encoding
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [toAddress, amount]
      });

      const userOpHash = await this.smartAccountClient.sendTransaction({
        to: tokenAddress,
        value: 0n,
        data: data
      });
      
      console.log(`ERC20 transfer sent! UserOpHash: ${userOpHash}`);
      return userOpHash;
    } catch (error) {
      console.error('Error sending ERC20 token:', error);
      throw error;
    }
  }

  /**
   * Execute a batch of transactions
   * Note: This will only work with Smart Account implementations that support batching
   */
  async executeBatch(
    transactions: { to: Address; value: bigint; data: `0x${string}` }[]
  ): Promise<`0x${string}`> {
    // For Simple Accounts or other accounts that don't support batching natively,
    // you would need to use a specific batching contract or method
    
    // This is a simplified example that will work with Safe accounts
    // The actual implementation depends on the smart account type
    const hash = await this.smartAccountClient.sendTransaction({
      to: this.smartAccountAddress,
      data: encodeFunctionData({
        abi: [
          {
            inputs: [
              { name: 'transactions', type: 'tuple[]', components: [
                { name: 'to', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'data', type: 'bytes' }
              ]}
            ],
            name: 'executeBatch',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function'
          }
        ],
        functionName: 'executeBatch',
        args: [transactions]
      }),
      value: 0n
    });
    
    return hash;
  }

  /**
   * Get an example of how to execute a batch transaction
   * Note: Implementation depends on the specific smart account being used
   */
  getExampleBatchTransaction(): string {
    return `
    // Batching depends on your specific smart account implementation
    // For Safe accounts, you can use the 'executeBatch' method
    // For SimpleAccounts, you need to use a separate batching contract
    
    // Example with Safe:
    const safeTransactionData = encodeFunctionData({
      abi: [
        {
          inputs: [
            { 
              name: 'transactions', 
              type: 'tuple[]', 
              components: [
                { name: 'to', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'data', type: 'bytes' }
              ]
            }
          ],
          name: 'executeBatch',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function'
        }
      ],
      functionName: 'executeBatch',
      args: [
        [
          { to: recipientAddress1, value: amount1, data: '0x' },
          { to: tokenAddress, value: 0n, data: tokenTransferData }
        ]
      ]
    });
    
    // Then send the transaction
    const hash = await smartAccountClient.sendTransaction({
      to: smartAccountAddress,
      data: safeTransactionData,
      value: 0n
    });
    `;
  }
} 