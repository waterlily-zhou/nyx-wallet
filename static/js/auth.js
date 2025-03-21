document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const createWalletOption = document.getElementById('create-wallet-option');
  const biometricOption = document.getElementById('biometric-option');
  const googleLogin = document.getElementById('google-login');
  const wechatLogin = document.getElementById('wechat-login');
  const loadingIndicator = document.getElementById('loading');
  const errorMessage = document.getElementById('error-message');

  // Check if WebAuthn is supported by the browser
  const isWebAuthnSupported = () => {
    return window.PublicKeyCredential !== undefined;
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

  // Handle creation of a new wallet
  if (createWalletOption) {
    createWalletOption.addEventListener('click', async () => {
      showLoading();
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
        // Redirect to the wallet page
        window.location.href = '/';
      } catch (error) {
        console.error('Error creating wallet:', error);
        showError(error.message || 'Failed to create wallet');
        hideLoading();
      }
    });
  }

  // Handle biometric authentication
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
        
        try {
          // First check if user has registered biometrics
          const checkResponse = await fetch('/api/auth/biometric/check', {
            method: 'GET',
            credentials: 'same-origin'
          });
          
          const checkData = await checkResponse.json();
          
          if (checkData.registered) {
            // User has registered biometrics, proceed with authentication
            await authenticateWithBiometrics();
          } else {
            // User hasn't registered biometrics, proceed with registration
            await registerBiometrics();
          }
        } catch (error) {
          console.error('Biometric error:', error);
          showError(error.message || 'Biometric authentication failed');
          hideLoading();
        }
      });
    }
  }

  // Register biometrics for the first time
  async function registerBiometrics() {
    try {
      console.log("Starting biometric registration...");

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
      options.challenge = base64ToArrayBuffer(options.challenge);
      
      // Convert user ID to ArrayBuffer - the server is now sending a Uint8Array buffer not a string
      if (options.user?.id) {
        // Decode the base64 user ID to ArrayBuffer before using it
        options.user.id = base64ToArrayBuffer(options.user.id);
      }
      
      // Create credentials
      console.log("Creating credentials with options:", options);
      const credential = await navigator.credentials.create({
        publicKey: options
      });
      
      console.log("Created credential:", credential);
      
      // Prepare credential data for sending to server
      const credentialData = {
        id: credential.id,
        rawId: arrayBufferToBase64(credential.rawId),
        response: {
          clientDataJSON: arrayBufferToBase64(credential.response.clientDataJSON),
          attestationObject: arrayBufferToBase64(credential.response.attestationObject)
        },
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults()
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
      
      // Redirect to the wallet page
      window.location.href = '/';
    } catch (error) {
      console.error('Biometric registration error:', error);
      showError(error.message || 'Biometric registration failed');
      hideLoading();
    }
  }

  // Authenticate with biometrics
  async function authenticateWithBiometrics() {
    try {
      console.log("Starting biometric authentication...");
      
      // Get authentication options from server
      const optionsResponse = await fetch('/api/auth/biometric/authenticate/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
      });
      
      if (!optionsResponse.ok) {
        const error = await optionsResponse.json();
        throw new Error(error.message || error.error || 'Failed to get authentication options');
      }
      
      const options = await optionsResponse.json();
      console.log("Received authentication options:", options);
      
      // Convert base64 challenge to ArrayBuffer
      options.challenge = base64ToArrayBuffer(options.challenge);
      
      // Convert allowCredentials id to ArrayBuffer
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map(credential => {
          return {
            ...credential,
            id: base64ToArrayBuffer(credential.id)
          };
        });
      }
      
      // Get credentials
      console.log("Getting credentials with options:", options);
      const assertion = await navigator.credentials.get({
        publicKey: options
      });
      
      console.log("Authentication assertion:", assertion);
      
      // Prepare assertion data for sending to server
      const assertionData = {
        id: assertion.id,
        rawId: arrayBufferToBase64(assertion.rawId),
        response: {
          clientDataJSON: arrayBufferToBase64(assertion.response.clientDataJSON),
          authenticatorData: arrayBufferToBase64(assertion.response.authenticatorData),
          signature: arrayBufferToBase64(assertion.response.signature),
          userHandle: assertion.response.userHandle ? arrayBufferToBase64(assertion.response.userHandle) : null
        },
        type: assertion.type,
        clientExtensionResults: assertion.getClientExtensionResults()
      };
      
      console.log("Sending assertion data to server:", assertionData);
      
      // Send assertion to server
      const verifyResponse = await fetch('/api/auth/biometric/authenticate/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assertionData),
        credentials: 'same-origin'
      });
      
      if (!verifyResponse.ok) {
        const error = await verifyResponse.json();
        throw new Error(error.message || error.error || 'Failed to authenticate');
      }
      
      const result = await verifyResponse.json();
      console.log("Authentication result:", result);
      
      // Redirect to the wallet page
      window.location.href = '/';
    } catch (error) {
      console.error('Biometric authentication error:', error);
      showError(error.message || 'Biometric authentication failed');
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

  // Helper functions for array buffer and base64 conversion
  function arrayBufferToBase64(buffer) {
    const binary = String.fromCharCode.apply(null, new Uint8Array(buffer));
    return window.btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}); 