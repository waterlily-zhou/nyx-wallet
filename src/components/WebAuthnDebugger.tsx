'use client';

import { useState } from 'react';
import { testWebAuthnSupport, testWebAuthnRegistration, testWebAuthnAuthentication } from '@/lib/utils/test-webauthn';

export default function WebAuthnDebugger() {
  const [supportResult, setSupportResult] = useState<any>(null);
  const [regResult, setRegResult] = useState<any>(null);
  const [authResult, setAuthResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkSupport = async () => {
    setLoading(true);
    try {
      const result = await testWebAuthnSupport();
      setSupportResult(result);
    } catch (error) {
      setSupportResult({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  const testRegistration = async () => {
    setLoading(true);
    try {
      const result = await testWebAuthnRegistration();
      setRegResult(result);
    } catch (error) {
      setRegResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  const testAuthentication = async () => {
    setLoading(true);
    try {
      const result = await testWebAuthnAuthentication();
      setAuthResult(result);
    } catch (error) {
      setAuthResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatResult = (result: any) => {
    if (!result) return 'No result';
    return JSON.stringify(result, null, 2);
  };

  return (
    <div className="mt-8 p-4 border border-gray-300 rounded-lg">
      <h3 className="text-lg font-semibold mb-4">WebAuthn Debugger</h3>
      
      <div className="space-y-6">
        <div>
          <button 
            onClick={checkSupport}
            disabled={loading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Check WebAuthn Support
          </button>
          {supportResult && (
            <div className="mt-2">
              <div className="font-semibold">
                {supportResult.supported ? '✅ WebAuthn is supported' : '❌ WebAuthn is not supported'}
              </div>
              <pre className="mt-1 p-2 bg-gray-100 rounded overflow-auto text-xs max-h-32">
                {formatResult(supportResult)}
              </pre>
            </div>
          )}
        </div>
        
        <div>
          <button 
            onClick={testRegistration}
            disabled={loading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Test WebAuthn Registration
          </button>
          {regResult && (
            <div className="mt-2">
              <div className="font-semibold">
                {regResult.success ? '✅ Registration test successful' : '❌ Registration test failed'}
              </div>
              <pre className="mt-1 p-2 bg-gray-100 rounded overflow-auto text-xs max-h-32">
                {formatResult(regResult)}
              </pre>
            </div>
          )}
        </div>
        
        <div>
          <button 
            onClick={testAuthentication}
            disabled={loading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Test WebAuthn Authentication
          </button>
          {authResult && (
            <div className="mt-2">
              <div className="font-semibold">
                {authResult.success ? '✅ Authentication test successful' : '❌ Authentication test failed'}
              </div>
              <pre className="mt-1 p-2 bg-gray-100 rounded overflow-auto text-xs max-h-32">
                {formatResult(authResult)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 