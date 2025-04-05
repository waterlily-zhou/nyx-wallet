'use client';

import { useState, useEffect } from 'react';
import { parseEther } from 'viem';

interface TransactionFormProps {
  walletAddress: string;
  onNext: (formData: { 
    recipient: string;
    amount: string;
    network: string;
  }) => void;
}

export default function TransactionForm({ walletAddress, onNext }: TransactionFormProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('0');
  const [network, setNetwork] = useState('Base Sepolia');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const response = await fetch(`/api/wallet/balance?address=${walletAddress}`, {
          headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.balance) {
            // Convert wei to ETH for display
            const balanceInEth = parseFloat(data.balance) / 1e18;
            setMaxAmount(balanceInEth.toFixed(8));
          }
        }
      } catch (err) {
        console.error('Error fetching balance:', err);
      }
    };

    fetchBalance();
  }, [walletAddress]);

  const handleSetMax = () => {
    setAmount(maxAmount);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!recipient.trim()) {
      setError('Recipient address is required');
      return;
    }
    
    if (!recipient.startsWith('0x') || recipient.length !== 42) {
      setError('Invalid recipient address format');
      return;
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      setError('Amount must be greater than 0');
      return;
    }
    
    if (parseFloat(amount) > parseFloat(maxAmount)) {
      setError('Amount exceeds your balance');
      return;
    }

    onNext({
      recipient,
      amount,
      network
    });
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="text-3xl font-bold mb-8">Send Tokens</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Network Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Network</label>
          <div className="relative border border-gray-700 rounded-lg">
            <div className="flex items-center p-4">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold mr-3">
                ETH
              </div>
              <div className="flex-1">
                <div className="font-medium">{network}</div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>
        </div>
        
        {/* Recipient Address */}
        <div>
          <label htmlFor="recipient" className="block text-sm font-medium mb-2">
            Recipient Address or ENS
          </label>
          <div className="relative border border-gray-700 rounded-lg">
            <div className="flex items-center p-4">
              <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-xs font-mono mr-3">
                Base:
              </div>
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x... (Base Sepolia address)"
                className="flex-1 bg-transparent border-none focus:outline-none"
              />
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>
        </div>
        
        {/* Amount */}
        <div>
          <label htmlFor="amount" className="block text-sm font-medium mb-2">
            Amount
          </label>
          <div className="border border-gray-700 rounded-lg flex items-center">
            <input
              id="amount"
              type="number"
              step="0.000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="flex-1 p-4 bg-transparent border-none focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSetMax}
              className="px-3 py-1 mx-2 text-sm text-violet-400 bg-violet-900/50 rounded"
            >
              MAX
            </button>
            <div className="flex items-center p-4 border-l border-gray-700">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold mr-2">
                ETH
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>
          <div className="text-sm text-gray-400 mt-1">
            Balance: {maxAmount} ETH
          </div>
        </div>
        
        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-900/50 border border-red-600 rounded-md text-sm text-red-200">
            {error}
          </div>
        )}
        
        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : 'Next'}
        </button>
      </form>
    </div>
  );
} 