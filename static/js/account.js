document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const registerBiometricsBtn = document.getElementById('registerBiometricsBtn');
  const biometricStatus = document.getElementById('biometricStatus');
  const biometricLoader = document.getElementById('biometricLoader');
  const logoutBtn = document.getElementById('logoutBtn');
  const logoutCardBtn = document.getElementById('logoutCardBtn');

  // Check if browser supports WebAuthn
  const supportsWebAuthn = () => {
    return window.PublicKeyCredential && 
           typeof window.PublicKeyCredential === 'function' &&
           typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';
  };

  // Show loading state
  const showLoading = () => {
    if (biometricLoader) {
      biometricLoader.classList.remove('d-none');
    }
  };

  // Hide loading state
  const hideLoading = () => {
    if (biometricLoader) {
      biometricLoader.classList.add('d-none');
    }
  };

  // Show status message
  const showStatus = (message, isError = false) => {
    if (biometricStatus) {
      biometricStatus.textContent = message;
      biometricStatus.classList.remove('text-success', 'text-danger');
      biometricStatus.classList.add(isError ? 'text-danger' : 'text-success');
      biometricStatus.classList.remove('d-none');
    }
  };

  // Logout function
  async function handleLogout() {
    try {
      showLoading();
      showStatus('Logging out...');
      
      // Send logout request to the server
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin' // Include cookies
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to logout');
      }
      
      // Clear any local storage items related to authentication
      localStorage.removeItem('biometricRegistered');
      localStorage.removeItem('lastWalletAddress');
      
      // Clear any other browser storage that might contain auth data
      sessionStorage.clear();
      
      // Successfully logged out, redirect to login page
      showStatus('Successfully logged out. Redirecting to login page...');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1000);
      
    } catch (error) {
      console.error('Logout error:', error);
      showStatus(`Logout failed: ${error.message}`, true);
      hideLoading();
    }
  }

  // Helper function: ArrayBuffer to Base64URL (WebAuthn compliant)
  function bufferToBase64URL(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    // Convert to base64 then make base64url by replacing characters
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  // Helper function: Base64URL to ArrayBuffer
  function base64URLToBuffer(base64url) {
    // Convert base64url to base64 by replacing characters
    const base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(base64url.length + (4 - (base64url.length % 4 || 4)) % 4, '=');
      
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Main function to register biometrics for existing account
  async function registerBiometricsForExistingAccount() {
    if (!supportsWebAuthn()) {
      showStatus('Your browser does not support biometric authentication.', true);
      return;
    }
    
    try {
      showLoading();
      showStatus('Starting biometric registration...');
      
      // 1. Get registration options from server
      const optionsResponse = await fetch('/api/auth/biometric/register/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ forExistingAccount: true })
      });
      
      if (!optionsResponse.ok) {
        const error = await optionsResponse.json();
        throw new Error(error.error || 'Failed to get registration options');
      }
      
      // 2. Get the options for the authenticator
      let options = await optionsResponse.json();
      
      // 3. Prepare options for the authenticator
      options.challenge = base64URLToBuffer(options.challenge);
      options.user.id = base64URLToBuffer(options.user.id);
      if (options.excludeCredentials) {
        for (let i = 0; i < options.excludeCredentials.length; i++) {
          options.excludeCredentials[i].id = base64URLToBuffer(options.excludeCredentials[i].id);
        }
      }
      
      showStatus('Please follow the prompt to register your biometrics...');
      
      // 4. Create credentials using the browser's authenticator
      const credential = await navigator.credentials.create({
        publicKey: options
      });
      
      // 5. Prepare the credential data to send to the server
      const credentialData = {
        id: credential.id,
        rawId: bufferToBase64URL(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64URL(credential.response.clientDataJSON),
          attestationObject: bufferToBase64URL(credential.response.attestationObject)
        },
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
        forExistingAccount: true
      };
      
      showStatus('Verifying biometric registration...');
      
      // 6. Send the credential to the server for verification
      const verifyResponse = await fetch('/api/auth/biometric/register/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentialData)
      });
      
      const verifyResult = await verifyResponse.json();
      
      if (!verifyResponse.ok) {
        throw new Error(verifyResult.error || 'Failed to complete registration');
      }
      
      // 7. Show success message
      showStatus(verifyResult.message || 'Biometric authentication successfully added to your account');
      
      // Optionally, update the UI to show that biometrics are now registered
      if (registerBiometricsBtn) {
        registerBiometricsBtn.disabled = true;
        registerBiometricsBtn.textContent = 'Biometrics Registered';
      }
      
    } catch (error) {
      console.error('Biometric registration error:', error);
      showStatus(`Biometric registration failed: ${error.message}`, true);
    } finally {
      hideLoading();
    }
  }
  
  // Add event listeners
  if (registerBiometricsBtn) {
    registerBiometricsBtn.addEventListener('click', registerBiometricsForExistingAccount);
  }
  
  // Add logout event listeners
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
  
  if (logoutCardBtn) {
    logoutCardBtn.addEventListener('click', handleLogout);
  }
  
  // Check if WebAuthn is supported on page load
  if (!supportsWebAuthn()) {
    if (registerBiometricsBtn) {
      registerBiometricsBtn.disabled = true;
      registerBiometricsBtn.textContent = 'Biometrics Not Supported';
    }
    showStatus('Your browser does not support biometric authentication.', true);
  }
}); 