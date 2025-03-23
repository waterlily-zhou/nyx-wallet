import Router from 'koa-router';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { 
  createSmartAccountFromPrivateKey, 
  createSmartAccountFromCredential, 
  createUser, 
  findUserById, 
  findUserByWalletAddress, 
  generateRandomPrivateKey, 
  rpID, 
  rpName, 
  origin, 
  updateUserCredentials, 
  userAccounts, 
  type UserAccount,
  signTransactionWithBiometrics
} from '../utils/auth-utils.js';

const router = new Router({ prefix: '/api/auth' });

// Middleware to check if user is authenticated
async function requireAuth(ctx: any, next: () => Promise<any>) {
  if (!ctx.session || !ctx.session.userId) {
    ctx.status = 401;
    ctx.body = { error: 'Authentication required' };
    return;
  }
  
  const user = findUserById(ctx.session.userId);
  if (!user) {
    ctx.status = 401;
    ctx.body = { error: 'User not found' };
    return;
  }
  
  ctx.state.user = user;
  await next();
}

// Check if user has registered biometrics
router.get('/biometric/check', async (ctx: any) => {
  // Get device ID from cookies or generate a new one
  const deviceId = ctx.cookies.get('deviceId') || crypto.randomUUID();
  
  // Set deviceId cookie if it doesn't exist
  if (!ctx.cookies.get('deviceId')) {
    ctx.cookies.set('deviceId', deviceId, { 
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
    });
  }
  
  // Check if any user has registered this device
  const registeredUser = userAccounts.find(user => 
    user.credentials?.some(cred => cred.deviceId === deviceId)
  );
  
  // Log current user accounts and device ID for debugging
  console.log(`Checking biometric registration for device: ${deviceId}`);
  console.log(`User accounts count: ${userAccounts.length}`);
  console.log(`Registered user found: ${!!registeredUser}`);
  
  if (registeredUser) {
    console.log(`Found registered user: ${registeredUser.id}, wallet address: ${registeredUser.walletAddress}`);
  }
  
  // Important: If this is a WebAuthn capable device but no registration found,
  // we should allow the user to register biometrics for an existing wallet
  const isWebAuthnDevice = ctx.request.headers['sec-webauthn-available'] === 'true' || 
                          ctx.request.headers['webauthn-support'] === 'true';
  
  ctx.body = {
    registered: !!registeredUser,
    deviceId,
    isWebAuthnDevice,
    // If there's a registered user, include the wallet address
    walletAddress: registeredUser ? registeredUser.walletAddress : null
  };
});

// Get WebAuthn registration options
router.post('/biometric/register/options', async (ctx: any) => {
  try {
    const { forExistingAccount } = ctx.request.body || {};
    
    // If this is for an existing account, check if the user is logged in
    if (forExistingAccount) {
      if (!ctx.session.userId) {
        ctx.status = 401;
        ctx.body = { error: 'Authentication required' };
        return;
      }
      
      const user = findUserById(ctx.session.userId);
      if (!user) {
        ctx.status = 401;
        ctx.body = { error: 'User not found' };
        return;
      }
      
      // Use the existing user ID
      ctx.session.tempUserId = user.id;
      console.log(`Using existing user ID for biometric registration: ${user.id}`);
    } else {
      // Create temporary user ID if not in session (for new accounts)
      if (!ctx.session.tempUserId) {
        ctx.session.tempUserId = crypto.randomUUID();
      }
    }
    
    const userId = ctx.session.tempUserId;
    const deviceId = ctx.cookies.get('deviceId') || crypto.randomUUID();
    
    // Set deviceId cookie if it doesn't exist
    if (!ctx.cookies.get('deviceId')) {
      ctx.cookies.set('deviceId', deviceId, { 
        httpOnly: true,
        maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
      });
    }
    
    // Convert userId to Uint8Array as required by the WebAuthn library
    const userIdBuffer = new TextEncoder().encode(userId);
    
    // Get registration options
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: userIdBuffer,
      userName: `user_${userId.slice(0, 6)}`,
      attestationType: 'none',
      authenticatorSelection: {
        userVerification: 'preferred',
        residentKey: 'required',
        authenticatorAttachment: 'platform' // Use platform authenticator (TouchID, FaceID)
      }
    });
    
    // Store challenge in session
    ctx.session.challenge = options.challenge;
    ctx.session.forExistingAccount = forExistingAccount;
    
    ctx.body = options;
  } catch (error) {
    console.error('Error generating registration options:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to generate registration options',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Complete WebAuthn registration
router.post('/biometric/register/complete', async (ctx: any) => {
  try {
    const { body } = ctx.request;
    const forExistingAccount = ctx.session.forExistingAccount || body.forExistingAccount;
    
    // Verify tempUserId exists
    if (!ctx.session.tempUserId) {
      ctx.status = 400;
      ctx.body = { error: 'No registration in progress' };
      return;
    }
    
    // Verify challenge exists
    if (!ctx.session.challenge) {
      ctx.status = 400;
      ctx.body = { error: 'Registration challenge not found' };
      return;
    }
    
    const expectedChallenge = ctx.session.challenge;
    const userId = ctx.session.tempUserId;
    
    // Add client extension results if missing (WebAuthn requires this)
    if (!body.clientExtensionResults) {
      body.clientExtensionResults = {};
    }
    
    console.log('Processing registration verification for user:', userId);
    
    // Verify registration response
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID
    });
    
    if (!verification.verified) {
      ctx.status = 400;
      ctx.body = { error: 'Verification failed' };
      return;
    }
    
    // Get the authenticator data
    const { registrationInfo } = verification;
    if (!registrationInfo) {
      ctx.status = 400;
      ctx.body = { error: 'Registration info missing' };
      return;
    }
    
    // Create credential object - safely handle the registrationInfo properties
    const credential = {
      id: body.id,
      publicKey: registrationInfo.credentialPublicKey 
        ? Buffer.from(registrationInfo.credentialPublicKey).toString('base64')
        : registrationInfo.credential && registrationInfo.credential.publicKey 
          ? registrationInfo.credential.publicKey
          : null,
      counter: typeof registrationInfo.counter === 'number' ? registrationInfo.counter : 0,
      deviceId: ctx.cookies.get('deviceId')
    };
    
    // Check if credential has a valid publicKey
    if (!credential.publicKey) {
      console.error('Failed to extract public key from registration info:', registrationInfo);
      ctx.status = 400;
      ctx.body = { error: 'Invalid credential data' };
      return;
    }
    
    let user = findUserById(userId);
    
    // For existing accounts, just add the credential to the user
    if (forExistingAccount && user) {
      console.log(`Adding biometric credential to existing user: ${userId}`);
      updateUserCredentials(userId, credential);
      
      ctx.body = {
        success: true,
        message: 'Biometric authentication added to your account',
        wallet: {
          address: user.walletAddress,
          type: 'smart-account'
        }
      };
    } else {
      // For new accounts, create a new wallet
      try {
        console.log('Creating smart account for new user with biometrics');
        const { address, privateKey } = await createSmartAccountFromCredential(userId, 'biometric');
        console.log(`Smart account created: ${address}`);
        
        // Create new user or update existing user
        if (!user) {
          user = createUser(`user_${userId.slice(0, 6)}`, 'biometric', address, privateKey);
          user.id = userId; // Use tempUserId as the actual userId
        }
        
        // Add credential to user
        updateUserCredentials(userId, credential);
        
        // Set session
        ctx.session.userId = user.id;
        
        ctx.body = {
          success: true,
          wallet: {
            address,
            type: 'smart-account'
          }
        };
      } catch (error) {
        console.error('Error creating smart account:', error);
        throw error;
      }
    }
    
    // Clean up session
    delete ctx.session.tempUserId;
    delete ctx.session.challenge;
    delete ctx.session.forExistingAccount;
    
  } catch (error) {
    console.error('Error verifying registration:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to complete registration',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Get WebAuthn authentication options
router.post('/biometric/authenticate/options', async (ctx: any) => {
  try {
    const deviceId = ctx.cookies.get('deviceId');
    
    if (!deviceId) {
      ctx.status = 400;
      ctx.body = { error: 'No device ID found' };
      return;
    }
    
    // Find user with this device
    const user = userAccounts.find(u => 
      u.credentials?.some(cred => cred.deviceId === deviceId)
    );
    
    if (!user) {
      ctx.status = 404;
      ctx.body = { error: 'No registered user found for this device' };
      return;
    }
    
    // Get credentials for this device
    const credentials = user.credentials?.filter(cred => cred.deviceId === deviceId) || [];
    
    if (credentials.length === 0) {
      ctx.status = 404;
      ctx.body = { error: 'No credentials found for this device' };
      return;
    }
    
    // Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map(cred => ({
        id: cred.id,
        transports: ['internal'],
        type: 'public-key'
      })),
      userVerification: 'preferred'
    });
    
    // Store expected challenge and user ID
    ctx.session.challenge = options.challenge;
    ctx.session.expectedUserId = user.id;
    
    ctx.body = options;
  } catch (error) {
    console.error('Error generating authentication options:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to generate authentication options',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Complete WebAuthn authentication
router.post('/biometric/authenticate/complete', async (ctx: any) => {
  try {
    const { body } = ctx.request;
    
    // Verify challenge exists
    if (!ctx.session.challenge) {
      ctx.status = 400;
      ctx.body = { error: 'Authentication challenge not found' };
      return;
    }
    
    // Verify expectedUserId exists
    if (!ctx.session.expectedUserId) {
      ctx.status = 400;
      ctx.body = { error: 'Expected user not found' };
      return;
    }
    
    // Add client extension results if missing (WebAuthn requires this)
    if (!body.clientExtensionResults) {
      body.clientExtensionResults = {};
    }
    
    const expectedChallenge = ctx.session.challenge;
    const userId = ctx.session.expectedUserId;
    
    // Find user
    const user = findUserById(userId);
    if (!user) {
      ctx.status = 404;
      ctx.body = { error: 'User not found' };
      return;
    }
    
    // Find credential
    const credential = user.credentials?.find(cred => cred.id === body.id);
    if (!credential) {
      ctx.status = 404;
      ctx.body = { error: 'Credential not found' };
      return;
    }
    
    console.log('Processing authentication for user:', userId);
    console.log('Credential found:', credential.id);
    console.log('Counter value:', credential.counter);
    
    // Ensure credential has necessary properties and initialize if missing
    if (credential.publicKey === undefined || credential.publicKey === null) {
      ctx.status = 400;
      ctx.body = { error: 'Credential is missing public key' };
      return;
    }
    
    // Ensure counter exists and is a number
    if (credential.counter === undefined || credential.counter === null) {
      // Initialize counter if it doesn't exist
      credential.counter = 0;
      // Save this change to ensure it persists
      updateUserCredentials(userId, credential);
    }
    
    // The publicKey needs to be in the original binary format as provided by the authenticator
    // When it's stored as a base64 string, convert back to Buffer carefully
    let publicKey: Buffer;
    try {
      if (typeof credential.publicKey === 'string') {
        // Convert base64 string back to Buffer
        publicKey = Buffer.from(credential.publicKey, 'base64');
      } else if (Buffer.isBuffer(credential.publicKey)) {
        // Already a Buffer, use as is
        publicKey = credential.publicKey;
      } else if (credential.publicKey instanceof Uint8Array) {
        // Uint8Array, convert to Buffer
        publicKey = Buffer.from(credential.publicKey);
      } else {
        // If it's an object representation of bytes (e.g., {"0": 165, "1": 1, ...})
        // Convert to Buffer appropriately
        const bytesArray = Object.values(credential.publicKey as Record<string, number>);
        if (Array.isArray(bytesArray) && bytesArray.length > 0) {
          publicKey = Buffer.from(bytesArray);
        } else {
          throw new Error('Invalid credential public key format');
        }
      }
    } catch (error: any) {
      console.error('Error processing credential public key:', error);
      ctx.status = 400;
      ctx.body = { error: 'Invalid credential format', details: error.message };
      return;
    }
    
    // Log the verification input for debugging (but omit the actual key for security)
    const verificationInput = {
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credential.id,
        publicKey,
        counter: credential.counter
      }
    };
    
    console.log('Authentication data:', JSON.stringify({
      ...verificationInput,
      credential: {
        ...verificationInput.credential,
        publicKey: '<omitted for logging>'
      }
    }, null, 2));
    
    // Wrap the verification in a more robust try/catch
    let verification;
    try {
      // Verify authentication response
      verification = await verifyAuthenticationResponse(verificationInput);
      
      if (!verification.verified) {
        ctx.status = 400;
        ctx.body = { error: 'Verification failed' };
        return;
      }
      
      // Update the counter after successful verification if authenticationInfo is available
      if (verification.authenticationInfo && typeof verification.authenticationInfo.newCounter === 'number') {
        credential.counter = verification.authenticationInfo.newCounter;
        // Make sure to save the updated counter
        updateUserCredentials(userId, credential);
      }
      
      // Set authenticated session
      ctx.session.userId = userId;
      ctx.session.authenticated = true;
      
      ctx.body = {
        success: true,
        user: {
          id: user.id,
          walletAddress: user.walletAddress
        }
      };
    } catch (error: any) {
      console.error('WebAuthn verification error:', error);
      
      // Handle specific counter error that occurs after logout
      if (error.message && error.message.includes("Cannot read properties of undefined (reading 'counter')")) {
        ctx.status = 401;
        ctx.body = { 
          error: 'Session expired or invalid. Please try again.',
          code: 'SESSION_EXPIRED'
        };
        
        // Clear the challenge and expected user ID to force a fresh start
        delete ctx.session.challenge;
        delete ctx.session.expectedUserId;
        return;
      }
      
      // Handle CBOR decoding errors
      if (error.message && (error.message.includes("No data") || error.message.includes("CBOR"))) {
        ctx.status = 400;
        ctx.body = { 
          error: 'Authentication failed due to credential format issue. Try registering your device again.',
          code: 'CREDENTIAL_FORMAT_ERROR'
        };
        return;
      }
      
      // General error response
      ctx.status = 400;
      ctx.body = { 
        error: 'Authentication verification failed', 
        details: error.message 
      };
      return;
    }
    
    // Clean up session variables used for the authentication process
    delete ctx.session.challenge;
    delete ctx.session.expectedUserId;
  } catch (error: any) {
    console.error('Error authenticating with biometrics:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to authenticate with biometrics',
      details: error.message
    };
  }
});

// Get WebAuthn transaction signing options
router.post('/biometric/transaction/options', requireAuth, async (ctx) => {
  try {
    const { challenge } = ctx.request.body as any;
    
    if (!challenge) {
      ctx.status = 400;
      ctx.body = { error: 'Challenge is required' };
      return;
    }
    
    const user = ctx.state.user as UserAccount;
    
    // Get all user credentials
    const credentials = user.credentials || [];
    
    if (credentials.length === 0) {
      ctx.status = 404;
      ctx.body = { error: 'No credentials found for this user' };
      return;
    }
    
    // Generate authentication options with properly formatted credential IDs
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map(cred => ({
        id: cred.id, // Use the base64url ID string directly
        transports: ['internal'] as any, // Type assertion to satisfy TS
        type: 'public-key'
      })),
      userVerification: 'required', // Require verification for transactions
      challenge: Buffer.from(challenge, 'base64') // Use the provided challenge
    });
    
    // Store expected challenge and transaction data
    ctx.session.transactionChallenge = options.challenge;
    
    ctx.body = options;
  } catch (error) {
    console.error('Error generating transaction signing options:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to generate transaction signing options',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Verify transaction signed with biometrics
router.post('/biometric/transaction/verify', requireAuth, async (ctx) => {
  try {
    const { id, rawId, response, transactionHash, type, clientExtensionResults = {} } = ctx.request.body as any;
    
    // Verify challenge exists
    if (!ctx.session.transactionChallenge) {
      ctx.status = 400;
      ctx.body = { error: 'Transaction challenge not found' };
      return;
    }
    
    const expectedChallenge = ctx.session.transactionChallenge;
    const user = ctx.state.user as UserAccount;
    
    // Find credential
    const credential = user.credentials?.find(cred => cred.id === id);
    if (!credential) {
      ctx.status = 404;
      ctx.body = { error: 'Credential not found' };
      return;
    }
    
    // Ensure counter exists and is a number
    if (credential.counter === undefined || credential.counter === null) {
      credential.counter = 0;
    }
    
    // The publicKey needs to be in the original binary format as provided by the authenticator
    // When it's stored as a base64 string, convert back to Buffer carefully
    let publicKey: Buffer;
    try {
      if (typeof credential.publicKey === 'string') {
        // Convert base64 string back to Buffer
        publicKey = Buffer.from(credential.publicKey, 'base64');
      } else if (Buffer.isBuffer(credential.publicKey)) {
        // Already a Buffer, use as is
        publicKey = credential.publicKey;
      } else if (credential.publicKey instanceof Uint8Array) {
        // Uint8Array, convert to Buffer
        publicKey = Buffer.from(credential.publicKey);
      } else {
        // If it's an object representation of bytes (e.g., {"0": 165, "1": 1, ...})
        // Convert to Buffer appropriately
        const bytesArray = Object.values(credential.publicKey as Record<string, number>);
        if (Array.isArray(bytesArray) && bytesArray.length > 0) {
          publicKey = Buffer.from(bytesArray);
        } else {
          throw new Error('Invalid credential public key format');
        }
      }
    } catch (error: any) {
      console.error('Error processing credential public key:', error);
      ctx.status = 400;
      ctx.body = { error: 'Invalid credential format', details: error.message };
      return;
    }
    
    // Verify authentication response with the proper credential structure
    try {
      const verification = await verifyAuthenticationResponse({
        response: { id, rawId, response, type, clientExtensionResults },
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey,
          counter: credential.counter
        }
      });
      
      if (!verification.verified) {
        ctx.status = 400;
        ctx.body = { error: 'Verification failed' };
        return;
      }
      
      // Update credential counter
      if (verification.authenticationInfo && verification.authenticationInfo.newCounter) {
        credential.counter = verification.authenticationInfo.newCounter;
        // Make sure to persist the updated counter
        updateUserCredentials(user.id, credential);
      }
      
      // Call function to sign transaction with user's key
      const signResult = await signTransactionWithBiometrics(user.id, transactionHash);
      
      // Clean up session
      delete ctx.session.transactionChallenge;
      
      ctx.body = {
        success: true,
        signature: signResult.signature
      };
    } catch (error: any) {
      console.error('WebAuthn verification error:', error);
      
      // Handle CBOR decoding errors
      if (error.message && (error.message.includes("No data") || error.message.includes("CBOR"))) {
        ctx.status = 400;
        ctx.body = { 
          error: 'Transaction verification failed due to credential format issue. Try registering your device again.',
          code: 'CREDENTIAL_FORMAT_ERROR'
        };
        return;
      }
      
      throw error; // Re-throw to be caught by the outer catch
    }
  } catch (error: any) {
    console.error('Error verifying transaction signature:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to verify transaction signature',
      details: error.message
    };
  }
});

// Google OAuth login
router.get('/google', async (ctx) => {
  ctx.body = { message: 'Google OAuth to be implemented' };
});

// Google OAuth callback
router.get('/google/callback', async (ctx) => {
  ctx.body = { message: 'Google OAuth callback to be implemented' };
});

// WeChat OAuth login
router.get('/wechat', async (ctx) => {
  ctx.body = { message: 'WeChat OAuth to be implemented' };
});

// WeChat OAuth callback
router.get('/wechat/callback', async (ctx) => {
  ctx.body = { message: 'WeChat OAuth callback to be implemented' };
});

// Get current user
router.get('/user', requireAuth, async (ctx) => {
  const user = ctx.state.user as UserAccount;
  
  ctx.body = {
    id: user.id,
    username: user.username,
    walletAddress: user.walletAddress,
    authType: user.authType,
    createdAt: user.createdAt
  };
});

// Logout
router.post('/logout', async (ctx) => {
  try {
    // Clear session data
    if (ctx.session) {
      Object.keys(ctx.session).forEach(key => {
        delete ctx.session[key];
      });
    }
    
    // Clear cookies that might be used for authentication
    // Note: This doesn't completely clear deviceId as we might want to keep device association
    // But we set a flag in the cookie to indicate logout occurred
    const deviceId = ctx.cookies.get('deviceId');
    if (deviceId) {
      // Re-set the deviceId cookie with updated metadata indicating logout
      ctx.cookies.set('deviceId', deviceId, {
        httpOnly: true,
        maxAge: 365 * 24 * 60 * 60 * 1000, // Keep the 1 year expiry
        overwrite: true
      });
    }
    
    // Optionally clear other auth-related cookies if you have them
    // ctx.cookies.set('other_auth_cookie', null); 
    
    console.log('User logged out successfully');
    
    ctx.body = { 
      success: true,
      message: 'Logged out successfully'
    };
  } catch (error) {
    console.error('Logout error:', error);
    ctx.status = 500;
    ctx.body = { 
      success: false,
      error: 'Failed to complete logout',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

export default router; 