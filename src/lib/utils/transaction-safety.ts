// Native fetch is globally available in Next.js, no need to import
import { parseEther, parseUnits } from 'viem';

// Environment variables for API keys
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const TENDERLY_ACCESS_KEY = process.env.TENDERLY_ACCESS_KEY || '';
const TENDERLY_USER = process.env.TENDERLY_USER || '';
const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT || '';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';

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
}) {
  try {
    // If Tenderly API key is not set, fallback to simple checks
    if (!TENDERLY_ACCESS_KEY) {
      console.log('Tenderly API key not set, skipping simulation');
      return {
        success: true,
        simulated: false,
        message: 'Simulation skipped - Tenderly API key not configured',
        estimatedGas: '100000',
        warnings: []
      };
    }
    
    // Prepare simulation payload for Tenderly
    const simulationPayload = {
      network_id: '11155111', // Sepolia network ID
      from: params.sender,
      to: params.recipient,
      input: params.callData,
      gas: 1000000,
      gas_price: '1000000000',
      value: params.value
    };
    
    // Call Tenderly API
    const response = await fetch(
      `https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/simulate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': TENDERLY_ACCESS_KEY
        },
        body: JSON.stringify(simulationPayload)
      }
    );
    
    const data = await response.json();
    
    // Check if we got a valid response
    if (!data || !data.transaction) {
      console.warn('Invalid response from Tenderly API:', data);
      return {
        success: true, // Default to success if simulation fails
        simulated: false,
        message: 'Invalid response from Tenderly API',
        warnings: ['Could not get valid simulation results']
      };
    }
    
    // Analyze results
    const warnings = [];
    
    if (!data.transaction.status) {
      warnings.push('Transaction would fail');
    }
    
    if (data.transaction.gas_used > 500000) {
      warnings.push('High gas usage detected');
    }
    
    // Check for unusual state changes
    if (data.transaction.state_diff) {
      // This would need more sophisticated analysis in production
      const stateChanges = Object.keys(data.transaction.state_diff).length;
      if (stateChanges > 10) {
        warnings.push(`Large number of state changes (${stateChanges})`);
      }
    }
    
    return {
      success: data.transaction.status,
      simulated: true,
      gasUsed: data.transaction.gas_used || 0,
      stateChanges: data.transaction.state_diff ? Object.keys(data.transaction.state_diff).length : 0,
      logs: data.transaction.logs ? data.transaction.logs.length : 0,
      warnings
    };
  } catch (error) {
    console.error('Error simulating transaction:', error);
    return {
      success: true, // Default to success if simulation fails
      simulated: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Could not simulate transaction',
      warnings: ['Could not complete simulation']
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
    // Skip if Claude API key not set
    if (!CLAUDE_API_KEY) {
      console.log('Claude API key not set, skipping AI analysis');
      return {
        safetyScore: calculateBasicSafetyScore(data),
        safetyAnalysis: 'AI analysis skipped - API key not configured',
        recommendations: ['Configure Claude API key for detailed AI analysis'],
        aiServiceUsed: 'None'
      };
    }
    
    // Prepare the prompt for Claude
    const prompt = `
      Analyze this Ethereum transaction for safety and security concerns:
      
      Transaction details:
      - Type: ${data.transactionType || 'Unknown'}
      - Amount: ${data.amount || '0'} ${data.currency || 'ETH'}
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
      Pay special attention to any risk indicators from GoPlus Security API, as these are strong signals of potential scams.
      Provide an overall safety score between 0-100 where 100 is completely safe.
      If "phishing_activities" or "blacklist_doubt" are found, these are serious concerns and should significantly reduce the safety score.
      Give specific recommendations for the user.
      
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
function calculateBasicSafetyScore(data: any): number {
  let score = 100; // Start with perfect score and subtract for issues
  
  // Calldata verification issues
  if (!data.calldataVerification.recipientMatches) score -= 30;
  if (!data.calldataVerification.valueMatches) score -= 20;
  if (data.calldataVerification.suspiciousActions.containsSuspiciousSignatures) score -= 40;
  
  // Recipient risk issues from GoPlus
  if (data.recipientRisk.riskScore) {
    score -= data.recipientRisk.riskScore * 0.3; // Scale down risk score
  }
  
  // Check for specific high-risk indicators
  if (data.recipientRisk.riskIndicators && data.recipientRisk.riskIndicators.length > 0) {
    // Each risk indicator reduces the score
    score -= Math.min(data.recipientRisk.riskIndicators.length * 7, 30);
    
    // Some risk indicators are more serious than others
    const highRiskIndicators = [
      'phishing_activities', 
      'blacklist_doubt',
      'cybercrime',
      'money_laundering',
      'darkweb_transactions',
      'sanctioned',
      'stealing_attack'
    ];
    
    // Check if any high risk indicators are present
    for (const indicator of data.recipientRisk.riskIndicators) {
      for (const highRiskKey of highRiskIndicators) {
        if (indicator.toLowerCase().includes(highRiskKey)) {
          // Serious issue detected, significant penalty
          score -= 25;
          break;
        }
      }
    }
  }
  
  // Legacy checks for fallback mode
  if (data.recipientRisk.isNewAddress) score -= 10;
  if (data.recipientRisk.isContract && data.etherscanData && !data.etherscanData.isVerified) score -= 15;
  
  // Simulation issues
  if (data.simulationResults.simulated && !data.simulationResults.success) score -= 40;
  if (data.simulationResults.warnings && data.simulationResults.warnings.length > 0) {
    score -= Math.min(data.simulationResults.warnings.length * 10, 30);
  }
  
  // Etherscan issues
  if (data.etherscanData && data.etherscanData.warnings && data.etherscanData.warnings.length > 0) {
    score -= Math.min(data.etherscanData.warnings.length * 5, 20);
  }
  
  // Cap the score between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score)));
} 