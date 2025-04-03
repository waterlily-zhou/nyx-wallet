'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { parseEther, formatEther, Address } from 'viem';

interface WalletInfo {
  address: string;
  ethBalance: string;
  chain: {
    name: string;
    id: number;
  };
}

interface TransactionFormData {
  to: string;
  amount: string;
  message?: string;
  gasPaymentMethod: 'default' | 'sponsored' | 'usdc' | 'bundler';
}

export default function WalletDashboard() {
  const router = useRouter();
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<TransactionFormData>({
    to: '',
    amount: '',
    message: '',
    gasPaymentMethod: 'default'
  });

  useEffect(() => {
    fetchWalletInfo();
  }, []);

  const fetchWalletInfo = async () => {
    try {
      const response = await fetch('/api/wallet/check', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch wallet info');
      }

      const data = await response.json();
      
      // Extract data from the wallet check endpoint
      if (data.walletAddress) {
        setWalletInfo({
          address: data.walletAddress,
          ethBalance: "0", // We'll need to implement getting the balance
          chain: {
            name: "Base Sepolia",
            id: 84532
          }
        });
      } else {
        throw new Error('No wallet found');
      }
    } catch (err) {
      console.error('Error fetching wallet info:', err);
      setError('Failed to load wallet information');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // First, get the transaction calldata
      const calldataResponse = await fetch('/api/get-calldata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fromAddress: walletInfo?.address,
          toAddress: formData.to,
          amount: formData.amount,
          currency: 'eth',
          message: formData.message,
          gasPaymentMethod: formData.gasPaymentMethod
        })
      });

      const calldataResult = await calldataResponse.json();
      if (!calldataResult.success) {
        throw new Error(calldataResult.error || 'Failed to prepare transaction');
      }

      // Check transaction safety
      const safetyResponse = await fetch('/api/check-transaction-safety', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: formData.to,
          value: formData.amount,
          data: calldataResult.calldata
        })
      });

      const safetyResult = await safetyResponse.json();
      if (!safetyResult.success) {
        throw new Error(safetyResult.error || 'Failed to check transaction safety');
      }

      // If there are warnings, confirm with user
      if (safetyResult.safetyCheck.warnings?.length > 0) {
        const proceed = window.confirm(
          'Warning: ' + safetyResult.safetyCheck.warnings.join('\n\n') + 
          '\n\nDo you want to proceed with the transaction?'
        );
        if (!proceed) {
          setIsLoading(false);
          return;
        }
      }

      // Send the transaction
      const sendResponse = await fetch('/api/transaction/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: formData.to,
          amount: formData.amount,
          currency: 'eth',
          message: formData.message,
          gasPaymentMethod: formData.gasPaymentMethod
        })
      });

      const sendResult = await sendResponse.json();
      if (!sendResult.success) {
        throw new Error(sendResult.error || 'Failed to send transaction');
      }

      // Clear form and show success
      setFormData({
        to: '',
        amount: '',
        message: '',
        gasPaymentMethod: 'default'
      });

      // Open transaction in explorer
      if (sendResult.explorerUrl) {
        window.open(sendResult.explorerUrl, '_blank');
      }

      // Refresh wallet info
      fetchWalletInfo();
    } catch (err) {
      console.error('Transaction error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send transaction');
    } finally {
      setIsLoading(false);
    }
  };

  if (!walletInfo) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-3 mt-4">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <h1 className="text-2xl font-bold mb-4">Wallet Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Wallet Address</p>
            <p className="font-mono text-sm">{walletInfo.address}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Balance</p>
            <p className="font-mono text-sm">{formatEther(BigInt(walletInfo.ethBalance))} ETH</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Network</p>
            <p className="font-mono text-sm">{walletInfo.chain.name}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Send Transaction</h2>
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                To Address
                <input
                  type="text"
                  name="to"
                  value={formData.to}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="0x..."
                  required
                />
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Amount (ETH)
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="0.0"
                  step="any"
                  required
                />
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Message (Optional)
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter a message..."
                  rows={2}
                />
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Gas Payment Method
                <select
                  name="gasPaymentMethod"
                  value={formData.gasPaymentMethod}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="default">Default (ETH)</option>
                  <option value="sponsored">Sponsored</option>
                  <option value="usdc">USDC</option>
                  <option value="bundler">Bundler</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </span>
              ) : (
                'Send Transaction'
              )}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Network Information</h2>
          <div className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">Chain ID:</span> {walletInfo.chain.id}
            </p>
            <p className="text-sm">
              <span className="font-medium">Network:</span> {walletInfo.chain.name}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 