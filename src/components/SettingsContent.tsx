'use client';

import { useState } from 'react';

interface SettingsContentProps {
  walletAddress: string;
}

export default function SettingsContent({ walletAddress }: SettingsContentProps) {
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecoveryKey = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/wallet/recovery-key', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch recovery key');
      }
      
      const data = await response.json();
      if (data.success && data.recoveryKey) {
        setRecoveryKey(data.recoveryKey);
        setShowRecoveryKey(true);
      } else {
        throw new Error(data.error || 'Failed to fetch recovery key');
      }
    } catch (err) {
      console.error('Error fetching recovery key:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch recovery key');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      
      <div className="bg-zinc-900 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Account Security</h2>
        
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2">Wallet Recovery Key</h3>
          <p className="text-gray-400 mb-4">Your recovery key can be used to restore your wallet if you lose access to your device.</p>
          
          {error && (
            <div className="mb-4 bg-red-900/50 border border-red-600 text-red-100 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          {showRecoveryKey && recoveryKey ? (
            <div>
              <div className="bg-gray-800 p-4 rounded-lg font-mono text-sm break-all text-gray-200 mb-3">
                {recoveryKey}
              </div>
              <p className="text-amber-500 text-sm mb-3">
                <svg className="inline-block w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
                Store this key in a secure location. It will only be shown once.
              </p>
              <button 
                onClick={() => setShowRecoveryKey(false)} 
                className="text-violet-400 hover:text-violet-300 text-sm"
              >
                Hide
              </button>
            </div>
          ) : (
            <button
              onClick={fetchRecoveryKey}
              disabled={isLoading}
              className="px-4 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 focus:outline-none disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading...
                </span>
              ) : (
                'Show Recovery Key'
              )}
            </button>
          )}
        </div>
      </div>
      
      <div className="bg-zinc-900 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Network Settings</h2>
        
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2">Current Network</h3>
          <div className="p-3 rounded-md bg-gray-800">
            <div className="flex items-center mb-1">
              <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
              <span className="font-medium">Base Sepolia</span>
            </div>
            <p className="text-gray-400 text-sm">Testnet</p>
          </div>
        </div>
        
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2">RPC Configuration</h3>
          <p className="text-gray-400 mb-2">Customize your blockchain connection endpoint</p>
          
          <div className="flex">
            <input 
              type="text" 
              disabled
              value="https://sepolia.base.org" 
              className="flex-1 px-3 py-2 bg-gray-800 text-white rounded-l-md border border-gray-700 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500" 
            />
            <button className="px-4 py-2 bg-gray-700 text-gray-300 rounded-r-md hover:bg-gray-600 disabled:opacity-50" disabled>
              Update
            </button>
          </div>
          <p className="text-gray-500 text-xs mt-1">Custom RPC configuration not available on testnet</p>
        </div>
      </div>
    </div>
  );
} 