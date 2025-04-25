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
  const [status, setStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle');
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
        setStatus('deploying');
        addLog('Starting deployment process...');
        
        // Deploy using the server action
        const result = await deploySmartAccount(userId, walletAddress);
        
        // Add server logs to our log
        result.logs.forEach(logMessage => {
          addLog(logMessage);
        });
        
        if (result.success) {
          setStatus('success');
          addLog('✅ Deployment successful!');
        } else {
          setStatus('error');
          setErrorMessage(result.message);
          addLog(`❌ ${result.message}`);
        }
      } catch (error) {
        setStatus('error');
        const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
        setErrorMessage(errorMsg);
        addLog(`❌ Error: ${errorMsg}`);
      }
    };
    
    startDeployment();
    
    // No cleanup needed since we're not overriding console methods anymore
  }, [isOpen, userId, walletAddress]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-zinc-900 w-full max-w-md rounded-lg overflow-hidden shadow-2xl p-4">
        <div className="p-4 flex justify-between items-center">
          <h2 className="text-violet-500">Smart Account Deployment</h2>
          <button 
            onClick={onClose}
            disabled={status === 'deploying'}
            className={`rounded-full p-1 hover:bg-gray-700 ${status === 'deploying' ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              {status === 'deploying' && (
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              )}
              {status === 'success' && (
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
              )}
              {status === 'error' && (
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
                {status === 'deploying' && 'Deploying smart account...'}
                {status === 'success' && 'Deployment successful!'}
                {status === 'error' && 'Deployment failed'}
              </p>
              {errorMessage && status === 'error' && (
                <p className="text-red-400 text-sm mt-1">{errorMessage}</p>
              )}
            </div>
          </div>
          
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
          {status === 'error' && (
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
                    setStatus('deploying');
                    
                    // Start a new deployment using server actions
                    deploySmartAccount(userId, walletAddress)
                      .then(result => {
                        // Add logs to our UI
                        result.logs.forEach(logMessage => {
                          setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${logMessage}`]);
                        });
                        
                        if (result.success) {
                          setStatus('success');
                        } else {
                          setStatus('error');
                          setErrorMessage(result.message);
                        }
                      })
                      .catch(err => {
                        setStatus('error');
                        setErrorMessage(err.message || 'Unknown error occurred');
                      });
                  }, 500);
                }}
                className="px-4 py-2 bg-violet-600 text-white text-sm rounded-md hover:bg-violet-700 transition"
              >
                Retry
              </button>
            </div>
          )}
          {(status === 'deploying' || status === 'idle') && (
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
} 