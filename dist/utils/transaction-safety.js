import fetch from 'node-fetch';
import { parseEther } from 'viem';
// Environment variables for API keys
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const TENDERLY_ACCESS_KEY = process.env.TENDERLY_ACCESS_KEY || '';
const TENDERLY_USER = process.env.TENDERLY_USER || '';
const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
/**
 * Call data verification function
 * Verifies that the calldata matches what's displayed in the UI
 */
export function verifyCalldata(rawCalldata, displayedData) {
    // Simple validation for demo purposes
    // In production, you would use a proper ERC-4337 decoding library
    // Basic check if calldata contains the recipient address (without 0x prefix)
    const recipientInCalldata = displayedData.recipient
        ? rawCalldata.toLowerCase().includes(displayedData.recipient.slice(2).toLowerCase())
        : false;
    // Extract amount for ETH transfers (very simplified)
    // For a real implementation, you'd need proper ABI decoding
    let valueMatches = false;
    if (displayedData.amount && displayedData.amount.includes('ETH')) {
        const amountStr = displayedData.amount.split(' ')[0];
        try {
            const amountWei = parseEther(amountStr).toString();
            valueMatches = rawCalldata.includes(amountWei.padStart(64, '0').slice(2));
        }
        catch (e) {
            console.error('Error parsing ETH amount:', e);
        }
    }
    return {
        recipientMatches: recipientInCalldata,
        valueMatches: valueMatches,
        messageMatches: true, // Simplified for demo
        suspiciousActions: detectSuspiciousActions(rawCalldata),
        overallMatch: recipientInCalldata && (valueMatches || !displayedData.amount.includes('ETH'))
    };
}
/**
 * Function to detect suspicious actions in calldata
 */
function detectSuspiciousActions(rawCalldata) {
    // List of suspicious function signatures to check for
    const suspiciousFunctionSignatures = [
        // Common attack vectors
        '0x095ea7b3', // approve (potential unlimited approval)
        '0x42842e0e', // safeTransferFrom (NFT)
        '0x23b872dd', // transferFrom (ERC20)
        '0xa22cb465', // setApprovalForAll (NFT)
    ];
    const suspiciousFound = suspiciousFunctionSignatures.some(signature => rawCalldata.includes(signature.slice(2)));
    return {
        containsSuspiciousSignatures: suspiciousFound,
        suspiciousDetails: suspiciousFound ? 'Contains potential approval or transferFrom calls' : ''
    };
}
/**
 * Recipient risk assessment
 * In production, you would use Chainalysis or similar API
 */
export async function checkRecipientRisk(address) {
    try {
        // For demo purposes, we'll simulate by checking if the address is new
        // In production, integrate with Chainalysis or similar service
        // Etherscan API for basic account info
        const response = await fetch(`https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${ETHERSCAN_API_KEY}`);
        const data = await response.json();
        const isNewAddress = !data.result || data.result.length === 0;
        const txCount = data.result ? data.result.length : 0;
        // Check for contract
        const contractResponse = await fetch(`https://api-sepolia.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${ETHERSCAN_API_KEY}`);
        const contractData = await contractResponse.json();
        const isContract = contractData.status === '1';
        // Simulate a risk score based on factors
        let riskScore = 0;
        if (isNewAddress)
            riskScore += 40; // New addresses are higher risk
        if (isContract)
            riskScore += 20; // Contracts are higher risk
        if (txCount < 5)
            riskScore += 20; // Addresses with few transactions are higher risk
        // Random factor for demo (remove in production)
        riskScore += Math.floor(Math.random() * 20);
        // Cap at 100
        if (riskScore > 100)
            riskScore = 100;
        return {
            isRisky: riskScore > 70,
            riskScore: riskScore,
            riskCategory: riskScore > 70 ? 'High' : riskScore > 40 ? 'Medium' : 'Low',
            isNewAddress,
            isContract,
            transactionCount: txCount,
            details: `Address has ${txCount} transactions and ${isContract ? 'is' : 'is not'} a contract.`
        };
    }
    catch (error) {
        console.error('Error checking address risk:', error);
        return {
            error: 'Could not assess address risk',
            isRisky: false,
            riskScore: 0,
            riskCategory: 'Unknown',
            details: 'Error checking address risk'
        };
    }
}
/**
 * Transaction simulation
 * In production, use Tenderly API
 */
export async function simulateTransaction(params) {
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
        const response = await fetch(`https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/simulate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': TENDERLY_ACCESS_KEY
            },
            body: JSON.stringify(simulationPayload)
        });
        const data = await response.json();
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
            gasUsed: data.transaction.gas_used,
            stateChanges: data.transaction.state_diff ? Object.keys(data.transaction.state_diff).length : 0,
            logs: data.transaction.logs ? data.transaction.logs.length : 0,
            warnings
        };
    }
    catch (error) {
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
/**
 * Etherscan data check
 */
export async function checkEtherscanData(address) {
    try {
        // Get contract info if it's a contract
        const contractResponse = await fetch(`https://api-sepolia.etherscan.io/api?module=contract&action=getsourcecode&address=${address}&apikey=${ETHERSCAN_API_KEY}`);
        const contractData = await contractResponse.json();
        // Get recent transactions
        const txResponse = await fetch(`https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${ETHERSCAN_API_KEY}`);
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
    }
    catch (error) {
        console.error('Error checking Etherscan data:', error);
        return {
            error: 'Could not check Etherscan data',
            warnings: ['Could not retrieve Etherscan data']
        };
    }
}
/**
 * AI analysis of transaction safety
 */
export async function aiTransactionAnalysis(data) {
    try {
        // Skip if OpenAI API key not set
        if (!OPENAI_API_KEY) {
            console.log('OpenAI API key not set, skipping AI analysis');
            return {
                safetyScore: calculateBasicSafetyScore(data),
                safetyAnalysis: 'AI analysis skipped - API key not configured',
                recommendations: ['Configure OpenAI API key for detailed AI analysis'],
                aiServiceUsed: 'None'
            };
        }
        // Prepare the prompt for OpenAI
        const prompt = `
      Analyze this Ethereum transaction for safety and security concerns:
      
      Transaction details:
      - Type: ${data.transactionType}
      - Amount: ${data.amount} ${data.currency}
      - Message included: ${data.message ? `"${data.message}"` : 'None'}
      
      Call data verification:
      - Recipient matches: ${data.calldataVerification.recipientMatches}
      - Value matches: ${data.calldataVerification.valueMatches}
      - Contains suspicious signatures: ${data.calldataVerification.suspiciousActions.containsSuspiciousSignatures}
      - Suspicious details: ${data.calldataVerification.suspiciousActions.suspiciousDetails}
      
      Recipient risk assessment:
      - Risk score: ${data.recipientRisk.riskScore}/100
      - Risk category: ${data.recipientRisk.riskCategory}
      - Is new address: ${data.recipientRisk.isNewAddress}
      - Is contract: ${data.recipientRisk.isContract}
      - Transaction count: ${data.recipientRisk.transactionCount}
      - Details: ${data.recipientRisk.details}
      
      Transaction simulation:
      - Success: ${data.simulationResults.success}
      - Simulated: ${data.simulationResults.simulated}
      - Gas used: ${data.simulationResults.gasUsed}
      - State changes: ${data.simulationResults.stateChanges}
      - Warnings: ${data.simulationResults.warnings.join(', ')}
      
      Etherscan data:
      - Is contract: ${data.etherscanData.isContract}
      - Contract name: ${data.etherscanData.contractName}
      - Is verified: ${data.etherscanData.isVerified}
      - Deployment date: ${data.etherscanData.deploymentDate}
      - Transaction volume: ${data.etherscanData.transactionVolume}
      - Has recent activity: ${data.etherscanData.hasRecentActivity}
      - Warnings: ${data.etherscanData.warnings.join(', ')}
      
      Analyze the safety of this transaction. Identify any red flags or suspicious elements. 
      Provide an overall safety score between 0-100 where 100 is completely safe. 
      Give specific recommendations for the user.
      
      Format your response as JSON with the following structure:
      {
        "safetyScore": number,
        "safetyAnalysis": "detailed analysis here",
        "recommendations": ["rec1", "rec2", ...],
        "redFlags": ["flag1", "flag2", ...] 
      }
    `;
        // Call OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a blockchain security expert that analyzes Ethereum transactions for safety and security issues.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3
            })
        });
        const aiResponse = await response.json();
        if (!aiResponse.choices || !aiResponse.choices[0] || !aiResponse.choices[0].message) {
            throw new Error('Invalid response from OpenAI API');
        }
        // Parse the AI's response
        const aiContent = aiResponse.choices[0].message.content;
        let aiResult;
        try {
            // Find JSON part of the response
            const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                aiResult = JSON.parse(jsonMatch[0]);
            }
            else {
                throw new Error('No JSON found in AI response');
            }
        }
        catch (error) {
            console.error('Error parsing AI response:', error);
            aiResult = {
                safetyScore: calculateBasicSafetyScore(data),
                safetyAnalysis: 'Error parsing AI analysis: ' + aiContent,
                recommendations: ['Try again or proceed with caution'],
                redFlags: ['AI analysis failed']
            };
        }
        return {
            ...aiResult,
            aiServiceUsed: 'OpenAI GPT-4'
        };
    }
    catch (error) {
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
/**
 * Calculate a basic safety score without AI
 */
function calculateBasicSafetyScore(data) {
    let score = 100; // Start with perfect score and subtract for issues
    // Calldata verification issues
    if (!data.calldataVerification.recipientMatches)
        score -= 30;
    if (!data.calldataVerification.valueMatches)
        score -= 20;
    if (data.calldataVerification.suspiciousActions.containsSuspiciousSignatures)
        score -= 40;
    // Recipient risk issues
    score -= data.recipientRisk.riskScore * 0.3; // Scale down risk score
    if (data.recipientRisk.isNewAddress)
        score -= 10;
    if (data.recipientRisk.isContract && !data.etherscanData.isVerified)
        score -= 15;
    // Simulation issues
    if (data.simulationResults.simulated && !data.simulationResults.success)
        score -= 40;
    if (data.simulationResults.warnings && data.simulationResults.warnings.length > 0) {
        score -= Math.min(data.simulationResults.warnings.length * 10, 30);
    }
    // Etherscan issues
    if (data.etherscanData.warnings) {
        score -= Math.min(data.etherscanData.warnings.length * 5, 20);
    }
    // Cap the score between 0 and 100
    return Math.max(0, Math.min(100, Math.round(score)));
}
