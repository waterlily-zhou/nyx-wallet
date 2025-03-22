document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const createWalletOption = document.getElementById('create-wallet-option');
  const biometricOption = document.getElementById('biometric-option');
  const loginOption = document.getElementById('login-option');
  const googleLogin = document.getElementById('google-login');
  const wechatLogin = document.getElementById('wechat-login');
  const loadingIndicator = document.getElementById('loading');
  const errorMessage = document.getElementById('error-message');
  const statusMessage = document.getElementById('status-message');

  // Check if WebAuthn is supported by the browser
  const isWebAuthnSupported = () => {
    return window.PublicKeyCredential !== undefined;
  };

  // Set a user-friendly status message
  const showStatus = (message) => {
    if (statusMessage) {
      statusMessage.textContent = message;
      statusMessage.style.display = 'block';
    }
  };

  // Show loading indicator
  const showLoading = () => {
    loadingIndicator.style.display = 'block';
  };

  // Hide loading indicator
  const hideLoading = () => {
    loadingIndicator.style.display = 'none';
  };

  // Show error message
  const showError = (message) => {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
      errorMessage.style.display = 'none';
    }, 5000);
  };

  // Helper functions for array buffer and base64url conversion
  function arrayBufferToBase64URL(buffer) {
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

  // Handle creation of a new wallet
  if (createWalletOption) {
    createWalletOption.addEventListener('click', async () => {
      showLoading();
      showStatus('Creating your wallet...');
      try {
        const response = await fetch('/api/wallet/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin'
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || error.error || 'Failed to create wallet');
        }

        const data = await response.json();
        showStatus('Wallet created successfully! Redirecting...');
        // Redirect to the wallet page
        window.location.href = '/';
      } catch (error) {
        console.error('Error creating wallet:', error);
        showError(error.message || 'Failed to create wallet');
        hideLoading();
      }
    });
  }

  // Handle direct login with biometrics (for existing users)
  if (loginOption) {
    // Disable the option if WebAuthn is not supported
    if (!isWebAuthnSupported()) {
      loginOption.classList.add('disabled');
      loginOption.style.opacity = '0.5';
      loginOption.style.cursor = 'not-allowed';
      loginOption.querySelector('p').textContent = 'Not supported by your browser';
    } else {
      loginOption.addEventListener('click', async () => {
        showLoading();
        showStatus('Checking your biometric registration...');
        try {
          console.log("Checking biometric registration status for login...");
          // First check if user has registered biometrics
          const checkResponse = await fetch('/api/auth/biometric/check', {
            method: 'GET',
            credentials: 'same-origin'
          });
          
          const checkData = await checkResponse.json();
          console.log("Login biometric check result:", checkData);
          
          if (checkData.registered) {
            console.log("Biometrics registered, proceeding with login");
            showStatus('Starting biometric authentication...');
            // User has registered biometrics, proceed with authentication
            await authenticateWithBiometrics();
          } else {
            console.log("No registered biometrics for login");
            showError('No biometric credentials found for your device. Please create a wallet and register biometrics first.');
            hideLoading();
          }
        } catch (error) {
          console.error('Login error:', error);
          showError(error.message || 'Login failed');
          hideLoading();
        }
      });
    }
  }

  // Handle biometric authentication/registration
  if (biometricOption) {
    // Disable the option if WebAuthn is not supported
    if (!isWebAuthnSupported()) {
      biometricOption.classList.add('disabled');
      biometricOption.style.opacity = '0.5';
      biometricOption.style.cursor = 'not-allowed';
      biometricOption.querySelector('p').textContent = 'Not supported by your browser';
    } else {
      biometricOption.addEventListener('click', async () => {
        showLoading();
        showStatus('Checking your biometric registration...');
        
        try {
          console.log("Checking biometric registration status...");
          // First check if user has registered biometrics
          const checkResponse = await fetch('/api/auth/biometric/check', {
            method: 'GET',
            credentials: 'same-origin'
          });
          
          const checkData = await checkResponse.json();
          console.log("Biometric check result:", checkData);
          
          if (checkData.registered) {
            console.log("Biometrics registered, proceeding with authentication");
            showStatus('Starting biometric authentication...');
            // User has registered biometrics, proceed with authentication
            await authenticateWithBiometrics();
          } else {
            console.log("Biometrics not registered, proceeding with registration");
            // First create a new wallet, then we'll register biometrics
            showStatus('Creating a new wallet first...');
            await createWalletThenRegisterBiometrics();
          }
        } catch (error) {
          console.error('Biometric error:', error);
          showError(error.message || 'Biometric authentication failed');
          hideLoading();
        }
      });
    }
  }

  // First create a wallet, then register biometrics
  async function createWalletThenRegisterBiometrics() {
    try {
      // First create a wallet
      const response = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to create wallet');
      }

      const data = await response.json();
      console.log("Wallet created successfully:", data);
      showStatus('Wallet created! Now registering your biometrics...');
      
      // Then register biometrics for this wallet
      await registerBiometricsForExistingWallet();
    } catch (error) {
      console.error('Error in wallet creation:', error);
      showError(error.message || 'Failed to create wallet and register biometrics');
      hideLoading();
    }
  }

  // Register biometrics for an existing wallet
  async function registerBiometricsForExistingWallet() {
    try {
      console.log("Starting biometric registration for existing wallet...");
      showStatus('Requesting biometric registration...');

      // Get registration options from server for existing account
      const optionsResponse = await fetch('/api/auth/biometric/register/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ forExistingAccount: true }),
        credentials: 'same-origin'
      });
      
      if (!optionsResponse.ok) {
        const error = await optionsResponse.json();
        throw new Error(error.message || error.error || 'Failed to get registration options');
      }
      
      const options = await optionsResponse.json();
      console.log("Received registration options:", options);
      
      // Convert base64 challenge to ArrayBuffer
      options.challenge = base64URLToBuffer(options.challenge);
      
      // Convert user ID to ArrayBuffer
      if (options.user?.id) {
        options.user.id = base64URLToBuffer(options.user.id);
      }
      
      // Convert excludeCredentials if present
      if (options.excludeCredentials) {
        for (let i = 0; i < options.excludeCredentials.length; i++) {
          options.excludeCredentials[i].id = base64URLToBuffer(options.excludeCredentials[i].id);
        }
      }
      
      // Create credentials
      showStatus('Please follow the biometric prompt...');
      console.log("Creating credentials with options:", options);
      const credential = await navigator.credentials.create({
        publicKey: options
      });
      
      console.log("Created credential:", credential);
      showStatus('Biometric registered! Completing setup...');
      
      // Prepare credential data for sending to server
      const credentialData = {
        id: credential.id,
        rawId: arrayBufferToBase64URL(credential.rawId),
        response: {
          clientDataJSON: arrayBufferToBase64URL(credential.response.clientDataJSON),
          attestationObject: arrayBufferToBase64URL(credential.response.attestationObject)
        },
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
        forExistingAccount: true
      };
      
      console.log("Sending credential data to server:", credentialData);
      
      // Send credential to server
      const verifyResponse = await fetch('/api/auth/biometric/register/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentialData),
        credentials: 'same-origin'
      });
      
      if (!verifyResponse.ok) {
        const error = await verifyResponse.json();
        throw new Error(error.message || error.error || 'Failed to register biometrics');
      }
      
      const result = await verifyResponse.json();
      console.log("Registration result:", result);
      showStatus('Success! Your biometrics are now linked to your wallet. Redirecting...');
      
      // Redirect to the wallet page
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (error) {
      console.error('Biometric registration error:', error);
      showError(error.message || 'Biometric registration failed');
      hideLoading();
    }
  }

  // Register biometrics for the first time
  async function registerBiometrics() {
    try {
      console.log("Starting biometric registration...");
      showStatus('Requesting biometric registration...');

      // Get registration options from server
      const optionsResponse = await fetch('/api/auth/biometric/register/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
      });
      
      if (!optionsResponse.ok) {
        const error = await optionsResponse.json();
        throw new Error(error.message || error.error || 'Failed to get registration options');
      }
      
      const options = await optionsResponse.json();
      console.log("Received registration options:", options);
      
      // Convert base64 challenge to ArrayBuffer
      options.challenge = base64URLToBuffer(options.challenge);
      
      // Convert user ID to ArrayBuffer
      if (options.user?.id) {
        options.user.id = base64URLToBuffer(options.user.id);
      }
      
      // Convert excludeCredentials if present
      if (options.excludeCredentials) {
        for (let i = 0; i < options.excludeCredentials.length; i++) {
          options.excludeCredentials[i].id = base64URLToBuffer(options.excludeCredentials[i].id);
        }
      }
      
      // Create credentials
      showStatus('Please follow the biometric prompt...');
      console.log("Creating credentials with options:", options);
      const credential = await navigator.credentials.create({
        publicKey: options
      });
      
      console.log("Created credential:", credential);
      showStatus('Biometric registered! Creating your wallet...');
      
      // Prepare credential data for sending to server
      const credentialData = {
        id: credential.id,
        rawId: arrayBufferToBase64URL(credential.rawId),
        response: {
          clientDataJSON: arrayBufferToBase64URL(credential.response.clientDataJSON),
          attestationObject: arrayBufferToBase64URL(credential.response.attestationObject)
        },
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {}
      };
      
      console.log("Sending credential data to server:", credentialData);
      
      // Send credential to server
      const verifyResponse = await fetch('/api/auth/biometric/register/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentialData),
        credentials: 'same-origin'
      });
      
      if (!verifyResponse.ok) {
        const error = await verifyResponse.json();
        throw new Error(error.message || error.error || 'Failed to register biometrics');
      }
      
      const result = await verifyResponse.json();
      console.log("Registration result:", result);
      showStatus('Success! Your wallet has been created with biometric authentication. Redirecting...');
      
      // Redirect to the wallet page
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (error) {
      console.error('Biometric registration error:', error);
      showError(error.message || 'Biometric registration failed');
      hideLoading();
    }
  }

  // Authenticate with biometrics
  async function authenticateWithBiometrics() {
    try {
      showLoading();
      showStatus('Verifying your biometrics...');
      
      // 1. Check if browser supports WebAuthn
      if (!isWebAuthnSupported()) {
        showStatus('Your browser does not support biometric authentication.');
        hideLoading();
        return;
      }
      
      // 2. Get authentication options from server
      const optionsResponse = await fetch('/api/auth/biometric/authenticate/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
      });
      
      if (!optionsResponse.ok) {
        const errorData = await optionsResponse.json();
        
        // Special handling for no credentials found (common after logout)
        if (errorData.error && errorData.error.includes('No registered user found')) {
          showStatus('No biometric credentials found. Please create a wallet or try again.');
          hideLoading();
          return;
        }
        
        throw new Error(errorData.error || `Server error: ${optionsResponse.status}`);
      }
      
      // 3. Get the options for the authenticator
      let options = await optionsResponse.json();
      
      // 4. Prepare options for the authenticator
      options.challenge = base64URLToBuffer(options.challenge);
      if (options.allowCredentials) {
        for (let i = 0; i < options.allowCredentials.length; i++) {
          options.allowCredentials[i].id = base64URLToBuffer(options.allowCredentials[i].id);
        }
      }
      
      showStatus('Please follow the prompt to verify your biometrics...');
      
      // 5. Request the browser to use the authenticator
      const credential = await navigator.credentials.get({
        publicKey: options
      });
      
      // 6. Prepare the credential data to send to the server
      const credentialData = {
        id: credential.id,
        rawId: arrayBufferToBase64URL(credential.rawId),
        response: {
          clientDataJSON: arrayBufferToBase64URL(credential.response.clientDataJSON),
          authenticatorData: arrayBufferToBase64URL(credential.response.authenticatorData),
          signature: arrayBufferToBase64URL(credential.response.signature),
          userHandle: credential.response.userHandle ? arrayBufferToBase64URL(credential.response.userHandle) : null
        },
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {}
      };
      
      showStatus('Verifying authentication with server...');
      
      // 7. Send the credential to the server for verification
      const verifyResponse = await fetch('/api/auth/biometric/authenticate/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentialData),
        credentials: 'same-origin'
      });
      
      const verifyResult = await verifyResponse.json();
      
      // Handle session expired error specifically
      if (!verifyResponse.ok) {
        if (verifyResult.code === 'SESSION_EXPIRED') {
          showStatus('Your session has expired. Please try logging in again.');
          
          // Clear any stale data that might be causing issues
          localStorage.removeItem('biometricRegistered');
          
          // Optionally, reload the page after a short delay
          setTimeout(() => {
            window.location.reload();
          }, 2000);
          return;
        }
        
        throw new Error(verifyResult.error || 'Failed to complete authentication');
      }
      
      // 8. Handle successful authentication
      showStatus('Authentication successful. Redirecting to dashboard...');
      
      // Store that biometrics are registered for this browser
      localStorage.setItem('biometricRegistered', 'true');
      
      // 9. Redirect to dashboard
      window.location.href = '/';
      
    } catch (error) {
      console.error('Biometric authentication error:', error);
      showStatus(`Biometric authentication error: ${error.message}`);
      
      // If there's a specific error related to the authenticator, provide more helpful suggestions
      if (error.name === 'NotAllowedError') {
        showStatus('Authentication was denied. Please try again and approve the biometric prompt.');
      } else if (error.name === 'SecurityError') {
        showStatus('A security error occurred. Please make sure you\'re using HTTPS or localhost.');
      }
    } finally {
      hideLoading();
    }
  }

  // Handle Google login
  if (googleLogin) {
    googleLogin.addEventListener('click', () => {
      showLoading();
      // Redirect to Google OAuth flow
      window.location.href = '/api/auth/google';
    });
  }

  // Handle WeChat login
  if (wechatLogin) {
    wechatLogin.addEventListener('click', () => {
      showLoading();
      // Redirect to WeChat OAuth flow
      window.location.href = '/api/auth/wechat';
    });
  }
}); 