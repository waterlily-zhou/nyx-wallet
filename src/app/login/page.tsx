'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';


export default function LoginPage() {
  const router = useRouter();
  const [showDebugger, setShowDebugger] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const addDebugLog = (message: string) => {
    console.log(message);
    setDebugLog(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]}: ${message}`]);
  };
  
  // Placeholder functions
  const handleBiometricAuth = () => {
    addDebugLog('Sign in clicked');
    // Implement actual authentication logic
  };
  
  const addExistingWallet = () => {
    addDebugLog('Add existing clicked');
    // Implement add existing wallet logic
  };
  
  const createWallet = () => {
    addDebugLog('Create new clicked');
    // Implement create new wallet logic
  };

  return (
    <div className="max-w-md w-full p-4">
      {error && (
        <div className="p-4 bg-red-900/50 border border-red-600 rounded-lg text-center text-white mb-4">
          {error}
        </div>
      )}
      
      <div className="grid gap-4">

          <button 
            onClick={handleBiometricAuth}
            className="w-full bg-violet-500 text-gray-100 py-8 px-8 rounded-lg flex flex-row items-center justify-center cursor-pointer hover:bg-violet-700"
          >
              <svg 
                className="h-8 w-8"
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                {/* Top left, right, bottom left, bottom right corner */}
                <path d="M7 3h-4v4" />
                <path d="M17 3h4v4" />
                <path d="M7 21h-4v-4" />
                <path d="M17 21h4v-4" />
                {/* Eyes */}
                <circle cx="9" cy="9" r="0.6" />
                <circle cx="15" cy="9" r="0.6" />
                {/* Smile */}
                <path d="M9 15c.83 1.5 5.17 1.5 6 0" />
              </svg>
            <div className="flex flex-col ml-2">
              <div>Sign in to your wallet</div>
              <div className="text-xs mt-1 text-gray-200">(FaceID / fingerprint)</div>
            </div>
          </button>

        <div className="flex flex-col gap-4">
          <button
            onClick={addExistingWallet}
            className="w-full bg-black border border-violet-500 text-violet-500 py-4 px-4 rounded-lg flex flex-row items-center justify-center cursor-pointer hover:border-violet-700"
          >
            <svg className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
            <div className="ml-2">Add an existing wallet</div>
          </button>
          
          <button
            onClick={createWallet}
            className="w-full bg-black border border-violet-500 text-violet-500 py-4 px-4 rounded-lg flex flex-row items-center justify-center cursor-pointer hover:border-violet-700"
          >
            <svg className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
            </svg>
            <div className="ml-2">Create a new wallet</div>
          </button>
        </div>
      </div>
      
      <div className="mt-4 text-center">
        <button
          onClick={() => setShowDebugger(!showDebugger)}
          className="text-gray-600 border border-gray-300 px-3 py-1 rounded text-xs cursor-pointer hover:bg-gray-100"
        >
          {showDebugger ? 'Hide Debug Logs' : 'Show Debug Logs'}
        </button>
      </div>
      
      {showDebugger && (
        <div className="mt-4 p-4 bg-gray-100 border border-gray-300 rounded-lg font-mono text-xs max-h-40 overflow-y-auto">
          <div>
            {debugLog.map((log, i) => (
              <div key={i} className="mb-2 text-gray-700">{log}</div>
            ))}
            {debugLog.length === 0 && <div className="text-gray-500">No logs yet</div>}
          </div>
        </div>
      )}
    </div>
  );
}