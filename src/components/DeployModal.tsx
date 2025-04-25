'use client';

import { useState, useEffect } from 'react';
import { Address } from 'viem';
import { deploySmartAccount, checkDeploymentStatus } from '@/lib/actions/deploy-actions';

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: Address;
  userId: string;
}

export default function DeployModal({ isOpen, onClose, walletAddress, userId }: DeployModalProps) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'deploying' | 'needsFunds' | 'success' | 'error'>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Start deployment when modal opens
  useEffect(() => {
    if (!isOpen) return;
    
    const addLog = (message: string) => {
      setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    };
    
    const startDeployment = async () => {
      try {
        // First check if already deployed
        setStatus('checking');
        addLog('Checking current deployment status...');
        
        const statusResult = await checkDeploymentStatus(walletAddress);
        statusResult.logs.forEach(logMsg => addLog(logMsg));
        
        // If already deployed, just show success
        if (statusResult.isDeployed) {
          setStatus('success');
          addLog('✅ Smart account is already deployed!');
          return;
        }
        
        // Start deployment flow
        setStatus('deploying');
        addLog('Smart account needs to be deployed.');
        addLog(`IMPORTANT: Your smart account address ${walletAddress} needs some ETH to pay for its own deployment.`);
        
        // Deploy using the server action
        const result = await deploySmartAccount(userId, walletAddress);
        
        // Add server logs to our log
        result.logs.forEach(logMessage => {
          addLog(logMessage);
        });
        
        // After deployment attempt, verify deployment status again
        const verifyResult = await checkDeploymentStatus(walletAddress);
        verifyResult.logs.forEach(logMsg => addLog(logMsg));
        
        if (verifyResult.isDeployed) {
          setStatus('success');
          addLog('✅ Deployment verified! Smart account is now deployed.');
        } else if (result.success) {
          // The deployment action reported success but verification shows it's not deployed
          setStatus('error');
          setErrorMessage('Deployment reported success but verification failed. Please try again.');
          addLog('❌ Deployment verification failed - contract not found on chain.');
        } else {
          // Check if this is a funds issue
          if (result.message.includes('funds') || result.logs.some(log => log.includes('funds'))) {
            setStatus('needsFunds');
            addLog('❌ Your smart account needs ETH to deploy.');
          } else {
            setStatus('error');
            setErrorMessage(result.message);
            addLog(`❌ ${result.message}`);
          }
        }
      } catch (error) {
        setStatus('error');
        const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
        setErrorMessage(errorMsg);
        addLog(`❌ Error: ${errorMsg}`);
      }
    };
    
    startDeployment();
  }, [isOpen, userId, walletAddress]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-zinc-900 w-full max-w-md rounded-lg overflow-hidden shadow-2xl p-4">
        <div className="p-4 flex justify-between items-center">
          <h2 className="text-violet-500">Smart Account Deployment</h2>
          <button 
            onClick={onClose}
            disabled={status === 'deploying' || status === 'checking'}
            className={`rounded-full p-1 hover:bg-gray-700 ${
              (status === 'deploying' || status === 'checking') ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <div className="p-4">
          {/* Status indicator */}
          <div className="flex items-center mb-8">
            <div className="mr-3">
              {status === 'idle' && (
                <div className="w-8 h-8 bg-gray-700 rounded-full"></div>
              )}
              {(status === 'deploying' || status === 'checking') && (
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              )}
              {status === 'success' && (
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
              )}
              {(status === 'error' || status === 'needsFunds') && (
                <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </div>
              )}
            </div>
            <div>
              <p className="text-white">
                {status === 'idle' && 'Preparing deployment...'}
                {status === 'checking' && 'Checking deployment status...'}
                {status === 'deploying' && 'Deploying smart account...'}
                {status === 'needsFunds' && 'Smart account needs ETH'}
                {status === 'success' && 'Deployment successful!'}
                {status === 'error' && 'Deployment failed'}
              </p>
              {errorMessage && status === 'error' && (
                <p className="text-red-400 text-sm mt-1">{errorMessage}</p>
              )}
              {status === 'needsFunds' && (
                <p className="text-yellow-400 text-sm mt-1">
                  Send ~0.01 ETH to your smart account address to cover deployment costs.
                </p>
              )}
            </div>
          </div>
          
          {/* Funds explanation section when funds are needed */}
          {status === 'needsFunds' && (
            <div className="bg-zinc-800 p-3 rounded-md mb-4">
              <h3 className="text-yellow-400 text-sm font-medium mb-2">Why does my address need ETH?</h3>
              <p className="text-gray-300 text-xs mb-2">
                Your smart account is created at a counterfactual address (calculated before deployment),
                but deploying the actual contract requires gas fees.
              </p>
              <p className="text-gray-300 text-xs mb-2">
                Send ETH to your smart account address: <code className="bg-zinc-700 px-1 rounded">{walletAddress}</code>
              </p>
              <p className="text-gray-300 text-xs">
                Once funded, you can retry deployment.
              </p>
            </div>
          )}
          
          {/* Logs section */}
          <div className="mt-4 relative border border-zinc-700 rounded-md">
            <div className="absolute -top-2.5 left-2 px-1 text-sm text-gray-500 bg-zinc-900 mb-2">Deployment logs</div>
            <div className="p-4 h-60 overflow-y-auto font-mono text-xs text-gray-500">
              {log.length > 0 ? (
                log.map((entry, index) => (
                  <div key={index} className="mb-1 leading-relaxed whitespace-pre-wrap break-words">
                    {entry}
                  </div>
                ))
              ) : (
                <div className="text-gray-500">Waiting for deployment to start...</div>
              )}
            </div>
          </div>
        </div>
        
        {/* Footer with actions */}
        <div className="p-4 flex justify-end">
          {status === 'success' && (
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
            >
              Close
            </button>
          )}
          {(status === 'error' || status === 'needsFunds') && (
            <div className="flex space-x-3 gap-2">
              <button 
                onClick={onClose}
                className="px-4 py-2 bg-zinc-900 border border-violet-500 text-white text-sm rounded-md hover:bg-violet-900/20 transition"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  setStatus('idle');
                  setLog([]);
                  setErrorMessage(null);
                  setTimeout(() => {
                    startDeployment(); // Restart the deployment flow
                  }, 500);
                }}
                className="px-4 py-2 bg-violet-600 text-white text-sm rounded-md hover:bg-violet-700 transition"
              >
                Retry
              </button>
            </div>
          )}
          {(status === 'deploying' || status === 'checking' || status === 'idle') && (
            <button 
              disabled
              className="px-4 py-2 bg-gray-700 text-white text-sm rounded-md opacity-50 cursor-not-allowed"
            >
              Please wait...
            </button>
          )}
        </div>
      </div>
    </div>
  );
  
  // Helper function to start deployment
  async function startDeployment() {
    try {
      // First check if already deployed
      setStatus('checking');
      setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Checking current deployment status...`]);
      
      const statusResult = await checkDeploymentStatus(walletAddress);
      statusResult.logs.forEach(logMsg => {
        setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${logMsg}`]);
      });
      
      // If already deployed, just show success
      if (statusResult.isDeployed) {
        setStatus('success');
        setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✅ Smart account is already deployed!`]);
        return;
      }
      
      // Start deployment flow
      setStatus('deploying');
      setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Smart account needs to be deployed.`]);
      
      // Deploy using the server action
      const result = await deploySmartAccount(userId, walletAddress);
      
      // Add server logs to our log
      result.logs.forEach(logMessage => {
        setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${logMessage}`]);
      });
      
      // After deployment attempt, verify deployment status again
      const verifyResult = await checkDeploymentStatus(walletAddress);
      verifyResult.logs.forEach(logMsg => {
        setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${logMsg}`]);
      });
      
      if (verifyResult.isDeployed) {
        setStatus('success');
        setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✅ Deployment verified! Smart account is now deployed.`]);
      } else if (result.success) {
        // The deployment action reported success but verification shows it's not deployed
        setStatus('error');
        setErrorMessage('Deployment reported success but verification failed. Please try again.');
        setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Deployment verification failed - contract not found on chain.`]);
      } else {
        // Check if this is a funds issue
        if (result.message.includes('funds') || result.logs.some(log => log.includes('funds'))) {
          setStatus('needsFunds');
          setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Your smart account needs ETH to deploy.`]);
        } else {
          setStatus('error');
          setErrorMessage(result.message);
          setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ ${result.message}`]);
        }
      }
    } catch (error) {
      setStatus('error');
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      setErrorMessage(errorMsg);
      setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Error: ${errorMsg}`]);
    }
  }
} 