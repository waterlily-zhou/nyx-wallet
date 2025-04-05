'use client';

import { useState, useEffect } from 'react';
import { parseEther, formatEther } from 'viem';
import TransactionFlow from './TransactionFlow';

interface Asset {
  type: 'native' | 'erc20';
  symbol: string;
  name: string;
  balance: string;
  formattedBalance: string;
  decimals: number;
  network: string;
  networkId: number;
  logoURI?: string;
  priceUSD: number;
  valueUSD: string;
  address?: string;
}

interface DashboardContentProps {
  walletAddress: string;
}

export default function DashboardContent({ walletAddress }: DashboardContentProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [totalValueUSD, setTotalValueUSD] = useState("0.00");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showTransactionFlow, setShowTransactionFlow] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  
  useEffect(() => {
    if (walletAddress) {
      fetchTokenBalances(walletAddress);
      fetchNetworkInfo();
    }
  }, [walletAddress]);

  const fetchTokenBalances = async (address: string) => {
    try {
      setIsRefreshing(true);
      const response = await fetch(`/api/wallet/tokens?address=${address}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch token balances');
      }
      
      const data = await response.json();
      if (data.success) {
        console.log('Received asset data:', data.assets);
        setAssets(data.assets || []);
        setTotalValueUSD(data.totalValueUSD || "0.00");
      }
    } catch (err) {
      console.error('Error fetching token balances:', err);
      // If the token API fails, fall back to the basic ETH balance API
      fetchBalance(address);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  const fetchBalance = async (address: string) => {
    try {
      const response = await fetch(`/api/wallet/balance?address=${address}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch balance');
      }
      
      const data = await response.json();
      if (data.success && data.balance) {
        // Create a minimal asset array with just ETH
        const ethBalance = data.balance;
        const formattedBalance = formatEther(BigInt(ethBalance));
        const ethPriceUSD = 3150; // Fallback price
        const valueUSD = (parseFloat(formattedBalance) * ethPriceUSD).toFixed(2);
        
        setAssets([{
          type: 'native',
          symbol: 'ETH',
          name: 'Ethereum',
          balance: ethBalance,
          formattedBalance,
          decimals: 18,
          network: 'Base Sepolia',
          networkId: 84532,
          priceUSD: ethPriceUSD,
          valueUSD
        }]);
        
        setTotalValueUSD(valueUSD);
      }
    } catch (err) {
      console.error('Error fetching balance:', err);
      // Set empty states if all fetching fails
      setAssets([]);
      setTotalValueUSD("0.00");
    }
  };
  
  const refreshBalance = () => {
    if (walletAddress) {
      fetchTokenBalances(walletAddress);
    }
  };
  
  const handleSendClick = () => {
    setShowTransactionFlow(true);
  };

  const handleCloseTransactionFlow = () => {
    setShowTransactionFlow(false);
    // Refresh balance after transaction flow is closed
    refreshBalance();
  };
  
  const fetchNetworkInfo = async () => {
    try {
      const response = await fetch('/api/debug/network');
      if (response.ok) {
        const data = await response.json();
        setNetworkInfo(data.network);
      }
    } catch (err) {
      console.error('Error fetching network info:', err);
    }
  };
  
  return (
    <div className="flex-1 overflow-auto p-8">
      {/* Wallet Overview */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl">Dashboard</h1>
          <button 
            onClick={refreshBalance}
            disabled={isRefreshing}
            className="text-violet-400 hover:text-violet-300 px-3 py-1 rounded-md border border-violet-500 flex items-center text-sm"
          >
            {isRefreshing ? (
              <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            )}
            Refresh
          </button>
        </div>
        
        <div className="flex flex-row gap-16 rounded-lg p-6">
          <div className="mb-6">
            <p className="text-gray-500 text-sm mb-1">Total asset value</p>
            <div className="flex items-end">
              <h2 className="text-4xl mr-2">${totalValueUSD}</h2>
              <p className="text-gray-400 text-sm mb-1">USD</p>
            </div>
          </div>
          
          <div className="flex flex-row gap-8 ml-auto px-16">
            <button 
              className="px-6 py-1.5 h-12 w-32 bg-violet-500 rounded-lg text-white hover:bg-violet-700 flex items-center"
              onClick={handleSendClick}
            >
              <span className="mr-2">↗</span>
              Send
            </button>
            <button className="px-6 py-1.5 h-12 w-32 border border-violet-500 rounded-lg bg-transparent text-white hover:bg-violet-700/20 flex items-center">
              <span className="mr-2">⇲</span>
              Receive
            </button>
          </div>
        </div>
      </div>
      
      {/* Assets List */}
      <div>
        <h2 className="text-xl font-bold mb-4">Assets</h2>
        <div className="bg-zinc-900 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Asset</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {assets.length > 0 ? (
                  assets.map((asset, index) => (
                    <tr key={asset.symbol + index} className="hover:bg-zinc-800">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {asset.logoURI ? (
                            <img 
                              src={asset.logoURI} 
                              alt={asset.symbol}
                              className="flex-shrink-0 h-8 w-8 rounded-full"
                            />
                          ) : (
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                              {asset.symbol.substring(0, 4)}
                            </div>
                          )}
                          <div className="ml-4">
                            <div className="text-sm font-medium">{asset.name}</div>
                            <div className="flex items-center mt-1">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900 text-green-200">
                                {asset.network === 'Base Sepolia' ? 'Base Sepolia' : asset.network}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {parseFloat(asset.formattedBalance) < 0.000001 && parseFloat(asset.formattedBalance) > 0
                          ? '< 0.000001'
                          : asset.formattedBalance} {asset.symbol}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        ${parseFloat(asset.valueUSD) < 0.01 ? '< 0.01' : parseFloat(asset.valueUSD).toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : isRefreshing ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-gray-400">
                      <div className="flex justify-center mb-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500"></div>
                      </div>
                      <p>Loading assets...</p>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-gray-400">
                      No assets found for this wallet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Debug section - only for development */}
      <div className="mt-8 p-4 border border-gray-700 rounded-lg">
        <h3 className="text-lg font-bold mb-2">Debug Information</h3>
        <div className="space-y-2 text-sm">
          <p><span className="text-gray-400">Wallet Address:</span> {walletAddress}</p>
          <p><span className="text-gray-400">Network:</span> Base Sepolia (Chain ID: 84532)</p>
          <p><span className="text-gray-400">Asset Count:</span> {assets.length}</p>
          <p><span className="text-gray-400">API Response:</span> {isRefreshing ? 'Loading...' : 'Complete'}</p>
          {networkInfo && (
            <div>
              <p className="text-gray-400 mb-1">Network Info:</p>
              <pre className="bg-gray-800 p-2 rounded overflow-auto text-xs">
                {JSON.stringify(networkInfo, null, 2)}
              </pre>
            </div>
          )}
          <div>
            <p className="text-gray-400 mb-1">Asset Details:</p>
            <pre className="bg-gray-800 p-2 rounded overflow-auto text-xs">
              {JSON.stringify(assets, null, 2)}
            </pre>
          </div>
        </div>
      </div>
      
      {/* Transaction Flow Modal */}
      {showTransactionFlow && (
        <TransactionFlow 
          walletAddress={walletAddress}
          onClose={handleCloseTransactionFlow}
        />
      )}
    </div>
  );
} 