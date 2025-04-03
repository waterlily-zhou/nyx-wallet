import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

/**
 * Helper utility to test WebAuthn functionality
 */
export async function testWebAuthnSupport() {
  // Check if WebAuthn is supported
  if (!window.PublicKeyCredential) {
    console.error('WebAuthn is not supported in this browser');
    return {
      supported: false,
      error: 'WebAuthn is not supported in this browser'
    };
  }

  // Check if platform authenticator is available
  try {
    const platformAuthenticator = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    console.log('Platform authenticator available:', platformAuthenticator);
    
    return {
      supported: true,
      platformAuthenticator,
      userVerification: true
    };
  } catch (error) {
    console.error('Error checking WebAuthn support:', error);
    return {
      supported: false,
      error: error instanceof Error ? error.message : 'Unknown error checking WebAuthn support'
    };
  }
}

/**
 * Test the registration flow without actually creating a wallet
 */
export async function testWebAuthnRegistration() {
  try {
    console.log('Fetching registration options...');
    
    // Generate a test username
    const username = `test_${Date.now()}`;
    
    // Get registration options
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        username,
        test: true // Indicate this is a test
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get registration options');
    }
    
    const { options } = await response.json();
    console.log('Registration options received', options);
    
    // Trigger the browser's WebAuthn API
    console.log('Starting registration process...');
    const credential = await startRegistration(options);
    console.log('Registration successful!', credential);
    
    return {
      success: true,
      credential
    };
  } catch (error) {
    console.error('Registration test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown registration error'
    };
  }
}

/**
 * Test the authentication flow without actually logging in
 */
export async function testWebAuthnAuthentication() {
  try {
    console.log('Fetching authentication challenge...');
    
    // Get authentication challenge
    const response = await fetch('/api/auth/challenge');
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get authentication challenge');
    }
    
    const { challenge } = await response.json();
    console.log('Authentication challenge received');
    
    // Create authentication options in the format expected by simplewebauthn
    const optionsJSON = {
      challenge: btoa(String.fromCharCode(...challenge)), // Convert Uint8Array to base64
      timeout: 60000,
      rpId: window.location.hostname,
      userVerification: 'required' as const,
      allowCredentials: [],
    };
    
    // Trigger the browser's WebAuthn API
    console.log('Starting authentication process...');
    const credential = await startAuthentication({ optionsJSON });
    console.log('Authentication successful!', credential);
    
    return {
      success: true,
      credential
    };
  } catch (error) {
    console.error('Authentication test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown authentication error'
    };
  }
} 