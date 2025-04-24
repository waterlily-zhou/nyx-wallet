'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { checkSmartAccountDeployed, handleDeploymentBeforeTransaction } from '@/lib/wallet/deploy';
import { type Address } from 'viem';

interface DashboardSidebarProps {
  walletAddress: Address;
  userId: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function DashboardSidebar({ 
  walletAddress, 
  userId,
  activeTab,
  onTabChange 
}: DashboardSidebarProps) {
  
  const shortenAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const handleTabClick = (tab: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    onTabChange(tab);
  };

  const [isDeployed, setIsDeployed] = useState<boolean>(true); // Default to true to avoid flash
  const [isDeploying, setIsDeploying] = useState<boolean>(false);

  // Add useEffect to check deployment status
  useEffect(() => {
    if (!walletAddress) return;
    
    const checkDeployment = async () => {
      const deployed = await checkSmartAccountDeployed(walletAddress);
      setIsDeployed(deployed);
    };
    
    checkDeployment();
  }, [walletAddress]);

  return (
    <div className="w-64 border-r border-gray-800 flex flex-col">
      
      {/* Wallet info */}

      <div className="p-4 flex flex-col border-b border-gray-800">
        <div className='flex flex-row gap-2 items-center'>
          <div className="flex flex-row  gap-2 items-center">
            <div className="w-12 h-12 bg-violet-600 rounded-full flex items-center justify-center text-xs font-mono">
              {walletAddress.substring(0, 4)}
            </div>
          </div>
          <div className="mt-2 font-mono text-xs break-all">
            {walletAddress}
           </div>
        </div>
        <div className="flex flex-row justify-around mr-auto gap-4 pt-2">
          <button className="p-1 hover:bg-gray-700 rounded">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
            </svg>
          </button>
          <button 
            className="p-1 hover:bg-gray-700 rounded"
            onClick={() => {
              navigator.clipboard.writeText(walletAddress)
                .then(() => {
                  // You could add a toast notification here
                  alert('Wallet address copied to clipboard');
                })
                .catch(err => {
                  console.error('Failed to copy wallet address: ', err);
                });
            }}
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
          </button>
          <button 
            className="p-1 hover:bg-gray-700 rounded"
            onClick={() => window.open(`https://sepolia.etherscan.io/address/${walletAddress}`, '_blank')}
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
          </button>
        </div>
        {!isDeployed && <button 
          className={`border border-violet-500 text-white rounded-md p-2 mt-2 mx-2 text-xs transition ${
            isDeploying ? 'opacity-50 cursor-not-allowed' : 'hover:bg-violet-500/20'
          }`}
          onClick={async () => {
            if (isDeploying || !userId || !walletAddress) return;
            
            try {
              setIsDeploying(true);
              const success = await handleDeploymentBeforeTransaction(userId, walletAddress);
              
              if (success) {
                setIsDeployed(true);
                // Optional: Show success toast/notification
              } else {
                // Optional: Show error toast/notification
                console.error('Failed to deploy smart account');
              }
            } catch (error) {
              console.error('Error deploying smart account:', error);
              // Optional: Show error toast/notification
            } finally {
              setIsDeploying(false);
            }
          }}
          disabled={isDeploying}
        >
          {isDeploying ? 'Deploying...' : 'Deploy'}
        </button>}
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 pt-8">
        <ul className="space-y-5">
          <li>
            <a 
              href="#"
              onClick={handleTabClick('dashboard')}
              className={`flex items-center ${activeTab === 'dashboard' ? 'text-white' : 'text-gray-400'} hover:text-violet-400 transition`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
              </svg>
              Dashboard
            </a>
          </li>
          <li>
            <a 
              href="#"
              onClick={handleTabClick('address-book')}
              className={`flex items-center ${activeTab === 'address-book' ? 'text-white' : 'text-gray-400'} hover:text-violet-400 transition`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path>
              </svg>
              Address Book
            </a>
          </li>
          <li>
            <a 
              href="#"
              onClick={handleTabClick('transactions')}
              className={`flex items-center ${activeTab === 'transactions' ? 'text-white' : 'text-gray-400'} hover:text-violet-400 transition`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
              </svg>
              Transactions
            </a>
          </li>
          <li>
            <a 
              href="#"
              onClick={handleTabClick('settings')}
              className={`flex items-center ${activeTab === 'settings' ? 'text-white' : 'text-gray-400'} hover:text-violet-400 transition`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              Settings
            </a>
          </li>
        </ul>
      </nav>
    </div>
  );
} 