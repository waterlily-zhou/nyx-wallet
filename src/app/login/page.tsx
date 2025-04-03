'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import WebAuthnDebugger from '@/components/WebAuthnDebugger';

export default function LoginPage() {
  const router = useRouter();
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebugger, setShowDebugger] = useState(false);

  const addDebugLog = (message: string) => {
    console.log(message);
    setDebugLog(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]}: ${message}`]);
  };

  useEffect(() => {
    addDebugLog('Login page loaded');
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-black text-white">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">nyx_wallet</h1>
          <p className="text-gray-400 text-sm mb-8">Your secure biometric wallet</p>
        </div>

        {/* Use the updated LoginForm component */}
        <LoginForm />

        {/* Toggle debugger button */}
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setShowDebugger(!showDebugger)}
            className="text-sm text-gray-500 underline"
          >
            {showDebugger ? 'Hide Debugger' : 'Show Debugger'}
          </button>
        </div>

        {/* WebAuthn Debugger (only shown when toggled) */}
        {showDebugger && <WebAuthnDebugger />}

        {/* Debug logs panel */}
        <div className="mt-8 p-4 bg-gray-900 rounded-lg text-xs font-mono overflow-auto max-h-40">
          <h3 className="font-bold mb-2">Debug Logs:</h3>
          <div>
            {debugLog.map((log, i) => (
              <div key={i} className="mb-1">{log}</div>
            ))}
            {debugLog.length === 0 && <div className="text-gray-500">No logs yet</div>}
          </div>
        </div>
      </div>
    </main>
  );
}