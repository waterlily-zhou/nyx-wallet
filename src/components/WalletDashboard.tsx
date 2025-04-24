'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { parseEther, formatEther, Address } from 'viem';
import DashboardSidebar from './DashboardSidebar';
import DashboardContent from './DashboardContent';
import AddressBookContent from './AddressBookContent';
import TransactionsContent from './TransactionsContent';
import SettingsContent from './SettingsContent';
import { TransactionProvider } from '@/contexts/TransactionContext';

interface WalletInfo {
  address: Address;
  userId: string;
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

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  status: 'confirmed' | 'pending' | 'failed';
}

export default function WalletDashboard() {
  const router = useRouter();
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');

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
          address: data.walletAddress as Address,
          userId: data.userId,
          ethBalance: "0", // We'll set this in the individual components
          chain: {
            name: "Base Sepolia",
            id: 84532
          }
        });
      } else {
        throw new Error('No wallet or user ID found');
      }
    } catch (err) {
      console.error('Error fetching wallet info:', err);
      setError('Failed to load wallet information');
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  if (!walletInfo) {
    return (
      <TransactionProvider>
        <div className="flex h-screen bg-black text-white">
          {/* Sidebar skeleton */}
          <div className="w-64 border-r border-gray-800 p-4">
            <div className="animate-pulse">
              <div className="h-6 bg-gray-700 rounded w-3/4 mb-4"></div>
              <div className="h-12 bg-gray-700 rounded-full w-12 mb-4"></div>
              <div className="h-4 bg-gray-700 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-5/6 mb-8"></div>
              <div className="h-4 bg-gray-700 rounded w-1/2 mb-4"></div>
              <div className="h-4 bg-gray-700 rounded w-1/2 mb-4"></div>
              <div className="h-4 bg-gray-700 rounded w-1/2 mb-4"></div>
            </div>
          </div>
          
          {/* Main content skeleton */}
          <div className="flex-1 p-8">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-700 rounded w-1/4 mb-6"></div>
              <div className="h-12 bg-gray-700 rounded w-1/3 mb-8"></div>
            </div>
          </div>
        </div>
      </TransactionProvider>
    );
  }

  return (
    <TransactionProvider>
      <div className="flex h-screen bg-black text-white">
        {/* Sidebar */}
        <DashboardSidebar 
          walletAddress={walletInfo.address}
          userId={walletInfo.userId}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
        
        {/* Main content area */}
        {activeTab === 'dashboard' && (
          <DashboardContent walletAddress={walletInfo.address} />
        )}
        
        {activeTab === 'address-book' && (
          <AddressBookContent walletAddress={walletInfo.address} />
        )}
        
        {activeTab === 'transactions' && (
          <TransactionsContent walletAddress={walletInfo.address} />
        )}
        
        {activeTab === 'settings' && (
          <SettingsContent walletAddress={walletInfo.address} />
        )}
      </div>
    </TransactionProvider>
  );
} 