'use client';

import { useState, useEffect } from 'react';
import { parseEther, formatEther } from 'viem';
import { useTransaction } from '@/contexts/TransactionContext';

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
  
  // Add transaction context
  const { transactionInProgress, setTransactionDetails, goToStep } = useTransaction();

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const response = await fetch(`/api/wallet/balance?address=${walletAddress}`, {
          headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.balance) {
            // Convert wei to ETH using viem's formatEther
            const balanceInEth = formatEther(BigInt(data.balance));
            console.log('Form: Balance fetched', {
              rawBalance: data.balance,
              balanceInEth,
              balanceInWei: BigInt(data.balance).toString()
            });
            setMaxAmount(balanceInEth);
          }
        }
      } catch (err) {
        console.error('Error fetching balance:', err);
      }
    };

    fetchBalance();
  }, [walletAddress]);

  const handleSetMax = () => {
    console.log('Form: Setting max amount', {
      maxAmount,
      maxAmountInWei: parseEther(maxAmount).toString()
    });
    setAmount(maxAmount);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if a transaction is already in progress
    if (transactionInProgress) {
      setError('A transaction is already in progress. Please wait.');
      return;
    }
    
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

    // Add validation for maximum amount
    const MAX_AMOUNT = 1000000; // 1 million ETH as a reasonable upper limit
    if (parseFloat(amount) > MAX_AMOUNT) {
      setError(`Amount cannot exceed ${MAX_AMOUNT.toLocaleString()} ETH`);
      return;
    }
    
    // Ensure the amount is a valid number with at most 18 decimal places
    const cleanAmount = amount.replace(/[^\d.]/g, '');
    const parts = cleanAmount.split('.');
    const wholeNumber = parts[0];
    const decimals = parts[1]?.slice(0, 18) || '';
    const formattedAmount = `${wholeNumber}${decimals ? '.' + decimals : ''}`;
    
    // Log the comparison values
    console.log('Form: Amount validation', {
      originalAmount: amount,
      cleanAmount,
      formattedAmount,
      maxAmount,
      maxAmountFloat: parseFloat(maxAmount),
      amountInWei: parseEther(formattedAmount).toString(),
      maxAmountInWei: parseEther(maxAmount).toString(),
      comparison: {
        usingFloat: parseFloat(formattedAmount) > parseFloat(maxAmount),
        usingWei: parseEther(formattedAmount) > parseEther(maxAmount)
      }
    });
    
    if (parseFloat(formattedAmount) > parseFloat(maxAmount)) {
      setError('Amount exceeds your balance');
      return;
    }

    // After validations, but before creating the formData object
    console.log('Form validation passed, proceeding to create transaction');

    // Create form data object
    const formData = {
      recipient,
      amount: formattedAmount,
      network
    };
    
    // Update transaction details in context
    setTransactionDetails(formData);
    console.log('Transaction details updated in context', formData);

    // Call the callback from parent
    console.log('Calling onNext callback');
    onNext(formData);
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="text-xl mb-8">Create a transaction</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Network Selection */}
        <div>
          <div className="relative border border-gray-700 rounded-lg">
             <p className="absolute -top-2.5 left-2 text-sm text-gray-400 px-1 bg-zinc-900">
              Network
            </p>
            <div className="flex items-center p-4">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-xs mr-3">
                Base
              </div>
              <div className="flex-1">
                <div className="text-gray-100">{network}</div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>
        </div>
        
        {/* Recipient Address */}
        <div>
          <div className="relative border border-gray-700 rounded-lg">
            <p className="absolute -top-2.5 left-2 text-sm text-gray-400 px-1 bg-zinc-900">
            Recipient Address or ENS
            </p>
            <div className="flex items-center p-4">
              <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-xs mr-3">
                Base
              </div>
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
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
          <div className="relative border border-gray-700 rounded-lg flex items-center">
          <p className="absolute -top-2.5 left-2 text-sm text-gray-400 px-1 bg-zinc-900">
            Amount
            </p>
            <input
              id="amount"
              type="text"
              inputMode="decimal"
              pattern="^[0-9]*[.]?[0-9]*$"
              min="0"
              max="1000000"
              value={amount}
              onChange={(e) => {
                // Only allow numbers and a single decimal point
                const value = e.target.value;
                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                  setAmount(value);
                }
              }}
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
          disabled={isLoading || transactionInProgress}
          className="w-full py-3 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : (transactionInProgress ? 'Transaction in progress...' : 'Next')}
        </button>
      </form>
    </div>
  );
} 