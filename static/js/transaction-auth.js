// Transaction signing with biometric authentication

document.addEventListener('DOMContentLoaded', function() {
  // Check if browser supports WebAuthn
  const isWebAuthnSupported = () => {
    return window.PublicKeyCredential !== undefined;
  };

  // Display error message
  const showError = (message) => {
    const errorElement = document.getElementById('transaction-error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.remove('d-none');
    } else {
      console.error(message);
    }
  };

  // Display success message
  const showSuccess = (message) => {
    const successElement = document.getElementById('transaction-success');
    if (successElement) {
      successElement.textContent = message;
      successElement.classList.remove('d-none');
    } else {
      console.log(message);
    }
  };

  // Hide messages
  const hideMessages = () => {
    const errorElement = document.getElementById('transaction-error');
    const successElement = document.getElementById('transaction-success');
    if (errorElement) errorElement.classList.add('d-none');
    if (successElement) successElement.classList.add('d-none');
  };

  // Convert ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  };

  // Convert base64 to ArrayBuffer
  const base64ToArrayBuffer = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Sign transaction using biometrics
  const signTransactionWithBiometrics = async (transactionData) => {
    try {
      hideMessages();

      // Check WebAuthn support
      if (!isWebAuthnSupported()) {
        showError('WebAuthn is not supported in this browser.');
        return false;
      }

      // Create a transaction hash (in a real implementation, this would be the keccak256 hash of the transaction data)
      const transactionString = JSON.stringify(transactionData);
      console.log('Transaction data:', transactionData);
      
      // For demo, we'll use a simple hash function
      // In production, use a proper hashing function like ethers.utils.keccak256
      const encoder = new TextEncoder();
      const data = encoder.encode(transactionString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const transactionHash = arrayBufferToBase64(hashBuffer);
      console.log('Transaction hash:', transactionHash);

      // Request biometric authentication options
      const optionsResponse = await fetch('/api/auth/biometric/transaction/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ challenge: transactionHash }),
        credentials: 'same-origin'
      });

      if (!optionsResponse.ok) {
        const error = await optionsResponse.json();
        throw new Error(error.error || 'Failed to get authentication options');
      }

      const options = await optionsResponse.json();
      console.log('Authentication options:', options);

      // Convert base64URL challenge to ArrayBuffer
      options.challenge = base64ToArrayBuffer(
        options.challenge.replace(/-/g, '+').replace(/_/g, '/')
      );

      // Convert allowCredentials id to ArrayBuffer
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map(credential => {
          return {
            ...credential,
            id: base64ToArrayBuffer(
              credential.id.replace(/-/g, '+').replace(/_/g, '/')
            )
          };
        });
      }

      // Request biometric authentication
      const assertion = await navigator.credentials.get({
        publicKey: options
      });

      console.log('Authentication assertion:', assertion);

      // Prepare the assertion for sending to the server
      const authData = {
        id: assertion.id,
        rawId: arrayBufferToBase64(assertion.rawId),
        type: assertion.type,
        transactionHash: transactionHash,
        response: {
          authenticatorData: arrayBufferToBase64(assertion.response.authenticatorData),
          clientDataJSON: arrayBufferToBase64(assertion.response.clientDataJSON),
          signature: arrayBufferToBase64(assertion.response.signature),
          userHandle: assertion.response.userHandle ? 
            arrayBufferToBase64(assertion.response.userHandle) : null
        }
      };

      // Send the assertion to the server for verification
      const verifyResponse = await fetch('/api/auth/biometric/transaction/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(authData),
        credentials: 'same-origin'
      });

      if (!verifyResponse.ok) {
        const error = await verifyResponse.json();
        throw new Error(error.error || 'Failed to verify authentication');
      }

      const result = await verifyResponse.json();
      console.log('Verification result:', result);

      if (result.success) {
        showSuccess('Transaction signed successfully!');
        return {
          success: true,
          signature: result.signature
        };
      } else {
        throw new Error('Verification failed');
      }

    } catch (error) {
      console.error('Error signing transaction:', error);
      showError(`Error signing transaction: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  };

  // Get the confirm transaction button
  const confirmTransactionBtn = document.getElementById('confirmTransactionBtn');
  if (confirmTransactionBtn) {
    // Store the original click handler
    const originalClickHandler = confirmTransactionBtn.onclick;
    
    // Replace with our handler that does biometric auth first
    confirmTransactionBtn.onclick = async function(event) {
      event.preventDefault();
      
      // Get transaction data
      const fromAddress = document.querySelector('.wallet-address') ? 
        document.querySelector('.wallet-address').textContent.trim() : 
        window.smartAccountAddress;
        
      const toAddress = document.getElementById('toAddress').value;
      const amount = document.getElementById('amount').value;
      const currency = document.getElementById('currency').value || 'ETH';
      const message = document.getElementById('message').value || '';
      
      // Create transaction data object
      const transactionData = {
        fromAddress,
        toAddress,
        amount,
        currency,
        message,
        timestamp: new Date().toISOString()
      };
      
      // Attempt to sign with biometrics
      const signResult = await signTransactionWithBiometrics(transactionData);
      
      if (signResult.success) {
        // If biometric auth successful, add signature to form and continue
        const signatureInput = document.createElement('input');
        signatureInput.type = 'hidden';
        signatureInput.name = 'biometricSignature';
        signatureInput.value = signResult.signature;
        document.getElementById('sendTransactionForm').appendChild(signatureInput);
        
        // Call the original handler if it exists
        if (typeof originalClickHandler === 'function') {
          originalClickHandler.call(this, event);
        }
      }
    };
  }
}); 