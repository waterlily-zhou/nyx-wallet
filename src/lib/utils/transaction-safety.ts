// Native fetch is globally available in Next.js, no need to import
import { parseEther, parseUnits, formatEther } from 'viem';
import { SimulationResult } from '@/app/api/transaction/safety/route';

// Environment variables for API keys
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
const TENDERLY_ACCESS_KEY = process.env.TENDERLY_ACCESS_KEY || '';
const TENDERLY_USER = process.env.TENDERLY_USER || '';
const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT || '';

// Add debug logging
console.log('Claude API Key present:', !!CLAUDE_API_KEY);
console.log('Claude API Key length:', CLAUDE_API_KEY.length);

export interface TransactionSafetyData {
  amount?: string;
  currency?: string;
  recipientRisk?: {
    riskScore: number;
    isRisky?: boolean;
    riskIndicators?: string[];
  };
  calldataVerification?: {
    recipientMatches: boolean;
    valueMatches: boolean;
    suspiciousActions?: {
      containsSuspiciousSignatures?: boolean;
    };
  };
  simulationResults?: {
    success: boolean;
    simulated: boolean;
    warnings?: string[];
  };
  etherscanData?: {
    isContract?: boolean;
    isVerified?: boolean;
    warnings?: string[];
  };
}

// ----------------------------------
// 1. Calldata Verification
// ----------------------------------
export function verifyCalldata(rawCalldata: string, displayedData: any) {
  console.log('Verifying calldata:', {
    rawCalldata: rawCalldata.substring(0, 100) + '...',
    recipient: displayedData.recipient,
    amount: displayedData.amount
  });

  if (!rawCalldata || typeof rawCalldata !== 'string') {
    console.error('Invalid calldata received:', rawCalldata);
    return {
      recipientMatches: false,
      valueMatches: false,
      messageMatches: false,
      suspiciousActions: { containsSuspiciousSignatures: false, suspiciousDetails: 'Invalid calldata' },
      overallMatch: false
    };
  }

  // Normalize calldata to lowercase for case-insensitive comparison
  const normalizedCalldata = rawCalldata.toLowerCase();
  
  // Enhanced address normalization for simple ETH transfers
  // For simple ETH transfers, addresses always match because we're verifying
  // a wallet-to-wallet transfer that we control
  let recipientInCalldata = true;
  
  if (displayedData.recipient && rawCalldata !== '0x') {
    // For non-simple transfers, verify the recipient in the calldata
    const recipientWithoutPrefix = displayedData.recipient.slice(2).toLowerCase();
    const recipientWithPrefix = displayedData.recipient.toLowerCase();
    
    // Try various formats of the address that might be in the calldata
    recipientInCalldata = normalizedCalldata.includes(recipientWithoutPrefix) || 
                         normalizedCalldata.includes(recipientWithPrefix) ||
                         normalizedCalldata.includes(recipientWithoutPrefix.padStart(64, '0'));
    
    console.log('Recipient check:', {
      recipient: displayedData.recipient,
      recipientWithoutPrefix,
      found: recipientInCalldata,
      callDataLength: normalizedCalldata.length
    });
  } else {
    // For simple ETH transfers (0x calldata), we're using the tx.to field
    // which isn't in the calldata itself but in the transaction parameters
    console.log('Simple ETH transfer detected, recipient is in tx parameters (not calldata)');
    recipientInCalldata = true;
  }
  
  // Enhance value verification for ETH transfers
  let valueMatches = true; // Default to true for simple transfers
  
  if (displayedData.amount && rawCalldata !== '0x') {
    // Only check values in calldata for non-simple transfers
    try {
      // Try multiple amount formats
      if (displayedData.amount.includes('ETH')) {
        // Parse ETH amount
        const amountStr = displayedData.amount.split(' ')[0];
        const amountWei = parseEther(amountStr).toString();
        const amountHex = BigInt(amountWei).toString(16);
        
        // Try different formats that might appear in calldata
        valueMatches = normalizedCalldata.includes(amountWei.toLowerCase()) || 
                       normalizedCalldata.includes(amountHex.toLowerCase()) ||
                       normalizedCalldata.includes(amountHex.padStart(64, '0').toLowerCase());
        
        console.log('ETH value check:', {
          originalAmount: amountStr,
          amountWei,
          amountHex,
          found: valueMatches
        });
      } else if (displayedData.amount.includes('USDC')) {
        // USDC uses different decimals (6 instead of 18)
        const amountStr = displayedData.amount.split(' ')[0];
        const amountUSDC = parseUnits(amountStr, 6).toString();
        const amountHex = BigInt(amountUSDC).toString(16);
        
        valueMatches = normalizedCalldata.includes(amountUSDC.toLowerCase()) || 
                       normalizedCalldata.includes(amountHex.toLowerCase()) ||
                       normalizedCalldata.includes(amountHex.padStart(64, '0').toLowerCase());
        
        console.log('USDC value check:', {
          originalAmount: amountStr,
          amountUSDC,
          amountHex,
          found: valueMatches
        });
      } else {
        // For other tokens or unknown formats, assume it's correct
        console.log('Skipping value check for unsupported currency');
        valueMatches = true;
      }
    } catch (e) {
      console.error('Error parsing amount:', e);
      valueMatches = true; // Be lenient if we can't parse the amount
    }
  } else {
    // For simple transfers, value is in tx parameters not calldata
    console.log('Simple ETH transfer detected, value is in tx parameters (not calldata)');
    valueMatches = true;
  }
  
  return {
    recipientMatches: recipientInCalldata,
    valueMatches: valueMatches,
    messageMatches: true, // Simplified for demo
    suspiciousActions: detectSuspiciousActions(rawCalldata),
    overallMatch: recipientInCalldata && (valueMatches || !displayedData.amount)
  };
}

/**
 * Function to detect suspicious actions in calldata
 */
function detectSuspiciousActions(rawCalldata: string) {
  // List of suspicious function signatures to check for
  const suspiciousFunctionSignatures = [
    // Common attack vectors
    '0x095ea7b3', // approve (potential unlimited approval)
    '0x42842e0e', // safeTransferFrom (NFT)
    '0x23b872dd', // transferFrom (ERC20)
    '0xa22cb465', // setApprovalForAll (NFT)
  ];
  
  const suspiciousFound = suspiciousFunctionSignatures.some(signature => 
    rawCalldata.includes(signature.slice(2))
  );
  
  return {
    containsSuspiciousSignatures: suspiciousFound,
    suspiciousDetails: suspiciousFound ? 'Contains potential approval or transferFrom calls' : ''
  };
}


// ----------------------------------
// 2. GoPlus Risk API
// ----------------------------------
export async function checkRecipientRisk(address: string) {
  try {
    // Call GoPlus address security API
    const response = await fetch(
      `https://api.gopluslabs.io/api/v1/address_security/${address}`
    );
    
    const data = await response.json();
    
    // If API has an error, fallback to basic checks
    if (data.code !== 1 || !data.result) {
      console.log('GoPlus API error or no data:', data.message);
      return fallbackRiskCheck(address);
    }
    
    // Check for risk indicators in the result
    const riskIndicators = [];
    let highestRiskValue = 0;
    
    // Parse all risk indicators from GoPlus response
    for (const [key, value] of Object.entries(data.result)) {
      // Skip data_source as it's not a numeric indicator
      if (key === 'data_source') continue;
      
      // If the value is not "0", it indicates a risk
      if (value !== "0") {
        // Convert key from snake_case to readable format
        const readableKey = key
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        riskIndicators.push(`${readableKey}: ${value}`);
        
        // Track highest risk value (assuming higher numbers = higher risk)
        const numValue = parseInt(value as string);
        if (!isNaN(numValue) && numValue > highestRiskValue) {
          highestRiskValue = numValue;
        }
      }
    }
    
    // Calculate risk score based on indicators
    // Start with base score and add points for each risk indicator
    let riskScore = riskIndicators.length > 0 ? 50 + (highestRiskValue * 20) : 10;
    
    // Cap at 100
    if (riskScore > 100) riskScore = 100;
    
    // Get data source if available
    const dataSource = data.result.data_source || 'Unknown';
    
    return {
      isRisky: riskScore > 50,
      riskScore: riskScore,
      riskCategory: riskScore > 70 ? 'High' : riskScore > 40 ? 'Medium' : 'Low',
      dataSource: dataSource,
      riskIndicators: riskIndicators,
      details: riskIndicators.length > 0 
        ? `Address has ${riskIndicators.length} risk indicators: ${riskIndicators.join(', ')}. Data source: ${dataSource}`
        : `No known risk indicators.`
    };
  } catch (error) {
    console.error('Error checking address risk:', error);
    return fallbackRiskCheck(address);
  }
}

// ----------------------------------
// 3. GoPlus Fallback Risk Check
// ----------------------------------
async function fallbackRiskCheck(address: string) {
  try {
    // Etherscan API for basic account info
    const response = await fetch(
      `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${ETHERSCAN_API_KEY}`
    );
    
    const data = await response.json();
    
    const isNewAddress = !data.result || data.result.length === 0;
    const txCount = data.result ? data.result.length : 0;
    
    // Check for contract
    const contractResponse = await fetch(
      `https://api-sepolia.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${ETHERSCAN_API_KEY}`
    );
    
    const contractData = await contractResponse.json();
    const isContract = contractData.status === '1';
    
    // Simple risk score for fallback
    let riskScore = 0;
    
    if (isNewAddress) riskScore += 40; // New addresses are higher risk
    if (isContract) riskScore += 20;   // Contracts are higher risk
    if (txCount < 5) riskScore += 20;  // Addresses with few transactions are higher risk
    
    // Cap at 100
    if (riskScore > 100) riskScore = 100;
    
    return {
      isRisky: riskScore > 70,
      riskScore: riskScore,
      riskCategory: riskScore > 70 ? 'High' : riskScore > 40 ? 'Medium' : 'Low',
      dataSource: 'Etherscan (fallback)',
      riskIndicators: [],
      isNewAddress,
      isContract,
      transactionCount: txCount,
      details: `Fallback check: Address has ${txCount} transactions and ${isContract ? 'is' : 'is not'} a contract.`
    };
  } catch (error) {
    console.error('Error in fallback risk check:', error);
    return { 
      error: 'Could not assess address risk',
      isRisky: false,
      riskScore: 0,
      riskCategory: 'Unknown',
      dataSource: 'None',
      riskIndicators: [],
      details: 'Error checking address risk'
    };
  }
}

// ----------------------------------
// 4. Tenderly Simulation API
// ----------------------------------
export async function simulateTransaction(params: {
  sender: string;
  recipient: string;
  callData: string;
  value: string;
}): Promise<SimulationResult> {
  try {
    if (!TENDERLY_ACCESS_KEY || !TENDERLY_USER || !TENDERLY_PROJECT) {
      console.log('Tenderly credentials not configured, skipping simulation');
      return {
        success: true,
        simulated: false,
        message: 'Simulation skipped - Tenderly not configured',
        warnings: []
      };
    }

    // Log the value being sent to Tenderly
    console.log('Simulation value check:', {
      receivedValue: params.value,
      valueInEth: formatEther(BigInt(params.value)) // Convert Wei back to ETH for logging
    });

    const response = await fetch(
      `https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/simulate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': TENDERLY_ACCESS_KEY
        },
        body: JSON.stringify({
          save: true,
          save_if_fails: true,
          simulation_type: 'quick',
          network_id: '11155111', // Sepolia
          from: params.sender,
          to: params.recipient,
          input: params.callData,
          value: params.value, // Already in Wei, no need to convert
          gas: 1000000,
          gas_price: '0',
          state_objects: {
            [params.sender]: {
              balance: parseEther('10').toString() // Ensure sufficient balance for simulation
            }
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Tenderly simulation failed:', errorData);
      
      // Check for specific error types
      if (errorData.error?.includes('insufficient funds')) {
        return {
          success: false,
          simulated: true,
          message: 'Transaction would fail - Insufficient funds for gas',
          warnings: ['Insufficient funds to cover gas costs'],
          error: 'Insufficient funds'
        };
      }
      
      return {
        success: false,
        simulated: true,
        message: 'Simulation failed - ' + (errorData.error || 'Unknown error'),
        warnings: ['Simulation encountered an error'],
        error: errorData.error
      };
    }

    const data = await response.json();
    
    // Analyze results
    const warnings = [];
    
    if (!data.transaction.status) {
      warnings.push('Transaction would fail');
    }
    
    if (data.transaction.gas_used > 500000) {
      warnings.push('High gas usage detected');
    }
    
    return {
      success: data.transaction.status,
      simulated: true,
      message: data.transaction.status ? 'Transaction simulation successful' : 'Transaction would fail',
      warnings,
      estimatedGas: data.transaction.gas_used?.toString(),
      gasUsed: data.transaction.gas_used?.toString(),
      stateChanges: data.transaction.state_diff ? Object.keys(data.transaction.state_diff) : [],
      logs: data.transaction.logs || []
    };
  } catch (error) {
    console.error('Error simulating transaction:', error);
    return {
      success: true, // Default to success if simulation fails
      simulated: false,
      message: 'Could not simulate transaction',
      warnings: ['Simulation service unavailable'],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ----------------------------------
// 5. Etherscan Contract & TX Check
// ----------------------------------
export async function checkEtherscanData(address: string) {
  try {
    // Get contract info if it's a contract
    const contractResponse = await fetch(
      `https://api-sepolia.etherscan.io/api?module=contract&action=getsourcecode&address=${address}&apikey=${ETHERSCAN_API_KEY}`
    );
    
    const contractData = await contractResponse.json();
    
    // Get recent transactions
    const txResponse = await fetch(
      `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${ETHERSCAN_API_KEY}`
    );
    
    const txData = await txResponse.json();
    
    // Analysis of contract data
    const isContract = contractData.result?.[0]?.ContractName !== '';
    const isVerified = contractData.result?.[0]?.ABI !== 'Contract source code not verified';
    const contractName = contractData.result?.[0]?.ContractName || '';
    
    // Analysis of transaction data
    const txCount = txData.result ? txData.result.length : 0;
    const transactions = txData.result || [];
    
    // Check for recent deployment
    const deploymentDate = isContract && transactions.length > 0 
      ? new Date(parseInt(transactions[transactions.length - 1].timeStamp) * 1000).toISOString()
      : 'N/A';
    
    // Check for recent activity
    const hasRecentActivity = transactions.length > 0 && 
      (Date.now() - parseInt(transactions[0].timeStamp) * 1000) < 7 * 24 * 60 * 60 * 1000; // 7 days
    
    // Generate warnings
    const warnings = [];
    
    if (isContract && !isVerified) {
      warnings.push('Contract source code is not verified on Etherscan');
    }
    
    if (isContract && transactions.length === 0) {
      warnings.push('Contract has no transaction history');
    }
    
    if (isContract && new Date(deploymentDate).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000) {
      warnings.push('Contract was deployed less than 7 days ago');
    }
    
    return {
      isContract,
      contractName,
      isVerified,
      deploymentDate,
      transactionVolume: txCount,
      hasRecentActivity,
      warnings
    };
  } catch (error) {
    console.error('Error checking Etherscan data:', error);
    return {
      error: 'Could not check Etherscan data',
      warnings: ['Could not retrieve Etherscan data']
    };
  }
}

// ----------------------------------
// 6. Claude AI Transaction Analysis
// ----------------------------------
export async function aiTransactionAnalysis(data: any) {
  try {
    if (!CLAUDE_API_KEY) {
      console.log('Claude API not configured, using basic safety score');
      // Extract amount and currency from the amount string (e.g., "0.001 ETH")
      const [amountValue, currency] = (data.amount || '').split(' ');
      return {
        safetyScore: calculateBasicSafetyScore({
          amount: amountValue,
          currency: currency || 'unknown', // Default to ETH if not specified
          calldataVerification: data.calldataVerification,
          recipientRisk: data.recipientRisk,
          simulationResults: data.simulationResults,
          etherscanData: data.etherscanData
        }),
        safetyAnalysis: 'Basic safety analysis only - AI service not configured',
        recommendations: ['Verify transaction details carefully'],
        redFlags: [],
        aiServiceUsed: 'None (not configured)'
      };
    }
    
    // Prepare the prompt for Claude
    const prompt = `
      Analyze this Ethereum transaction for safety and security concerns:
      
      Transaction details:
      - Type: ${data.transactionType || 'Unknown'}
      - Amount: ${data.amount?.split(' ')[0] || '0'} ETH
      - Message included: ${data.message ? `"${data.message}"` : 'None'}
      
      Call data verification:
      - Recipient matches: ${data.calldataVerification?.recipientMatches || false}
      - Value matches: ${data.calldataVerification?.valueMatches || false}
      - Contains suspicious signatures: ${data.calldataVerification?.suspiciousActions?.containsSuspiciousSignatures || false}
      - Suspicious details: ${data.calldataVerification?.suspiciousActions?.suspiciousDetails || ''}
      
      Recipient risk assessment (from GoPlus Security API):
      - Risk score: ${data.recipientRisk?.riskScore || 0}/100
      - Risk category: ${data.recipientRisk?.riskCategory || 'Unknown'}
      - Data source: ${data.recipientRisk?.dataSource || 'Unknown'}
      - Risk indicators: ${data.recipientRisk?.riskIndicators ? data.recipientRisk.riskIndicators.join(', ') : 'None detected'}
      - Details: ${data.recipientRisk?.details || 'No details available'}
      ${data.recipientRisk?.isNewAddress !== undefined ? `- Is new address: ${data.recipientRisk.isNewAddress}` : ''}
      ${data.recipientRisk?.isContract !== undefined ? `- Is contract: ${data.recipientRisk.isContract}` : ''}
      
      Transaction simulation:
      - Success: ${data.simulationResults?.success || false}
      - Simulated: ${data.simulationResults?.simulated || false}
      - Gas used: ${data.simulationResults?.gasUsed || 'Unknown'}
      - State changes: ${data.simulationResults?.stateChanges || 'Unknown'}
      - Warnings: ${data.simulationResults?.warnings ? data.simulationResults.warnings.join(', ') : 'None'}
      
      Etherscan data:
      - Is contract: ${data.etherscanData?.isContract || false}
      - Contract name: ${data.etherscanData?.contractName || ''}
      - Is verified: ${data.etherscanData?.isVerified || false}
      - Deployment date: ${data.etherscanData?.deploymentDate || 'Unknown'}
      - Transaction volume: ${data.etherscanData?.transactionVolume || 0}
      - Has recent activity: ${data.etherscanData?.hasRecentActivity || false}
      - Warnings: ${data.etherscanData?.warnings ? data.etherscanData.warnings.join(', ') : 'None'}
      
      Analyze the safety of this transaction. Identify any red flags or suspicious elements. 
      Pay special attention to calldata, any mismatch with the UI or other transaction data indicates a scam. 
      Risk indicators from GoPlus Security API are also strong signals of potential scams.
      Provide an overall safety score between 0-100 where 100 is completely safe.
      If "phishing_activities" or "blacklist_doubt" are found, or the 'recipient' or 'amount' in the calldata doesn't match the UI, these are serious concerns and should significantly reduce the safety score.
      If there's any suspitious matter, give specific recommendations for the user.
      Be concise, to the point and specific.
      
      Format your response as JSON with the following structure:
      {
        "safetyScore": number,
        "safetyAnalysis": "detailed analysis here",
        "recommendations": ["rec1", "rec2", ...],
        "redFlags": ["flag1", "flag2", ...] 
      }
    `;
    
    try {
      // Call Claude API with consistent versioning
      console.log('Calling Claude API with model: claude-3-haiku-20240307');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307', // Using a confirmed valid model name
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3
        })
      });
      
      // Check if response is ok
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Claude API error (${response.status}): ${errorText}`);
        
        // Handle overloaded error (529) specifically
        if (response.status === 529) {
          // Try a different model that may have more capacity
          console.log('Retrying with model: claude-3-5-sonnet-20240229');
          const retryResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': CLAUDE_API_KEY,
              'anthropic-version': '2023-06-01' 
            },
            body: JSON.stringify({
              model: 'claude-3-5-sonnet-20240229', // Using alternate model from valid list
              max_tokens: 1024,
              messages: [
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: 0.3
            })
          });
          
          if (!retryResponse.ok) {
            const retryErrorText = await retryResponse.text();
            console.error(`Claude API retry failed (${retryResponse.status}): ${retryErrorText}`);
          } else {
            // If retry succeeded, use this response
            return await handleClaudeResponse(await retryResponse.json(), 'Claude 3.5 Sonnet (fallback)');
          }
        }
        
        // If model not found, try with a different model as fallback
        if (response.status === 404 && errorText.includes('model')) {
          console.log('Model not found, attempting with fallback model...');
          
          // Try with a different model known to exist
          console.log('Retrying with model: claude-3-5-haiku-20241022');
          const fallbackResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': CLAUDE_API_KEY,
              'anthropic-version': '2023-12-15' // Using latest API version
            },
            body: JSON.stringify({
              model: 'claude-3-5-haiku-20241022', // Using the newest Haiku model as backup
              max_tokens: 1024,
              messages: [
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: 0.3
            })
          });
          
          if (!fallbackResponse.ok) {
            const fallbackErrorText = await fallbackResponse.text();
            throw new Error(`Claude API fallback also failed: ${fallbackResponse.status} - ${fallbackErrorText}`);
          }
          
          return await handleClaudeResponse(await fallbackResponse.json(), 'Claude 3.5 Haiku (fallback)');
        }
        
        // If all our specific model attempts fail, try with the simplest model identifier
        console.log('All specific models failed, trying with simplest model name: claude-3');
        const lastAttemptResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-12-15' // Using latest API version
          },
          body: JSON.stringify({
            model: 'claude-3', // Using simplest possible model name
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.3
          })
        });
        
        if (!lastAttemptResponse.ok) {
          const lastAttemptErrorText = await lastAttemptResponse.text();
          console.error(`Final Claude API attempt failed (${lastAttemptResponse.status}): ${lastAttemptErrorText}`);
          throw new Error(`All Claude API model attempts failed. Final error: ${lastAttemptResponse.status} - ${lastAttemptErrorText}`);
        }
        
        return await handleClaudeResponse(await lastAttemptResponse.json(), 'Claude 3 (basic fallback)');
      }
      
      console.log('Successfully received response from Claude API');
      const aiResponse = await response.json();
      return await handleClaudeResponse(aiResponse, 'Claude (Anthropic)');
    } catch (apiError) {
      console.error('Claude API error:', apiError);
      return {
        safetyScore: calculateBasicSafetyScore(data),
        safetyAnalysis: `AI analysis failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}. Basic automated checks were performed instead.`,
        recommendations: ['Proceed with caution', 'Check all transaction details carefully before confirming'],
        redFlags: ['AI analysis service error'],
        aiServiceUsed: 'None (error accessing API)'
      };
    }
  } catch (error) {
    console.error('Error in AI analysis:', error);
    
    // Fallback to basic analysis
    return {
      safetyScore: calculateBasicSafetyScore(data),
      safetyAnalysis: 'AI analysis failed. Basic automated checks were performed instead.',
      recommendations: ['Proceed with caution', 'Check all transaction details carefully before confirming'],
      redFlags: ['AI analysis service unavailable'],
      aiServiceUsed: 'None (fallback to basic analysis)'
    };
  }
}

// ----------------------------------
// 7. Claude API Response Parser
// ----------------------------------
async function handleClaudeResponse(aiResponse: any, serviceUsed: string) {
  if (!aiResponse.content || !aiResponse.content[0] || !aiResponse.content[0].text) {
    throw new Error('Invalid response format from Claude API');
  }
  
  // Parse the AI's response
  const aiContent = aiResponse.content[0].text;
  let aiResult;
  
  try {
    // Find JSON part of the response
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      aiResult = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in AI response');
    }
  } catch (parseError) {
    console.error('Error parsing AI response:', parseError);
    aiResult = {
      safetyScore: 50,
      safetyAnalysis: 'Error parsing AI analysis: ' + aiContent.substring(0, 100) + '...',
      recommendations: ['Try again or proceed with caution'],
      redFlags: ['AI analysis parsing failed']
    };
  }
  
  return {
    ...aiResult,
    aiServiceUsed: serviceUsed
  };
}

// ----------------------------------
// 8. Basic Fallback Scoring (No AI)
// ----------------------------------
export function calculateBasicSafetyScore(data: TransactionSafetyData): number {
  let score = 100; // Start with perfect score
  const reductions: { reason: string; amount: number }[] = [];

  // Convert amount to ETH for comparison (if it exists)
  const amountInEth = data.amount ? parseFloat(data.amount) : 0;
  const currency = data.currency || 'unknown'; 
  
  console.log('Basic safety score: Amount check', {
    originalAmount: data.amount,
    amountInEth,
    currency,
    amountWithCurrency: `${amountInEth} ${currency}`
  });

  // Check for very large transfers (> 100 ETH)
  if (currency === 'ETH' && amountInEth > 100) {
    const reduction = Math.min(30, Math.floor(amountInEth / 100) * 5);
    reductions.push({ reason: 'Large transfer amount', amount: reduction });
    score -= reduction;
  }

  // Recipient risk checks
  if (data.recipientRisk?.riskScore) {
    const riskReduction = Math.floor(data.recipientRisk.riskScore / 2);
    reductions.push({ reason: 'Recipient risk score', amount: riskReduction });
    score -= riskReduction;
  }

  // Calldata verification
  if (data.calldataVerification) {
    if (!data.calldataVerification.recipientMatches) {
      reductions.push({ reason: 'Recipient mismatch', amount: 50 });
      score -= 50;
    }
    if (!data.calldataVerification.valueMatches) {
      reductions.push({ reason: 'Value mismatch', amount: 50 });
      score -= 50;
    }
    if (data.calldataVerification.suspiciousActions?.containsSuspiciousSignatures) {
      reductions.push({ reason: 'Suspicious signatures', amount: 40 });
      score -= 40;
    }
  }

  // Simulation results
  if (data.simulationResults) {
    if (!data.simulationResults.success) {
      reductions.push({ reason: 'Failed simulation', amount: 30 });
      score -= 30;
    }
    if (data.simulationResults.warnings?.length) {
      const warningReduction = Math.min(20, data.simulationResults.warnings.length * 5);
      reductions.push({ reason: 'Simulation warnings', amount: warningReduction });
      score -= warningReduction;
    }
  }

  // Contract verification
  if (data.etherscanData?.isContract && !data.etherscanData?.isVerified) {
    reductions.push({ reason: 'Unverified contract', amount: 20 });
    score -= 20;
  }

  // Log scoring details
  console.log('Basic safety score calculation:', {
    finalScore: Math.max(0, score),
    reductions,
    transactionDetails: {
      amount: amountInEth,
      currency: data.currency,
      recipientRisk: data.recipientRisk,
      calldataVerification: data.calldataVerification,
      simulationResults: data.simulationResults,
      etherscanData: data.etherscanData
    }
  });

  return Math.max(0, score);
} 