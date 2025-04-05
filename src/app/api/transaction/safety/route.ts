import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Address, parseEther } from 'viem';
import { bundlerClient, createChainPublicClient } from '@/lib/client-setup';
import { 
  verifyCalldata, 
  checkRecipientRisk, 
  simulateTransaction, 
  checkEtherscanData,
  aiTransactionAnalysis
} from '@/lib/utils/transaction-safety';

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
    
    // Get balance using public client instead of bundler client
    let balance;
    try {
      // Create public client for the chain
      const publicClient = createChainPublicClient();
      
      // Get balance from RPC
      balance = await publicClient.getBalance({
        address: walletAddress as Address
      });
    } catch (error) {
      console.error('Error getting balance:', error);
      // Default to a large value if balance check fails
      balance = parseEther('10');
    }
    
    if (valueInWei >= balance) {
      warnings.push('Transaction value is equal to or greater than current balance');
    }
    
    if (valueInWei > parseEther('1')) {
      warnings.push('Large transaction value detected (> 1 ETH)');
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
        success: true,
        simulated: false,
        message: 'Failed to simulate transaction',
        warnings: ['Simulation failed']
      },
      'Error simulating transaction'
    );
    
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
    
    // Determine if the transaction is safe based on all the checks
    // Consider a transaction risky if any of these conditions are met
    const isRisky = 
      !calldataVerification.overallMatch ||
      recipientRisk.isRisky ||
      !simulationResults.success ||
      (aiAnalysis.safetyScore < 70) ||
      warnings.length > 0 ||
      (etherscanData.warnings && etherscanData.warnings.length > 0);
    
    // Safety message based on AI analysis
    const safetyMessage = isRisky 
      ? 'This transaction may have risks. Please review carefully.'
      : 'This transaction appears safe based on our analysis.';
    
    // Compile all warnings
    const allWarnings = [
      ...warnings,
      ...(calldataVerification.suspiciousActions.containsSuspiciousSignatures ? 
          [calldataVerification.suspiciousActions.suspiciousDetails] : []),
      ...(recipientRisk.riskIndicators || []),
      ...(simulationResults.warnings || []),
      ...(etherscanData.warnings || []),
      ...(aiAnalysis.redFlags || [])
    ].filter(Boolean);
    
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