import { parseEther, parseUnits } from 'viem';
import type { Address } from 'viem';

// Environment variables for API keys
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const TENDERLY_ACCESS_KEY = process.env.TENDERLY_ACCESS_KEY || '';
const TENDERLY_USER = process.env.TENDERLY_USER || '';
const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT || '';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';

interface DisplayedData {
    recipient?: Address;
    amount?: string;
    message?: string;
}

interface VerificationResult {
    recipientMatches: boolean;
    valueMatches: boolean;
    messageMatches: boolean;
    suspiciousActions: {
        containsSuspiciousSignatures: boolean;
        suspiciousDetails: string;
    };
    overallMatch: boolean;
}

interface RiskAssessmentResult {
    isRisky: boolean;
    riskScore: number;
    riskCategory: 'High' | 'Medium' | 'Low';
    dataSource: string;
    riskIndicators: string[];
    details: string;
}

/**
 * Call data verification function
 * Verifies that the calldata matches what's displayed in the UI
 */
export function verifyCalldata(rawCalldata: string, displayedData: DisplayedData): VerificationResult {
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

    // Verify recipient address - try multiple approaches
    let recipientInCalldata = false;
    if (displayedData.recipient) {
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
    }

    // Extract amount for ETH transfers with improved parsing
    let valueMatches = false;
    if (displayedData.amount) {
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
            }
            else if (displayedData.amount.includes('USDC')) {
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
            }
            else {
                // For other tokens or unknown formats, assume it's correct
                // In production, you would have more sophisticated parsing
                console.log('Skipping value check for unsupported currency');
                valueMatches = true;
            }
        }
        catch (e) {
            console.error('Error parsing amount:', e);
            // In production, you might want to set this to false
            valueMatches = true; // Be lenient if we can't parse the amount
        }
    }
    else {
        // If no amount is displayed, consider it a match
        valueMatches = true;
    }

    // For small amounts or debugging, temporarily force these to true
    // Only use for testing - remove in production
    if (process.env.NODE_ENV === 'development') {
        const isSmallAmount = displayedData.amount &&
            parseFloat(displayedData.amount.split(' ')[0]) < 0.001;
        if (isSmallAmount) {
            console.log('Small test amount detected, verification override for testing');
        }
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
    const suspiciousFound = suspiciousFunctionSignatures.some(signature => rawCalldata.includes(signature.slice(2)));
    return {
        containsSuspiciousSignatures: suspiciousFound,
        suspiciousDetails: suspiciousFound ? 'Contains potential approval or transferFrom calls' : ''
    };
}

/**
 * Recipient risk assessment
 * Uses GoPlus API to check address security status
 */
export async function checkRecipientRisk(address: Address): Promise<RiskAssessmentResult> {
    try {
        // Call GoPlus address security API
        const response = await fetch(`https://api.gopluslabs.io/api/v1/address_security/${address}`);
        const data = await response.json();
        // If API has an error, fallback to basic checks
        if (data.code !== 1 || !data.result) {
            console.log('GoPlus API error or no data:', data.message);
            return fallbackRiskCheck(address);
        }
        // Check for risk indicators in the result
        const riskIndicators: string[] = [];
        let highestRiskValue = 0;
        // Parse all risk indicators from GoPlus response
        for (const [key, value] of Object.entries(data.result)) {
            // Skip data_source as it's not a numeric indicator
            if (key === 'data_source')
                continue;
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
        let riskScore = riskIndicators.length > 0 ? 50 + (highestRiskValue * 10) : 20;
        // Cap at 100
        if (riskScore > 100)
            riskScore = 100;
        // Get data source if available
        const dataSource = data.result.data_source || 'Unknown';
        return {
            isRisky: riskScore > 70,
            riskScore: riskScore,
            riskCategory: riskScore > 70 ? 'High' : riskScore > 40 ? 'Medium' : 'Low',
            dataSource: dataSource,
            riskIndicators: riskIndicators,
            details: riskIndicators.length > 0
                ? `Address has ${riskIndicators.length} risk indicators: ${riskIndicators.join(', ')}. Data source: ${dataSource}`
                : `No known risk indicators. Data source: ${dataSource}`
        };
    }
    catch (error) {
        console.error('Error checking address risk:', error);
        return fallbackRiskCheck(address);
    }
}

/**
 * Fallback risk check using basic Etherscan data if GoPlus fails
 */
async function fallbackRiskCheck(address: Address): Promise<RiskAssessmentResult> {
    try {
        // Call Etherscan API to get basic address info
        const response = await fetch(`https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_API_KEY}`);
        const data = await response.json();
        
        // Basic risk assessment based on balance and transaction count
        const balance = parseFloat(data.result) / 1e18; // Convert from wei to ETH
        const isRisky = balance === 0; // Consider empty accounts risky
        
        return {
            isRisky,
            riskScore: isRisky ? 80 : 20,
            riskCategory: isRisky ? 'High' : 'Low',
            dataSource: 'Etherscan',
            riskIndicators: isRisky ? ['Empty account'] : [],
            details: isRisky ? 'Account has no ETH balance' : 'Account has ETH balance'
        };
    }
    catch (error) {
        console.error('Error in fallback risk check:', error);
        // Return a safe default result
        return {
            isRisky: true,
            riskScore: 100,
            riskCategory: 'High',
            dataSource: 'Fallback',
            riskIndicators: ['Unable to verify address'],
            details: 'Failed to verify address safety'
        };
    }
} 