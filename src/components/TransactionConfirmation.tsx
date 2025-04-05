'use client';

import { useState, useEffect } from 'react';
import { parseEther } from 'viem';

interface TransactionDetails {
  recipient: string;
  amount: string;
  network: string;
}

interface TransactionConfirmationProps {
  walletAddress: string;
  transactionDetails: TransactionDetails;
  onConfirm: (gasOption: 'default' | 'sponsored' | 'usdc' | 'bundler') => void;
  onBack: () => void;
}

interface SafetyAnalysis {
  success: boolean;
  safetyCheck: {
    isSafe: boolean;
    warnings: string[];
    safetyScore?: number;
    safetyAnalysis?: string;
    recommendations?: string[];
    redFlags?: string[];
    details?: {
      calldataVerification?: {
        recipientMatches: boolean;
        valueMatches: boolean;
        suspiciousActions?: {
          containsSuspiciousSignatures: boolean;
          suspiciousDetails: string;
        };
      };
      recipientRisk?: {
        riskScore: number;
        riskCategory: string;
        dataSource: string;
        riskIndicators?: string[];
        details: string;
      };
      simulationResults?: {
        success: boolean;
        simulated: boolean;
        gasUsed: string;
        stateChanges: number;
        warnings: string[];
        message: string;
      };
      etherscanData?: {
        isContract: boolean;
        contractName?: string;
        isVerified: boolean;
        deploymentDate: string;
        transactionVolume: string;
        hasRecentActivity: boolean;
        warnings: string[];
      };
    };
  }
}

export default function TransactionConfirmation({ 
  walletAddress, 
  transactionDetails, 
  onConfirm, 
  onBack 
}: TransactionConfirmationProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [safetyAnalysis, setSafetyAnalysis] = useState<SafetyAnalysis | null>(null);
  const [selectedGasOption, setSelectedGasOption] = useState<'default' | 'sponsored' | 'usdc' | 'bundler'>('sponsored');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkTransactionSafety = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Use our new comprehensive safety API
        const safetyResponse = await fetch('/api/transaction/safety', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: transactionDetails.recipient,
            value: transactionDetails.amount,
            data: '0x' // Simple ETH transfer
          })
        });

        if (!safetyResponse.ok) {
          throw new Error('Failed to check transaction safety');
        }

        const safetyResult = await safetyResponse.json();
        console.log('Safety analysis:', safetyResult);
        setSafetyAnalysis(safetyResult);
      } catch (err) {
        console.error('Error checking transaction safety:', err);
        setError(err instanceof Error ? err.message : 'Failed to analyze transaction safety');
      } finally {
        setIsLoading(false);
      }
    };

    checkTransactionSafety();
  }, [transactionDetails]);

  const handleConfirm = () => {
    onConfirm(selectedGasOption);
  };

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 10)}...${address.substring(address.length - 8)}`;
  };

  const getSafetyColor = () => {
    if (!safetyAnalysis?.safetyCheck) return 'bg-gray-700';
    
    const { isSafe, warnings } = safetyAnalysis.safetyCheck;
    if (isSafe) return 'bg-green-700';
    if (warnings.length > 2) return 'bg-red-700';
    return 'bg-yellow-700';
  };

  const getSafetyScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="text-3xl font-bold mb-8">Confirm Transaction</h2>

      {isLoading ? (
        <div className="space-y-6">
          <div className="animate-pulse h-32 bg-gray-800 rounded-lg"></div>
          <div className="animate-pulse h-48 bg-gray-800 rounded-lg"></div>
          <div className="animate-pulse h-32 bg-gray-800 rounded-lg"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Transaction Details Card */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="text-xl font-semibold mb-4">Transaction Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">From</span>
                <span className="font-mono text-sm">{formatAddress(walletAddress)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">To</span>
                <span className="font-mono text-sm">{formatAddress(transactionDetails.recipient)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Network</span>
                <span>{transactionDetails.network}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount</span>
                <span>{transactionDetails.amount} ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Transaction Type</span>
                <span>Transfer</span>
              </div>
            </div>
          </div>

          {/* AI Analysis Card */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="text-xl font-semibold mb-4">AI Analysis</h3>
            {error ? (
              <div className="p-3 bg-red-900/50 border border-red-600 rounded-md text-sm">
                {error}
              </div>
            ) : (
              <div className="space-y-4">
                {safetyAnalysis?.safetyCheck && (
                  <>
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full ${getSafetyColor()} mr-2`}></div>
                      <span className="font-medium">
                        {safetyAnalysis.safetyCheck.isSafe 
                          ? 'Transaction appears safe' 
                          : 'Potential risks detected'}
                      </span>
                      {safetyAnalysis.safetyCheck.safetyScore && (
                        <span className="ml-auto text-sm">
                          Safety Score: 
                          <span className={`ml-1 font-semibold ${getSafetyScoreColor(safetyAnalysis.safetyCheck.safetyScore)}`}>
                            {safetyAnalysis.safetyCheck.safetyScore}/100
                          </span>
                        </span>
                      )}
                    </div>

                    {safetyAnalysis.safetyCheck.warnings && safetyAnalysis.safetyCheck.warnings.length > 0 && (
                      <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-md text-sm">
                        <p className="font-medium mb-1">Warnings:</p>
                        <ul className="list-disc pl-5 space-y-1">
                          {safetyAnalysis.safetyCheck.warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {safetyAnalysis.safetyCheck.safetyAnalysis && (
                      <div className="text-sm text-gray-300">
                        <p className="font-medium mb-1">Analysis:</p>
                        <p>{safetyAnalysis.safetyCheck.safetyAnalysis}</p>
                      </div>
                    )}

                    {safetyAnalysis.safetyCheck.recommendations && safetyAnalysis.safetyCheck.recommendations.length > 0 && (
                      <div className="text-sm">
                        <p className="font-medium mb-1">Recommendations:</p>
                        <ul className="list-disc pl-5 space-y-1 text-gray-300">
                          {safetyAnalysis.safetyCheck.recommendations.map((rec, index) => (
                            <li key={index}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Security Check Details */}
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <details className="mb-3">
                        <summary className="font-medium text-sm cursor-pointer hover:text-violet-400">
                          Calldata Verification
                        </summary>
                        <div className="mt-2 p-3 bg-gray-800/50 rounded-md text-xs space-y-1 text-gray-300">
                          {safetyAnalysis.safetyCheck.details?.calldataVerification && (
                            <>
                              <div className="flex justify-between">
                                <span>Recipient matches:</span>
                                <span className={safetyAnalysis.safetyCheck.details.calldataVerification.recipientMatches ? "text-green-400" : "text-red-400"}>
                                  {safetyAnalysis.safetyCheck.details.calldataVerification.recipientMatches ? "Yes" : "No"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Value matches:</span>
                                <span className={safetyAnalysis.safetyCheck.details.calldataVerification.valueMatches ? "text-green-400" : "text-red-400"}>
                                  {safetyAnalysis.safetyCheck.details.calldataVerification.valueMatches ? "Yes" : "No"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Suspicious signatures:</span>
                                <span className={!safetyAnalysis.safetyCheck.details.calldataVerification.suspiciousActions?.containsSuspiciousSignatures ? "text-green-400" : "text-red-400"}>
                                  {safetyAnalysis.safetyCheck.details.calldataVerification.suspiciousActions?.containsSuspiciousSignatures ? "Yes" : "No"}
                                </span>
                              </div>
                              {safetyAnalysis.safetyCheck.details.calldataVerification.suspiciousActions?.suspiciousDetails && (
                                <div className="text-yellow-400 mt-1">
                                  {safetyAnalysis.safetyCheck.details.calldataVerification.suspiciousActions.suspiciousDetails}
                                </div>
                              )}
                              <div className="text-gray-400 text-xs mt-2 italic">
                                Note: Calldata mismatches are common in simple ETH transfers and not always a concern.
                              </div>
                            </>
                          )}
                        </div>
                      </details>
                      
                      <details className="mb-3">
                        <summary className="font-medium text-sm cursor-pointer hover:text-violet-400">
                          Address Security Check
                        </summary>
                        <div className="mt-2 p-3 bg-gray-800/50 rounded-md text-xs space-y-1 text-gray-300">
                          {safetyAnalysis.safetyCheck.details?.recipientRisk && (
                            <>
                              <div className="flex justify-between">
                                <span>Risk score:</span>
                                <span className={safetyAnalysis.safetyCheck.details.recipientRisk.riskScore < 30 ? "text-green-400" : safetyAnalysis.safetyCheck.details.recipientRisk.riskScore < 70 ? "text-yellow-400" : "text-red-400"}>
                                  {safetyAnalysis.safetyCheck.details.recipientRisk.riskScore}/100
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Risk category:</span>
                                <span className={safetyAnalysis.safetyCheck.details.recipientRisk.riskCategory === "Low" ? "text-green-400" : safetyAnalysis.safetyCheck.details.recipientRisk.riskCategory === "Medium" ? "text-yellow-400" : "text-red-400"}>
                                  {safetyAnalysis.safetyCheck.details.recipientRisk.riskCategory}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Data source:</span>
                                <span>{safetyAnalysis.safetyCheck.details.recipientRisk.dataSource}</span>
                              </div>
                              {safetyAnalysis.safetyCheck.details.recipientRisk.riskIndicators && safetyAnalysis.safetyCheck.details.recipientRisk.riskIndicators.length > 0 && (
                                <div className="mt-1">
                                  <p className="font-medium text-red-400">Risk indicators:</p>
                                  <ul className="list-disc pl-5 mt-1">
                                    {safetyAnalysis.safetyCheck.details.recipientRisk.riskIndicators.map((indicator, idx) => (
                                      <li key={idx}>{indicator}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {safetyAnalysis.safetyCheck.details.recipientRisk.details && (
                                <div className="text-xs mt-1 text-gray-400">
                                  {safetyAnalysis.safetyCheck.details.recipientRisk.details}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </details>
                      
                      <details className="mb-3">
                        <summary className="font-medium text-sm cursor-pointer hover:text-violet-400">
                          Transaction Simulation
                        </summary>
                        <div className="mt-2 p-3 bg-gray-800/50 rounded-md text-xs space-y-1 text-gray-300">
                          {safetyAnalysis.safetyCheck.details?.simulationResults && (
                            <>
                              <div className="flex justify-between">
                                <span>Simulation success:</span>
                                <span className={safetyAnalysis.safetyCheck.details.simulationResults.success ? "text-green-400" : "text-red-400"}>
                                  {safetyAnalysis.safetyCheck.details.simulationResults.success ? "Yes" : "No"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Was simulated:</span>
                                <span>{safetyAnalysis.safetyCheck.details.simulationResults.simulated ? "Yes" : "No"}</span>
                              </div>
                              {safetyAnalysis.safetyCheck.details.simulationResults.gasUsed && (
                                <div className="flex justify-between">
                                  <span>Gas used:</span>
                                  <span>{safetyAnalysis.safetyCheck.details.simulationResults.gasUsed}</span>
                                </div>
                              )}
                              {safetyAnalysis.safetyCheck.details.simulationResults.stateChanges !== undefined && (
                                <div className="flex justify-between">
                                  <span>State changes:</span>
                                  <span>{safetyAnalysis.safetyCheck.details.simulationResults.stateChanges}</span>
                                </div>
                              )}
                              {safetyAnalysis.safetyCheck.details.simulationResults.warnings && safetyAnalysis.safetyCheck.details.simulationResults.warnings.length > 0 && (
                                <div className="mt-1">
                                  <p className="font-medium text-yellow-400">Simulation warnings:</p>
                                  <ul className="list-disc pl-5 mt-1">
                                    {safetyAnalysis.safetyCheck.details.simulationResults.warnings.map((warning, idx) => (
                                      <li key={idx}>{warning}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {safetyAnalysis.safetyCheck.details.simulationResults.message && (
                                <div className="text-xs mt-1 text-gray-400">
                                  {safetyAnalysis.safetyCheck.details.simulationResults.message}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </details>
                      
                      <details className="mb-3">
                        <summary className="font-medium text-sm cursor-pointer hover:text-violet-400">
                          Etherscan Data
                        </summary>
                        <div className="mt-2 p-3 bg-gray-800/50 rounded-md text-xs space-y-1 text-gray-300">
                          {safetyAnalysis.safetyCheck.details?.etherscanData && (
                            <>
                              <div className="flex justify-between">
                                <span>Is contract:</span>
                                <span className={safetyAnalysis.safetyCheck.details.etherscanData.isContract ? "text-yellow-400" : "text-green-400"}>
                                  {safetyAnalysis.safetyCheck.details.etherscanData.isContract ? "Yes" : "No"}
                                </span>
                              </div>
                              {safetyAnalysis.safetyCheck.details.etherscanData.isContract && (
                                <>
                                  <div className="flex justify-between">
                                    <span>Contract name:</span>
                                    <span>{safetyAnalysis.safetyCheck.details.etherscanData.contractName || "Unnamed"}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Verified contract:</span>
                                    <span className={safetyAnalysis.safetyCheck.details.etherscanData.isVerified ? "text-green-400" : "text-yellow-400"}>
                                      {safetyAnalysis.safetyCheck.details.etherscanData.isVerified ? "Yes" : "No"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Deployment date:</span>
                                    <span>{safetyAnalysis.safetyCheck.details.etherscanData.deploymentDate}</span>
                                  </div>
                                </>
                              )}
                              <div className="flex justify-between">
                                <span>Transaction volume:</span>
                                <span>{safetyAnalysis.safetyCheck.details.etherscanData.transactionVolume}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Recent activity:</span>
                                <span>{safetyAnalysis.safetyCheck.details.etherscanData.hasRecentActivity ? "Yes" : "No"}</span>
                              </div>
                              {safetyAnalysis.safetyCheck.details.etherscanData.warnings && safetyAnalysis.safetyCheck.details.etherscanData.warnings.length > 0 && (
                                <div className="mt-1">
                                  <p className="font-medium text-yellow-400">Etherscan warnings:</p>
                                  <ul className="list-disc pl-5 mt-1">
                                    {safetyAnalysis.safetyCheck.details.etherscanData.warnings.map((warning, idx) => (
                                      <li key={idx}>{warning}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </details>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Gas Options Card */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="text-xl font-semibold mb-4">Gas options & Bundler</h3>
            <div className="space-y-3">
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="gasOption"
                    value="sponsored"
                    checked={selectedGasOption === 'sponsored'}
                    onChange={() => setSelectedGasOption('sponsored')}
                    className="text-violet-600"
                  />
                  <span>Sponsored (Free)</span>
                </label>
                <p className="text-sm text-gray-400 ml-6">Transaction fees are covered for you</p>
              </div>
              
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="gasOption"
                    value="default"
                    checked={selectedGasOption === 'default'}
                    onChange={() => setSelectedGasOption('default')}
                    className="text-violet-600"
                  />
                  <span>Pay with ETH</span>
                </label>
                <p className="text-sm text-gray-400 ml-6">Use ETH from your wallet to pay gas fees</p>
              </div>
              
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="gasOption" 
                    value="usdc"
                    checked={selectedGasOption === 'usdc'}
                    onChange={() => setSelectedGasOption('usdc')}
                    className="text-violet-600"
                  />
                  <span>Pay with USDC</span>
                </label>
                <p className="text-sm text-gray-400 ml-6">Use USDC from your wallet to pay gas fees</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={onBack}
              className="flex-1 py-3 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-700"
            >
              Back
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-3 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 