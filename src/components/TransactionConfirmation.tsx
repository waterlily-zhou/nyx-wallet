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
        
        // 1. First check the transaction safety
        const safetyResponse = await fetch('/api/check-transaction-safety', {
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
        setSafetyAnalysis(safetyResult);
      } catch (err) {
        console.error('Error checking transaction safety:', err);
        setError(err instanceof Error ? err.message : 'Failed to analyze transaction');
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
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full ${getSafetyColor()} mr-2`}></div>
                  <span className="font-medium">
                    {safetyAnalysis?.safetyCheck.isSafe ? 'Transaction appears safe' : 'Potential risks detected'}
                  </span>
                </div>

                {safetyAnalysis?.safetyCheck.warnings && safetyAnalysis.safetyCheck.warnings.length > 0 && (
                  <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-md text-sm">
                    <p className="font-medium mb-1">Warnings:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {safetyAnalysis.safetyCheck.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {safetyAnalysis?.safetyCheck.safetyAnalysis && (
                  <div className="text-sm text-gray-300">
                    {safetyAnalysis.safetyCheck.safetyAnalysis}
                  </div>
                )}

                {safetyAnalysis?.safetyCheck.recommendations && safetyAnalysis.safetyCheck.recommendations.length > 0 && (
                  <div className="text-sm">
                    <p className="font-medium mb-1">Recommendations:</p>
                    <ul className="list-disc pl-5 space-y-1 text-gray-300">
                      {safetyAnalysis.safetyCheck.recommendations.map((rec, index) => (
                        <li key={index}>{rec}</li>
                      ))}
                    </ul>
                  </div>
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