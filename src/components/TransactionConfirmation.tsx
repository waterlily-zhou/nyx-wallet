'use client';

import { useState, useEffect } from 'react';

interface TransactionDetails {
  recipient: string;
  amount: string;
  network: string;
  currency?: string;
  calldata?: string;
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

interface GasEstimate {
  feeAmount: number;
  feeCurrency: string;
  estimatedCostUSD: number;
  gasLimit: string;
}

export default function TransactionConfirmation({ 
  walletAddress, 
  transactionDetails, 
  onConfirm, 
  onBack 
}: TransactionConfirmationProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [safetyAnalysis, setSafetyAnalysis] = useState<SafetyAnalysis | null>(null);
  const [selectedGasOption, setSelectedGasOption] = useState<'default' | 'usdc' | 'sponsored'>('default');
  const [gasEstimate, setGasEstimate] = useState<{
    feeAmount: number;
    feeCurrency: string;
    estimatedCostUSD: number;
    gasLimit: string;
  } | null>(null);
  const [isLoadingGas, setIsLoadingGas] = useState(false);
  const [gasError, setGasError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const checkTransactionSafety = async () => {
      try {
        setIsLoading(true);
        setAiError(null);
        
        const safetyResponse = await fetch('/api/transaction/safety', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: transactionDetails.recipient,
            value: transactionDetails.amount,
            data: transactionDetails.calldata || '0x',
            from: walletAddress,
            network: transactionDetails.network,
            type: 'TRANSFER'
          })
        });

        if (!safetyResponse.ok) {
          throw new Error('Failed to check transaction safety');
        }

        const safetyResult = await safetyResponse.json();
        setSafetyAnalysis(safetyResult);
      } catch (err) {
        console.error('Error checking transaction safety:', err);
        setAiError(err instanceof Error ? err.message : 'Failed to analyze transaction safety');
      } finally {
        setIsLoading(false);
      }
    };

    checkTransactionSafety();
  }, [transactionDetails, walletAddress]);

  const estimateGas = async () => {
    if (!transactionDetails) return;
    
    setIsLoadingGas(true);
    setGasError(null);
    
    try {
      const response = await fetch('/api/transaction/gas-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: transactionDetails.recipient,
          value: transactionDetails.amount,
          data: transactionDetails.calldata || '0x',
          from: walletAddress,
          gasOption: selectedGasOption,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to estimate gas');
      }

      const estimate = await response.json();
      setGasEstimate(estimate);
    } catch (error) {
      console.error('Gas estimation error:', error);
      setGasError(error instanceof Error ? error.message : 'Failed to estimate gas');
    } finally {
      setIsLoadingGas(false);
    }
  };

  useEffect(() => {
    if (transactionDetails) {
      estimateGas();
    }
  }, [selectedGasOption, transactionDetails]);

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

  const formatFeeAmount = (amount: number, currency: string): string => {
    if (amount < 0.001) {
      return `<0.001 ${currency}`;
    }
    return `${amount.toFixed(4)} ${currency}`;
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="text-xl mb-8">Confirm transaction</h2>

      {isLoading ? (
        <div className="space-y-4">
          <div className="animate-pulse h-32 bg-gray-800 rounded-lg"></div>
          <div className="animate-pulse h-48 bg-gray-800 rounded-lg"></div>
          <div className="animate-pulse h-32 bg-gray-800 rounded-lg"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Transaction Details Card */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="mb-4">Transaction Details</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-400 text-xs">From</span>
                <span className="font-mono text-xs">{walletAddress}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-xs">To</span>
                <span className="font-mono text-xs">{transactionDetails.recipient}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-xs">Network</span>
                <span className="text-xs">{transactionDetails.network}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-xs">Amount</span>
                <span className="text-xs">{transactionDetails.amount} ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-xs">Transaction Type</span>
                <span className="text-xs">Transfer</span>
              </div>
            </div>
          </div>

          {/* AI Analysis Card */}
          <div className="border border-gray-700 rounded-lg p-4">
            <h3 className="mb-4">AI Analysis</h3>
            {aiError ? (
              <div className="p-3 bg-red-900/50 border border-red-600 rounded-md text-sm">
                {aiError}
              </div>
            ) : (
              <div className="space-y-4">
                {safetyAnalysis?.safetyCheck && (
                  <>
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full ${getSafetyColor()} mr-2`}></div>
                      <span className={`${safetyAnalysis.safetyCheck.isSafe ? 
                                  'text-green-400' : 'text-yellow-400'}`}>
                        {safetyAnalysis.safetyCheck.isSafe 
                          ? 'Transaction appears safe' 
                          : 'Potential risks detected'}
                      </span>
                      {safetyAnalysis.safetyCheck.safetyScore && (
                        <span className="ml-auto text-sm flex items-center">
                          Safety Score: 
                          <span className={`ml-1 font-semibold ${getSafetyScoreColor(safetyAnalysis.safetyCheck.safetyScore)}`}>
                            {safetyAnalysis.safetyCheck.safetyScore}/100
                          </span>
                          <span className="inline-flex items-center ml-1 text-gray-400 group relative">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                            </svg>
                            <div className="absolute z-50 bottom-full right-0 mb-2 w-72 p-2 bg-gray-800 rounded-lg text-xs text-gray-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 shadow-lg">
                              <p className="font-medium mb-1">Safety Score Calculation:</p>
                              <ul className="space-y-1 list-disc pl-4">
                                <li>Calldata verification (-30 if recipient mismatch, -20 if value mismatch)</li>
                                <li>Suspicious actions (-40 if detected)</li>
                                <li>Recipient risk score (scaled impact)</li>
                                <li>Risk indicators (-7 each, max -30)</li>
                                <li>High-risk indicators (-25 each)</li>
                                <li>Contract verification (-15 if unverified)</li>
                                <li>Simulation results (-40 if failed)</li>
                                <li>Transaction warnings (-10 each, max -30)</li>
                              </ul>
                            </div>
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
                              {/* Verification result with clearer explanation */}
                              <div className="mb-2 pb-2 border-b border-gray-700 text-sm">
                                <p className={`${safetyAnalysis.safetyCheck.details?.calldataVerification?.recipientMatches && 
                                  safetyAnalysis.safetyCheck.details?.calldataVerification?.valueMatches ? 
                                  'text-green-400' : 'text-yellow-400'}`}>
                                  {safetyAnalysis.safetyCheck.details?.calldataVerification?.recipientMatches && 
                                   safetyAnalysis.safetyCheck.details?.calldataVerification?.valueMatches ? 
                                   'Transaction details verified' : 'Verification warning'}
                                </p>
                                <p className="text-xs mt-1 text-gray-400">
                                  {safetyAnalysis.safetyCheck.details?.calldataVerification?.suspiciousActions?.containsSuspiciousSignatures ? 
                                    safetyAnalysis.safetyCheck.details.calldataVerification.suspiciousActions.suspiciousDetails :
                                    'No suspicious actions detected in the transaction data.'}
                                </p>
                              </div>

                              {/* Decoded Transaction Data */}
                              <div className="mb-4 pb-2 border-b border-gray-700">
                                <p className="font-medium mb-2">Decoded Transaction Data:</p>
                                <div className="bg-gray-900 p-3 rounded">
                                  <div className="grid grid-cols-[100px_1fr] gap-1 text-xs">
                                    <span className="text-gray-400">Function:</span>
                                    <span className={safetyAnalysis.safetyCheck.details?.calldataVerification?.suspiciousActions?.containsSuspiciousSignatures ? 'text-yellow-400' : ''}>
                                      {safetyAnalysis.safetyCheck.details?.calldataVerification?.suspiciousActions?.containsSuspiciousSignatures ? 
                                        'Contract Interaction' : 'Native ETH Transfer'}
                                    </span>
                                    
                                    <span className="text-gray-400">To:</span>
                                    <div className="break-all font-mono">
                                      <span className={!safetyAnalysis.safetyCheck.details?.calldataVerification?.recipientMatches ? 'text-yellow-400' : ''}>
                                        {transactionDetails.recipient}
                                      </span>
                                    </div>
                                    
                                    <span className="text-gray-400">Value:</span>
                                    <div className="font-mono">
                                      <span className={safetyAnalysis.safetyCheck.details?.calldataVerification?.valueMatches ? 
                                        '' : 'text-yellow-400'}>
                                        {transactionDetails.amount} {transactionDetails.currency}
                                      </span>
                                    </div>
                                    
                                    <span className="text-gray-400">Data:</span>
                                    <span className="font-mono">
                                      {safetyAnalysis.safetyCheck.details?.calldataVerification?.suspiciousActions?.containsSuspiciousSignatures ? 
                                        'Contract interaction data present' : 'Empty (Standard transfer)'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Suspicious function check */}
                              <div className="mb-2">
                                <p className="font-medium mb-1">Suspicious Functions:</p>
                                <p className={!safetyAnalysis.safetyCheck.details.calldataVerification.suspiciousActions?.containsSuspiciousSignatures 
                                  ? "" : "text-red-400 font-bold"}>
                                  {safetyAnalysis.safetyCheck.details.calldataVerification.suspiciousActions?.containsSuspiciousSignatures 
                                    ? "DETECTED - POTENTIAL RISK" 
                                    : "None detected"}
                                </p>
                                {safetyAnalysis.safetyCheck.details.calldataVerification.suspiciousActions?.suspiciousDetails && (
                                  <div className="text-red-400 mt-1 p-2 bg-red-900/30 rounded border border-red-700">
                                    {safetyAnalysis.safetyCheck.details.calldataVerification.suspiciousActions.suspiciousDetails}
                                  </div>
                                )}
                              </div>
                              
                              {/* Raw calldata view (scrollable) */}
                              <div className="mt-3">
                                <p className="font-medium mb-1">Raw Calldata:</p>
                                <div className="max-h-20 overflow-y-auto bg-gray-900 p-2 rounded font-mono text-xs">
                                  {/* For a simple ETH transfer, calldata is usually just 0x */}
                                  0x
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </details>
                      
                      <details className="mb-3">
                        <summary className="font-medium text-sm cursor-pointer hover:text-violet-400">
                          Recipient Address Trust Check 
                        </summary>
                        <div className="mt-2 p-3 bg-gray-800/50 rounded-md text-xs space-y-1 text-gray-300">
                          {safetyAnalysis.safetyCheck.details?.recipientRisk && (
                            <>
                              {/* Security verdict based on malicious activities */}
                              <div className="mb-3 pb-2 border-b border-gray-700">
                                <p className={safetyAnalysis.safetyCheck.details.recipientRisk.riskIndicators?.length === 0 
                                  ? "text-green-400 font-semibold" 
                                  : "text-red-400 font-semibold"}>
                                  {safetyAnalysis.safetyCheck.details.recipientRisk.riskIndicators?.length === 0
                                    ? "No malicious activities detected"
                                    : "SECURITY RISKS DETECTED"}
                                </p>
                                <p className="text-gray-400 text-xs mt-1">
                                  Data source: {safetyAnalysis.safetyCheck.details.recipientRisk.dataSource}
                                </p>
                              </div>
                              
                              {/* Malicious activities with clear highlighting */}
                              {(safetyAnalysis.safetyCheck.details.recipientRisk.riskIndicators && 
                                safetyAnalysis.safetyCheck.details.recipientRisk.riskIndicators.length > 0) ? (
                                <div className="mt-1 p-2 bg-red-900/30 rounded border border-red-700">
                                  <p className="font-medium text-red-400 mb-1">WARNING: Malicious Activities Detected</p>
                                  <ul className="list-disc pl-5 mt-1">
                                    {safetyAnalysis.safetyCheck.details.recipientRisk.riskIndicators.map((indicator, idx) => {
                                      // Highlight critical risks (phishing, scams, etc.)
                                      const isCritical = indicator.toLowerCase().includes('phishing') || 
                                                        indicator.toLowerCase().includes('scam') ||
                                                        indicator.toLowerCase().includes('blacklist') ||
                                                        indicator.toLowerCase().includes('malicious');
                                      
                                      return (
                                        <li key={idx} className={isCritical ? "text-red-300 font-bold" : ""}>
                                          {indicator}
                                          {isCritical && " ⚠️"}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                  <p className="text-white mt-2 text-xs">
                                    DO NOT proceed if phishing or scam activities are detected!
                                  </p>
                                </div>
                              ) : (
                                <div className="text-xs text-gray-400">
                                  The recipient address has been checked against security databases and no malicious 
                                  activities like phishing, scams, or blacklists were found.
                                </div>
                              )}
                              
                              {/* Additional information */}
                              {safetyAnalysis.safetyCheck.details.recipientRisk.details && (
                                <div className="text-xs mt-3 text-gray-400">
                                  <p className="font-medium mb-1">Additional information:</p>
                                  <p>{safetyAnalysis.safetyCheck.details.recipientRisk.details}</p>
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
                              {/* Simulation summary with clear indications */}
                              <div className="mb-3 pb-2 border-b border-gray-700">
                                <p className="font-medium mb-1">Simulation Result:</p>
                                {safetyAnalysis.safetyCheck.details.simulationResults.simulated ? (
                                  <p className={safetyAnalysis.safetyCheck.details.simulationResults.success ? "text-green-400" : "text-red-400"}>
                                    {safetyAnalysis.safetyCheck.details.simulationResults.success 
                                      ? "Transaction will execute successfully" 
                                      : "Transaction would FAIL if executed"}
                                  </p>
                                ) : (
                                  <p className="text-yellow-400">
                                    Transaction could not be fully simulated
                                  </p>
                                )}
                              </div>
                              
                              {/* Detected state changes - important for security */}
                              <div className="mb-2">
                                <p className="font-medium mb-1">State Changes:</p>
                                {safetyAnalysis.safetyCheck.details.simulationResults.stateChanges !== undefined ? (
                                  <div>
                                    <p className={safetyAnalysis.safetyCheck.details.simulationResults.stateChanges > 5 
                                      ? "text-yellow-400" 
                                      : "text-gray-300"}>
                                      {safetyAnalysis.safetyCheck.details.simulationResults.stateChanges}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                      {safetyAnalysis.safetyCheck.details.simulationResults.stateChanges > 5
                                        ? "Unusually high number of state changes for a simple transfer. This could indicate complex operations."
                                        : "Expected number of state changes for this type of transaction."}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-gray-400">Information not available</p>
                                )}
                              </div>
                              
                              {/* Gas usage information */}
                              {safetyAnalysis.safetyCheck.details.simulationResults.gasUsed && (
                                <div className="flex justify-between mb-2">
                                  <span>Gas used:</span>
                                  <span className={parseInt(safetyAnalysis.safetyCheck.details.simulationResults.gasUsed) > 300000 
                                    ? "text-yellow-400" 
                                    : "text-gray-300"}>
                                    {safetyAnalysis.safetyCheck.details.simulationResults.gasUsed}
                                    {parseInt(safetyAnalysis.safetyCheck.details.simulationResults.gasUsed) > 300000 && " (high)"}
                                  </span>
                                </div>
                              )}
                              
                              {/* Simulation warnings - critical for detecting tampering */}
                              {safetyAnalysis.safetyCheck.details.simulationResults.warnings && 
                               safetyAnalysis.safetyCheck.details.simulationResults.warnings.length > 0 && (
                                <div className="mt-2">
                                  <p className="font-medium text-yellow-400 mb-1">Simulation Warnings:</p>
                                  <ul className="list-disc pl-5 mt-1 text-yellow-300">
                                    {safetyAnalysis.safetyCheck.details.simulationResults.warnings.map((warning, idx) => (
                                      <li key={idx}>{warning}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {safetyAnalysis.safetyCheck.details.simulationResults.message && (
                                <div className="text-xs mt-3 text-gray-400">
                                  <p className="font-medium mb-1">Simulation message:</p>
                                  <p>{safetyAnalysis.safetyCheck.details.simulationResults.message}</p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </details>
                      
                      <details className="mb-3">
                        <summary className="font-medium text-sm cursor-pointer hover:text-violet-400">
                          Recipient History
                        </summary>
                        <div className="mt-2 p-3 bg-gray-800/50 rounded-md text-xs space-y-1 text-gray-300">
                          {safetyAnalysis.safetyCheck.details?.etherscanData && (
                            <>
                              {/* Purpose explanation */}
                              <div className="mb-3 pb-2 border-b border-gray-700">
                                <p className="text-xs text-gray-400">
                                  This section verifies the recipient's transaction history 
                                  and trustworthiness based on Etherscan data.
                                </p>
                              </div>
                              
                              {/* Is it a contract */}
                              <div className="flex justify-between">
                                <span>Sending to a contract:</span>
                                <span className={safetyAnalysis.safetyCheck.details.etherscanData.isContract ? "text-yellow-400" : ""}>
                                  {safetyAnalysis.safetyCheck.details.etherscanData.isContract ? "Yes" : "No"}
                                </span>
                              </div>
                              
                              {/* Contract details if applicable */}
                              {safetyAnalysis.safetyCheck.details.etherscanData.isContract && (
                                <>
                                  <div className="flex justify-between">
                                    <span>Contract name:</span>
                                    <span>{safetyAnalysis.safetyCheck.details.etherscanData.contractName || "Unnamed"}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Verified contract:</span>
                                    <span className={safetyAnalysis.safetyCheck.details.etherscanData.isVerified ? "" : "text-yellow-400"}>
                                      {safetyAnalysis.safetyCheck.details.etherscanData.isVerified ? "Yes" : "No"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Deployment date:</span>
                                    <span className={safetyAnalysis.safetyCheck.details.etherscanData.deploymentDate === 'N/A' ? "" :
                                      new Date(safetyAnalysis.safetyCheck.details.etherscanData.deploymentDate).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000 
                                      ? "text-yellow-400" : ""}>
                                      {safetyAnalysis.safetyCheck.details.etherscanData.deploymentDate}
                                      {safetyAnalysis.safetyCheck.details.etherscanData.deploymentDate !== 'N/A' &&
                                       new Date(safetyAnalysis.safetyCheck.details.etherscanData.deploymentDate).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000 
                                       && " (New)"}
                                    </span>
                                  </div>
                                  
                                  {!safetyAnalysis.safetyCheck.details.etherscanData.isVerified && (
                                    <div className="text-yellow-400 text-xs mt-2 p-2 bg-yellow-900/30 rounded border border-yellow-700">
                                      Warning: This contract's source code is not verified on Etherscan. 
                                      This makes it impossible to audit what the contract actually does.
                                    </div>
                                  )}
                                </>
                              )}
                              
                              {/* Transaction activity */}
                              <div className="mt-2 pt-2 border-t border-gray-700">
                                <div className="flex justify-between">
                                  <span>Transaction history:</span>
                                  <span className={Number(safetyAnalysis.safetyCheck.details.etherscanData.transactionVolume) < 5 ? "text-yellow-400" : ""}>
                                    {safetyAnalysis.safetyCheck.details.etherscanData.transactionVolume} transactions
                                    {Number(safetyAnalysis.safetyCheck.details.etherscanData.transactionVolume) < 5 && " (Limited history)"}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Recent activity:</span>
                                  <span>{safetyAnalysis.safetyCheck.details.etherscanData.hasRecentActivity ? "Yes" : "No"}</span>
                                </div>
                              </div>
                              
                              {/* Etherscan warnings */}
                              {safetyAnalysis.safetyCheck.details.etherscanData.warnings && 
                               safetyAnalysis.safetyCheck.details.etherscanData.warnings.length > 0 && (
                                <div className="mt-2 p-2 bg-yellow-900/30 rounded border border-yellow-700">
                                  <p className="font-medium text-yellow-400 mb-1">History Warnings:</p>
                                  <ul className="list-disc pl-5 mt-1 text-yellow-300">
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
            <div className='mb-4'>
              <span className="">Gas options</span>
              <span className="text-sm text-gray-400 ml-2">(Choose a token type for gas fees)</span>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="flex items-center space-x-2 text-sm">
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
              </div>
              
              <div>
                <label className="flex items-center space-x-2 text-sm">
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
              </div>

              {/* Gas Speed Options */}
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  {gasError && (
                    <p className="text-xs text-red-400">{gasError}</p>
                  )}
                </div>
                <div className="p-3 bg-gray-800/50 rounded-lg">
                  {isLoadingGas ? (
                    <div className="animate-pulse">
                      <div className="h-4 bg-gray-700 rounded w-1/4 mb-2"></div>
                      <div className="h-3 bg-gray-700 rounded w-1/3"></div>
                    </div>
                  ) : gasEstimate ? (
                    <div className="text-sm">
                      <div className="flex justify-between items-center">
                        <span>Estimated Gas Fee</span>
                        <div>
                          <span className='mr-2'>{formatFeeAmount(gasEstimate.feeAmount, gasEstimate.feeCurrency)}</span>
                          <span className="text-gray-400">{gasEstimate.estimatedCostUSD < 0.001 ? '(<$0.001)' : `($${gasEstimate.estimatedCostUSD.toFixed(4)})`}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Transaction will complete in a few seconds</p>
                    </div>
                  ) : null}
                </div>
                <p className="text-xs text-gray-400 mt-2">* Estimated fee based on current network conditions</p>
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