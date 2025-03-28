import { parseEther, parseUnits, type Address, type PublicClient, type SendTransactionParameters } from 'viem';
import { baseSepolia } from 'viem/chains';
import { type SmartAccountClient } from 'permissionless';
import { type PimlicoClient } from 'permissionless/clients/pimlico';
import { publicClient } from '@/lib/client-setup';

// Constants
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const; // Base USDC
const USDC_DECIMALS = 6;
const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const;

/**
 * Get a quote for USDC gas payment
 * @param amount The amount of USDC to pay for gas
 * @param pimlicoClient The Pimlico client instance
 */
export async function getUsdcQuote(amount: string, pimlicoClient: PimlicoClient) {
    try {
        // Get current gas price
        const gasPrice = await pimlicoClient.getUserOperationGasPrice();
        
        // Convert USDC amount to wei
        const usdcAmount = parseUnits(amount, USDC_DECIMALS);
        
        // Calculate equivalent ETH value (simplified - in production you'd use price feeds)
        const ethValue = parseEther(amount); // 1:1 for demo purposes
        
        return {
            usdcAmount,
            ethValue,
            gasPrice,
            success: true
        };
    } catch (error) {
        console.error('Error getting USDC quote:', error);
        return {
            success: false,
            error: 'Failed to get USDC quote'
        };
    }
}

/**
 * Prepare USDC approval transaction for paymaster
 * @param amount The amount of USDC to approve
 */
export async function approveUsdcForPaymaster(amount: string) {
    try {
        const usdcAmount = parseUnits(amount, USDC_DECIMALS);
        
        // Prepare approval transaction
        const approvalTx = {
            to: USDC_ADDRESS,
            data: `0x095ea7b3${ENTRY_POINT_ADDRESS.slice(2).padStart(64, '0')}${usdcAmount.toString(16).padStart(64, '0')}`,
            value: BigInt(0)
        };
        
        return {
            success: true,
            approvalTx
        };
    } catch (error) {
        console.error('Error preparing USDC approval:', error);
        return {
            success: false,
            error: 'Failed to prepare USDC approval'
        };
    }
}

/**
 * Get USDC paymaster data for a transaction
 * @param userOp The user operation to get paymaster data for
 * @param pimlicoClient The Pimlico client instance
 */
export async function getUsdcPaymasterData(
    userOp: any,
    pimlicoClient: PimlicoClient
) {
    try {
        // Get paymaster data from Pimlico
        const paymasterData = await pimlicoClient.sponsorUserOperation({
            userOperation: userOp
        });
        
        return {
            success: true,
            paymasterData
        };
    } catch (error) {
        console.error('Error getting USDC paymaster data:', error);
        return {
            success: false,
            error: 'Failed to get USDC paymaster data'
        };
    }
}

/**
 * Send a transaction using USDC for gas
 * @param options Transaction options
 * @param smartAccountClient The smart account client instance
 * @param pimlicoClient The Pimlico client instance
 */
export async function sendTransactionWithUsdcGas({
    to,
    data,
    value,
    usdcAmount,
    account
}: {
    to: Address;
    data?: `0x${string}`;
    value?: bigint;
    usdcAmount: string;
    account: Address;
}, smartAccountClient: SmartAccountClient, pimlicoClient: PimlicoClient) {
    try {
        // Get USDC quote
        const quote = await getUsdcQuote(usdcAmount, pimlicoClient);
        if (!quote.success) {
            throw new Error('Failed to get USDC quote');
        }
        
        // Prepare approval if needed
        const approval = await approveUsdcForPaymaster(usdcAmount);
        if (!approval.success) {
            throw new Error('Failed to prepare USDC approval');
        }
        
        // Send approval transaction if needed
        if (approval.approvalTx) {
            const txParams: SendTransactionParameters = {
                account,
                chain: baseSepolia,
                to: approval.approvalTx.to as Address,
                data: approval.approvalTx.data as `0x${string}`,
                value: approval.approvalTx.value
            };
            await smartAccountClient.sendTransaction(txParams);
        }
        
        // Send the transaction using the smartAccountClient
        const txParams: SendTransactionParameters = {
            account,
            chain: baseSepolia,
            to,
            data: data || '0x',
            value: value || BigInt(0)
        };
        const hash = await smartAccountClient.sendTransaction(txParams);
        
        return {
            success: true,
            hash
        };
    } catch (error) {
        console.error('Error sending transaction with USDC gas:', error);
        return {
            success: false,
            error: 'Failed to send transaction with USDC gas'
        };
    }
} 