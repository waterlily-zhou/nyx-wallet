import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Address, parseEther, formatEther } from 'viem';
import { bundlerClient, createChainPublicClient } from '@/lib/client-setup';
import { 
  verifyCalldata, 
  checkRecipientRisk, 
  simulateTransaction, 
  checkEtherscanData,
  aiTransactionAnalysis
} from '@/lib/utils/transaction-safety';

export interface SimulationResult {
  success: boolean;
  simulated: boolean;
  message: string;
  warnings: string[];
  estimatedGas?: string;
  gasUsed?: string;
  stateChanges?: any[];
  logs?: any[];
  error?: string;
  details?: {
    gasEstimate: string | null;
    potentialErrors: string[];
  };
}

// Helper function to safely execute API calls
async function safeApiCall<T>(
  fn: () => Promise<T>, 
  fallbackValue: T, 
  errorMessage: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`${errorMessage}:`, error);
    return fallbackValue;
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { to, value, data = '0x' } = body;

    if (!to || !value) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    console.log(`API: Safety check for transfer to ${to} for ${value} ETH`);
    
    // Basic safety warnings
    const warnings: string[] = [];
    
    // Convert value from ETH to Wei
    const valueInWei = parseEther(value);
    console.log('Safety: Transfer amount conversion', {
      originalValue: value,
      valueInWei: valueInWei.toString(),
      valueBackToEth: formatEther(valueInWei)
    });
    
    // Get balance using public client instead of bundler client
    let balance;
    try {
      // Create public client for the chain
      const publicClient = createChainPublicClient();
      
      // Get balance from RPC
      balance = await publicClient.getBalance({
        address: walletAddress as Address
      });

      console.log('Safety: Account balance', {
        rawBalance: balance.toString(),
        balanceInEth: formatEther(balance),
        comparison: {
          transferValue: {
            eth: value,
            wei: valueInWei.toString()
          },
          accountBalance: {
            eth: formatEther(balance),
            wei: balance.toString()
          },
          isValueGreaterOrEqual: valueInWei >= balance,
          difference: formatEther(balance - valueInWei)
        }
      });

    } catch (error) {
      console.error('Error getting balance:', error);
      // Default to a large value if balance check fails
      balance = parseEther('10');
    }
    
    if (valueInWei >= balance) {
      // Handle negative balance case
      const remainingBalanceWei = valueInWei > balance ? 0n : balance - valueInWei;
      const remainingBalanceEth = formatEther(remainingBalanceWei);
      
      console.log('Safety: Balance check details', {
        transferAmount: {
          eth: value,
          wei: valueInWei.toString()
        },
        accountBalance: {
          eth: formatEther(balance),
          wei: balance.toString()
        },
        remaining: {
          eth: remainingBalanceEth,
          wei: remainingBalanceWei.toString()
        },
        percentageUsed: Number((valueInWei * 100n) / balance)
      });

      // Only add these warnings if the transaction is actually using most of the balance
      if (valueInWei > balance * 8n / 10n) {
        warnings.push(
          'Transaction will use most of available balance',
          'Limited funds will be left for gas fees',
          `Remaining balance after transfer: ${remainingBalanceEth} ETH`
        );
      }
    } else if (valueInWei > balance * 9n / 10n) {
      warnings.push('Transaction uses more than 90% of available balance');
    }

    // 2. Verify calldata (more important for contract interactions)
    const calldataVerification = verifyCalldata(data, {
      recipient: to,
      amount: `${value} ETH`
    });
    
    // 3. Check recipient risk using GoPlus Security API with error handling
    const recipientRisk = await safeApiCall(
      () => checkRecipientRisk(to),
      { 
        isRisky: false, 
        riskScore: 0, 
        riskCategory: 'Unknown',
        dataSource: 'Error',
        riskIndicators: [],
        details: 'Failed to check recipient risk'
      },
      'Error checking recipient risk'
    );
    
    // 4. Simulate transaction using Tenderly (if available) with error handling
    const simulationResults = await safeApiCall(
      () => simulateTransaction({
        sender: walletAddress as Address,
        recipient: to as Address,
        callData: data,
        value: valueInWei.toString()
      }),
      {
        success: false,
        simulated: false,
        message: 'Transaction simulation failed. This could indicate potential issues with the transaction.',
        warnings: [
          'Transaction simulation failed - proceed with caution',
          'Consider reducing gas price or checking recipient contract state'
        ],
        details: {
          gasEstimate: null,
          potentialErrors: ['Simulation could not complete - transaction may revert']
        }
      },
      'Error during transaction simulation'
    );

    // Add simulation-specific warnings
    if (!simulationResults.success && simulationResults.simulated) {
      warnings.push(
        ...simulationResults.warnings,
        'Transaction is likely to fail on-chain'
      );
    }

    // Enhanced recipient checks
    const recipientCodeSize = await safeApiCall(
      async () => {
        const publicClient = createChainPublicClient();
        return await publicClient.getBytecode({ address: to as Address });
      },
      null,
      'Error checking recipient code'
    );

    if (recipientCodeSize && recipientCodeSize.length > 2) {
      warnings.push(
        'Recipient is a smart contract - verify the contract is trusted',
        'Review contract interactions carefully before proceeding'
      );
    }

    // 5. Check Etherscan data for the recipient with error handling
    const etherscanData = await safeApiCall(
      () => checkEtherscanData(to),
      {
        isContract: false,
        contractName: '',
        isVerified: false,
        deploymentDate: 'Unknown',
        transactionVolume: 0,
        hasRecentActivity: false,
        warnings: ['Failed to check Etherscan data']
      },
      'Error checking Etherscan data'
    );
    
    // 6. AI Analysis of the transaction safety (if available) with error handling
    const transactionType = 'ETH Transfer';
    const aiAnalysis = await safeApiCall(
      () => aiTransactionAnalysis({
        transactionType,
        amount: `${value} ETH`,
        calldataVerification,
        recipientRisk,
        simulationResults,
        etherscanData
      }),
      {
        safetyScore: 50,
        safetyAnalysis: 'Failed to perform AI analysis. Using basic safety checks only.',
        recommendations: ['Check transaction details carefully before confirming'],
        redFlags: ['AI analysis unavailable'],
        aiServiceUsed: 'None (error)'
      },
      'Error performing AI analysis'
    );
    
    // Categorize warnings by severity
    const criticalWarnings = warnings.filter(w => 
      w.includes('will fail') || 
      w.includes('no funds') ||
      w.includes('suspicious') ||
      w.includes('risky')
    );
    
    const nonCriticalWarnings = warnings.filter(w => !criticalWarnings.includes(w));
    
    // Determine if the transaction is safe based on all the checks
    // Only consider critical warnings for risk assessment
    const isRisky = 
      !calldataVerification.overallMatch ||
      recipientRisk.isRisky ||
      (!simulationResults.success && simulationResults.simulated) ||
      (aiAnalysis.safetyScore < 50) ||
      criticalWarnings.length > 0 ||
      (etherscanData.warnings && etherscanData.warnings.some(w => 
        w.includes('suspicious') || w.includes('risky') || w.includes('malicious')
      ));
    
    // Safety message based on AI analysis and warning severity
    const safetyMessage = isRisky 
      ? 'This transaction may have risks. Please review carefully.'
      : nonCriticalWarnings.length > 0
        ? 'This transaction appears safe but has some non-critical warnings.'
        : 'This transaction appears safe based on our analysis.';
    
    // Compile all warnings but separate them by severity
    const allWarnings = {
      critical: criticalWarnings,
      nonCritical: nonCriticalWarnings,
      other: [
        ...(calldataVerification.suspiciousActions.containsSuspiciousSignatures ? 
            [calldataVerification.suspiciousActions.suspiciousDetails] : []),
        ...(recipientRisk.riskIndicators || []),
        ...(simulationResults.warnings || []),
        ...(etherscanData.warnings || []),
        ...(aiAnalysis.redFlags || [])
      ].filter(Boolean)
    };
    
    // Compile recommendations from AI
    const recommendations = aiAnalysis.recommendations || [];
    
    return NextResponse.json({
      success: true,
      safetyCheck: {
        isSafe: !isRisky,
        warnings: allWarnings,
        safetyScore: aiAnalysis.safetyScore,
        safetyAnalysis: aiAnalysis.safetyAnalysis,
        safetyMessage,
        recommendations,
        redFlags: aiAnalysis.redFlags,
        details: {
          calldataVerification,
          recipientRisk,
          simulationResults,
          etherscanData,
          aiAnalysis
        }
      }
    });

  } catch (error) {
    console.error('Error checking transaction safety:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check transaction safety' },
      { status: 500 }
    );
  }
} 