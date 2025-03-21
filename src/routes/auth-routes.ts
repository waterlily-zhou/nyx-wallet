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
  
  ctx.body = {
    registered: !!registeredUser,
    deviceId
  };
});

// Get WebAuthn registration options
router.post('/biometric/register/options', async (ctx: any) => {
  try {
    // Create temporary user ID if not in session
    if (!ctx.session.tempUserId) {
      ctx.session.tempUserId = crypto.randomUUID();
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
    
    // Create credential object - adjust property access based on updated WebAuthn library
    const credential = {
      id: body.id,
      // Access credentialPublicKey and counter from the new structure
      publicKey: registrationInfo.credentialPublicKey || registrationInfo.credential?.publicKey,
      counter: registrationInfo.counter || 0,
      deviceId: ctx.cookies.get('deviceId')
    };
    
    // Create smart account from biometric credentials
    const { address, privateKey } = await createSmartAccountFromCredential(userId, 'biometric');
    
    // Create new user or update existing user
    let user = findUserById(userId);
    if (!user) {
      user = createUser(`user_${userId.slice(0, 6)}`, 'biometric', address, privateKey);
      user.id = userId; // Use tempUserId as the actual userId
    }
    
    // Add credential to user
    updateUserCredentials(userId, credential);
    
    // Set session
    ctx.session.userId = user.id;
    delete ctx.session.tempUserId;
    delete ctx.session.challenge;
    
    ctx.body = {
      success: true,
      wallet: {
        address,
        type: 'smart-account'
      }
    };
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
        id: cred.id, // Pass the ID as is - the library will handle conversion
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
    
    // Verify authentication response
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      authenticator: {
        credentialID: Buffer.from(credential.id, 'base64'),
        credentialPublicKey: credential.publicKey,
        counter: credential.counter
      }
    });
    
    if (!verification.verified) {
      ctx.status = 400;
      ctx.body = { error: 'Verification failed' };
      return;
    }
    
    // Update credential counter
    credential.counter = verification.authenticationInfo.newCounter;
    
    // Set session
    ctx.session.userId = user.id;
    delete ctx.session.challenge;
    delete ctx.session.expectedUserId;
    
    ctx.body = {
      success: true,
      wallet: {
        address: user.walletAddress,
        type: 'smart-account'
      }
    };
  } catch (error) {
    console.error('Error verifying authentication:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to complete authentication',
      details: error instanceof Error ? error.message : 'Unknown error'
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
    
    // Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map(cred => ({
        id: Buffer.from(cred.id, 'base64'),
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
    const { id, rawId, response, transactionHash, type } = ctx.request.body as any;
    
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
    
    // Verify authentication response
    const verification = await verifyAuthenticationResponse({
      response: { id, rawId, response, type },
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: Buffer.from(credential.id, 'base64'),
        credentialPublicKey: credential.publicKey,
        counter: credential.counter
      }
    });
    
    if (!verification.verified) {
      ctx.status = 400;
      ctx.body = { error: 'Verification failed' };
      return;
    }
    
    // Update credential counter
    credential.counter = verification.authenticationInfo.newCounter;
    
    // Call function to sign transaction with user's key
    const signResult = await signTransactionWithBiometrics(user.id, transactionHash);
    
    // Clean up session
    delete ctx.session.transactionChallenge;
    
    ctx.body = {
      success: true,
      signature: signResult.signature
    };
  } catch (error) {
    console.error('Error verifying transaction signature:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to verify transaction signature',
      details: error instanceof Error ? error.message : 'Unknown error'
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
  ctx.session = null;
  ctx.body = { success: true };
});

export default router; 