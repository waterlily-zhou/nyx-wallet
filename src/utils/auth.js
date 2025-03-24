import { storeDeviceKey, getDeviceKey, clearDeviceKey } from './key-management.js';

// Handle biometric registration
async function handleBiometricRegistration(response) {
  try {
    // Get registration options
    const optionsResponse = await fetch('/api/auth/biometric/register/options', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ forExistingAccount: false })
    });
    
    if (!optionsResponse.ok) {
      throw new Error('Failed to get registration options');
    }
    
    const options = await optionsResponse.json();
    
    // Create credentials
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: Uint8Array.from(atob(options.challenge), c => c.charCodeAt(0)),
        rp: {
          name: options.rp.name,
          id: options.rp.id
        },
        user: {
          id: Uint8Array.from(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        attestation: options.attestation,
        authenticatorSelection: options.authenticatorSelection
      }
    });
    
    // Complete registration
    const completeResponse = await fetch('/api/auth/biometric/register/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: credential.id,
        rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
        response: {
          attestationObject: btoa(String.fromCharCode(...new Uint8Array(credential.response.attestationObject))),
          clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON)))
        },
        type: credential.type
      })
    });
    
    if (!completeResponse.ok) {
      throw new Error('Failed to complete registration');
    }
    
    const result = await completeResponse.json();
    
    // Store the device key if it's provided in the response
    if (result.deviceKey) {
      await storeDeviceKey(result.deviceKey);
    }
    
    return result;
  } catch (error) {
    console.error('Biometric registration error:', error);
    throw error;
  }
}

// Handle biometric authentication
async function handleBiometricAuthentication() {
  try {
    // Get authentication options
    const optionsResponse = await fetch('/api/auth/biometric/authenticate/options', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!optionsResponse.ok) {
      throw new Error('Failed to get authentication options');
    }
    
    const options = await optionsResponse.json();
    
    // Get stored credentials
    const credentials = await navigator.credentials.get({
      publicKey: {
        challenge: Uint8Array.from(atob(options.challenge), c => c.charCodeAt(0)),
        allowCredentials: options.allowCredentials,
        userVerification: options.userVerification
      }
    });
    
    if (!credentials) {
      throw new Error('No credentials found');
    }
    
    // Complete authentication
    const completeResponse = await fetch('/api/auth/biometric/authenticate/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: credentials.id,
        rawId: btoa(String.fromCharCode(...new Uint8Array(credentials.rawId))),
        response: {
          authenticatorData: btoa(String.fromCharCode(...new Uint8Array(credentials.response.authenticatorData))),
          clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credentials.response.clientDataJSON))),
          signature: btoa(String.fromCharCode(...new Uint8Array(credentials.response.signature)))
        },
        type: credentials.type
      })
    });
    
    if (!completeResponse.ok) {
      throw new Error('Failed to complete authentication');
    }
    
    return await completeResponse.json();
  } catch (error) {
    console.error('Biometric authentication error:', error);
    throw error;
  }
}

// Handle transaction signing with biometrics
async function handleTransactionSigning(transactionHash) {
  try {
    // Get transaction signing options
    const optionsResponse = await fetch('/api/auth/biometric/transaction/options', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        challenge: btoa(String.fromCharCode(...new Uint8Array(crypto.getRandomValues(new Uint8Array(32)))))
      })
    });
    
    if (!optionsResponse.ok) {
      throw new Error('Failed to get transaction signing options');
    }
    
    const options = await optionsResponse.json();
    
    // Get stored credentials
    const credentials = await navigator.credentials.get({
      publicKey: {
        challenge: Uint8Array.from(atob(options.challenge), c => c.charCodeAt(0)),
        allowCredentials: options.allowCredentials,
        userVerification: 'required'
      }
    });
    
    if (!credentials) {
      throw new Error('No credentials found');
    }
    
    // Get device key
    const deviceKey = await getDeviceKey();
    if (!deviceKey) {
      throw new Error('Device key not found');
    }
    
    // Complete transaction signing
    const completeResponse = await fetch('/api/auth/biometric/transaction/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: credentials.id,
        rawId: btoa(String.fromCharCode(...new Uint8Array(credentials.rawId))),
        response: {
          authenticatorData: btoa(String.fromCharCode(...new Uint8Array(credentials.response.authenticatorData))),
          clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credentials.response.clientDataJSON))),
          signature: btoa(String.fromCharCode(...new Uint8Array(credentials.response.signature)))
        },
        type: credentials.type,
        transactionHash,
        clientExtensionResults: {}
      })
    });
    
    if (!completeResponse.ok) {
      throw new Error('Failed to complete transaction signing');
    }
    
    return await completeResponse.json();
  } catch (error) {
    console.error('Transaction signing error:', error);
    throw error;
  }
}

// Handle logout
async function handleLogout() {
  try {
    // Clear device key
    await clearDeviceKey();
    
    // Call logout endpoint
    const response = await fetch('/api/auth/logout', {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error('Failed to logout');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
} 