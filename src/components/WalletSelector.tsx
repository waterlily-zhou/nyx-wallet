'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Wallet interface for the component
interface WalletItem {
  address: string;
  name: string;
  chainId: number;
  isDefault: boolean;
  createdAt: number;
}

export default function WalletSelector() {
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [currentWallet, setCurrentWallet] = useState<WalletItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewWalletForm, setShowNewWalletForm] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');

  // Fetch wallets on component mount
  useEffect(() => {
    fetchWallets();
  }, []);

  // Fetch user's wallets
  const fetchWallets = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/wallet/list');
      
      if (!response.ok) {
        throw new Error('Failed to fetch wallets');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setWallets(data.wallets);
        
        // Set current wallet as the default one
        const defaultWallet = data.wallets.find((w: WalletItem) => w.isDefault);
        setCurrentWallet(defaultWallet || (data.wallets.length > 0 ? data.wallets[0] : null));
      } else {
        throw new Error(data.error || 'Failed to fetch wallets');
      }
    } catch (err) {
      console.error('Error fetching wallets:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch wallets');
    } finally {
      setIsLoading(false);
    }
  };

  // Switch to a different wallet
  const switchWallet = async (walletAddress: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/wallet/switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to switch wallets');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Update current wallet
        setCurrentWallet(data.wallet);
        
        // Update wallets list to reflect the new default
        setWallets(prevWallets => 
          prevWallets.map(wallet => ({
            ...wallet,
            isDefault: wallet.address === walletAddress
          }))
        );
        
        // Refresh the page to load the new wallet
        router.refresh();
      } else {
        throw new Error(data.error || 'Failed to switch wallets');
      }
    } catch (err) {
      console.error('Error switching wallets:', err);
      setError(err instanceof Error ? err.message : 'Failed to switch wallets');
    } finally {
      setIsLoading(false);
    }
  };

  // Create a new wallet
  const createNewWallet = async () => {
    try {
      setIsCreating(true);
      setError(null);
      
      const response = await fetch('/api/wallet/create-additional', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newWalletName || undefined
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create new wallet');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Add new wallet to list
        setWallets(prevWallets => [
          ...prevWallets.map(w => ({ ...w, isDefault: false })),
          { ...data.wallet, isDefault: true }
        ]);
        
        // Set as current wallet
        setCurrentWallet(data.wallet);
        
        // Reset form
        setNewWalletName('');
        setShowNewWalletForm(false);
        
        // Refresh the page to load the new wallet
        router.refresh();
      } else {
        throw new Error(data.error || 'Failed to create new wallet');
      }
    } catch (err) {
      console.error('Error creating wallet:', err);
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setIsCreating(false);
    }
  };

  // Format wallet address for display
  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Format chain name
  const getChainName = (chainId: number) => {
    switch (chainId) {
      case 11155111:
        return 'Sepolia';
      case 1:
        return 'Ethereum';
      case 137:
        return 'Polygon';
      case 42161:
        return 'Arbitrum';
      default:
        return `Chain ${chainId}`;
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-6">
      <h2 className="text-xl font-bold text-white mb-4">My Wallets</h2>
      
      {error && (
        <div className="bg-red-500 text-white p-2 rounded mb-4">
          {error}
        </div>
      )}
      
      {/* Current Wallet */}
      {currentWallet && (
        <div className="bg-gray-700 rounded p-3 mb-4">
          <div className="text-gray-400 text-sm">Current Wallet:</div>
          <div className="font-bold text-white">{currentWallet.name}</div>
          <div className="text-gray-300 text-sm">{formatAddress(currentWallet.address)}</div>
          <div className="text-gray-400 text-xs mt-1">{getChainName(currentWallet.chainId)}</div>
        </div>
      )}
      
      {/* Wallet List */}
      {wallets.length > 0 ? (
        <div className="space-y-2 mb-4">
          <h3 className="text-gray-300 text-sm font-semibold">Switch Wallet:</h3>
          {wallets.map(wallet => (
            <div 
              key={wallet.address}
              className={`p-2 rounded cursor-pointer flex justify-between items-center ${
                wallet.isDefault 
                  ? 'bg-blue-900 text-white' 
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
              onClick={() => !wallet.isDefault && switchWallet(wallet.address)}
            >
              <div>
                <div className="font-medium">{wallet.name}</div>
                <div className="text-xs opacity-80">{formatAddress(wallet.address)}</div>
              </div>
              <div className="text-xs opacity-70">
                {getChainName(wallet.chainId)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !isLoading && (
          <div className="text-gray-300 text-center py-2">
            No wallets found
          </div>
        )
      )}
      
      {/* Create New Wallet Button */}
      {!showNewWalletForm ? (
        <button
          onClick={() => setShowNewWalletForm(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
          disabled={isLoading || isCreating}
        >
          Create New Wallet
        </button>
      ) : (
        <div className="bg-gray-700 p-3 rounded">
          <h3 className="text-white text-sm font-semibold mb-2">Create New Wallet</h3>
          <input
            type="text"
            value={newWalletName}
            onChange={(e) => setNewWalletName(e.target.value)}
            placeholder="Wallet Name (optional)"
            className="w-full p-2 mb-2 rounded bg-gray-800 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
          <div className="flex space-x-2">
            <button
              onClick={createNewWallet}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded"
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowNewWalletForm(false)}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded"
              disabled={isCreating}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 