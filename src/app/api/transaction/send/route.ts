import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { parseEther, Address } from 'viem';
import { sendTransaction } from '@/lib/wallet/send-transaction';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { supabase } from '@/lib/supabase/server';
import { decryptPrivateKey } from '@/lib/utils/key-encryption';
import { rpID, origin } from '@/lib/utils/user-store';
import { createSafeAccountClient } from '@/lib/wallet/safe-account';
import { handleDeploymentBeforeTransaction } from '@/lib/wallet/deploy';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClientForSepolia } from '@/lib/client-setup';

// Function to convert Map to plain object recursively
function mapToPlainObject(input: any): any {
  if (input === null || typeof input !== 'object') {
    return input;
  }
  
  if (Array.isArray(input)) {
    return input.map(item => mapToPlainObject(item));
  }
  
  if (input instanceof Map) {
    const result: Record<string, any> = {};
    for (const [key, value] of input.entries()) {
      result[key] = mapToPlainObject(value);
    }
    return result;
  }
  
  const result: Record<string, any> = {};
  for (const key of Object.keys(input)) {
    result[key] = mapToPlainObject(input[key]);
  }
  return result;
}

// Add this function to handle credential public key format
function preparePublicKeyForVerification(key: string | Buffer): Buffer {
  try {
    if (Buffer.isBuffer(key)) return key;
    
    // Key is definitely a string at this point
    const keyString = key as string;
    
    console.log('🔍 Preparing credential public key:', {
      type: typeof keyString,
      startsWithBackslashX: keyString.startsWith('\\x'),
      length: keyString.length,
      preview: keyString.substring(0, 30) + '...'
    });
    
    // Handle PostgreSQL bytea format (\x...)
    if (keyString.startsWith('\\x')) {
      console.log('✅ Detected PostgreSQL bytea format');
      const hexString = keyString.substring(2);
      
      // Convert hex to string
      let decodedString = '';
      for (let i = 0; i < hexString.length; i += 2) {
        decodedString += String.fromCharCode(parseInt(hexString.substring(i, i + 2), 16));
      }
      
      console.log('🔍 Decoded hex to string starting with:', decodedString.substring(0, 10));
      
      // Check if it's base64-encoded JSON
      if (decodedString.startsWith('eyI')) {
        console.log('✅ Detected base64-encoded JSON');
        
        try {
          // Decode the base64 to get the JSON string
          const jsonString = Buffer.from(decodedString, 'base64').toString();
          console.log('🔍 JSON string preview:', jsonString.substring(0, 50));
          
          // Try to parse as JSON
          const jsonObj = JSON.parse(jsonString);
          console.log('✅ Parsed JSON with keys:', Object.keys(jsonObj));
          
          // DEBUG: Log the first few key-value pairs to understand structure
          const firstFewEntries = Object.entries(jsonObj).slice(0, 10);
          console.log('🔍 First few JSON entries:', 
            firstFewEntries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')
          );
          
          // For WebAuthn credential public keys, we need to construct a proper COSE_Key
          // Public key is typically stored in "-2" and "-3" for EC2 keys
          
          // Create a proper COSE_Key Map structure for CBOR encoding
          // IMPORTANT: CBOR encoding requires a Map for proper COSE_Key structure
          const coseKeyMap = new Map();
          
          // Check if the JSON might be a different representation (e.g., a decoded ArrayBuffer)
          if (jsonObj['0'] === 165) { // 165 is 0xA5 in decimal, which often indicates the start of a COSE_Key
            console.log('🔍 Detected array-like COSE_Key structure');
            
            // This appears to be an array representation of a CBOR-encoded COSE_Key
            // Convert it to the actual key-value pair format expected by WebAuthn
            
            // Create a fresh ArrayBuffer
            const dataView = new Uint8Array(Object.keys(jsonObj).length);
            
            // Fill the ArrayBuffer with values from the JSON
            Object.entries(jsonObj).forEach(([index, value]) => {
              dataView[parseInt(index)] = Number(value);
            });
            
            // Log the first few bytes to verify
            console.log('🔍 Recreated ArrayBuffer first 10 bytes:', 
              Array.from(dataView.slice(0, 10)).map(v => v.toString(16).padStart(2, '0')).join(' ')
            );
            
            // Return the buffer directly
            return Buffer.from(dataView);
          }
          
          // Otherwise, proceed with normal COSE_Key Map creation
          for (const [key, value] of Object.entries(jsonObj)) {
            // Convert string keys to numbers where possible
            const numKey = !isNaN(Number(key)) ? Number(key) : key;
            coseKeyMap.set(numKey, value);
          }
          
          // Check the key type (kty)
          const kty = coseKeyMap.get(1);
          console.log('🔍 Original key type (kty):', kty);
          
          // Fix algorithm based on key type
          if (kty === 1) { // OKP keys
            // Algorithm 3 is not valid for OKP keys
            if (coseKeyMap.get(3) === 3) {
              console.log('⚠️ Fixing invalid algorithm for OKP key');
              // Use EdDSA algorithm (-8) for OKP keys
              coseKeyMap.set(3, -8);
            }
            
            // Ensure curve parameter is set for OKP keys
            if (!coseKeyMap.has(-1)) {
              console.log('⚠️ Adding missing curve parameter for OKP key');
              // Set to Ed25519 (6) which is common for WebAuthn
              coseKeyMap.set(-1, 6);
            }
            
            // Ensure we have both x (-2) and d parameters
            if (!coseKeyMap.has(-2) && jsonObj['-2']) {
              coseKeyMap.set(-2, jsonObj['-2']);
            }
            
          } else if (kty === 2) { // EC2 keys
            // Ensure we have ES256 algorithm (-7) for EC2 keys
            if (!coseKeyMap.has(3) || coseKeyMap.get(3) !== -7) {
              console.log('⚠️ Setting algorithm to ES256 for EC2 key');
              coseKeyMap.set(3, -7);
            }
          } else if (!coseKeyMap.has(1)) {
            // If key type is missing, set it based on what appears to be in the credential
            if (coseKeyMap.has(-1) || coseKeyMap.has(-2)) {
              // Has EC2 parameters
              console.log('⚠️ Setting missing key type to EC2 (2)');
              coseKeyMap.set(1, 2);
              // Ensure algorithm is set for EC2
              if (!coseKeyMap.has(3)) {
                coseKeyMap.set(3, -7); // ES256
              }
            } else {
              // Default to OKP if we can't determine
              console.log('⚠️ Setting default key type to OKP (1) and algorithm to EdDSA (-8)');
              coseKeyMap.set(1, 1);
              coseKeyMap.set(3, -8);
            }
          }
          
          // Log the COSE key Map entries
          console.log('🔍 COSE_Key Map keys:', Array.from(coseKeyMap.keys()));
          console.log('🔍 Fixed key type (kty):', coseKeyMap.get(1));
          console.log('🔍 Fixed algorithm (alg):', coseKeyMap.get(3));
          
          // Now use the CBOR library to properly encode the COSE key
          const cbor = require('cbor');
          const coseKeyBuffer = cbor.encode(coseKeyMap);
          
          console.log('✅ Successfully encoded as CBOR (first 10 bytes):', coseKeyBuffer.subarray(0, 10).toString('hex'));
          return coseKeyBuffer;
        } catch (jsonError) {
          console.error('❌ Failed to process as JSON:', jsonError);
          // Fall back to treating the base64 as raw credential data
          return Buffer.from(decodedString, 'base64');
        }
      }
      
      // If the decoded string looks like base64 but isn't JSON
      if (/^[A-Za-z0-9+/=]+$/.test(decodedString)) {
        console.log('✅ Treating as base64-encoded data');
        try {
          return Buffer.from(decodedString, 'base64');
        } catch (e) {
          console.error('❌ Failed to decode as base64:', e);
        }
      }
      
      // Direct hex conversion as a fallback
      console.log('⚠️ Falling back to direct hex conversion');
      return Buffer.from(hexString, 'hex');
    }
    
    // Handle standard hex format without \x prefix
    const isHexFormat = /^[0-9a-fA-F]+$/.test(keyString);
    if (isHexFormat) {
      console.log('✅ Converting hex format credential');
      return Buffer.from(keyString, 'hex');
    }
    
    // Check for direct JSON string
    if (keyString.startsWith('{') && keyString.endsWith('}')) {
      try {
        console.log('🔍 Detected direct JSON string');
        const jsonObj = JSON.parse(keyString);
        console.log('✅ Parsed JSON with keys:', Object.keys(jsonObj));
        
        // Try to convert to COSE format
        const cbor = require('cbor');
        const coseKeyBuffer = cbor.encode(jsonObj);
        return coseKeyBuffer;
      } catch (jsonError) {
        console.error('❌ Failed to parse direct JSON:', jsonError);
      }
    }
    
    // Handle base64 format as last resort
    console.log('⚠️ Trying as base64 format credential');
    return Buffer.from(keyString, 'base64');
  } catch (e) {
    console.error('❌ Failed to prepare public key:', e);
    console.error('Key format:', typeof key === 'string' ? key.substring(0, 100) : 'Buffer');
    throw new Error('Invalid credential public key format');
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    const userId = cookieStore.get('userId')?.value;
    const txChallenge = cookieStore.get('txChallenge')?.value;
    const txData = cookieStore.get('txData')?.value;
    
    if (!walletAddress || !userId) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 401 }
      );
    }

    if (!txChallenge || !txData) {
      return NextResponse.json(
        { success: false, error: 'Transaction challenge not found' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      to, 
      value, 
      data, 
      gasPaymentMethod = 'default',
      webAuthnResponse
    } = body;

    if (!to || !value || !webAuthnResponse) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // 1. Get the user's active authenticator
    const { data: authenticator } = await supabase
      .from('authenticators')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (!authenticator) {
      return NextResponse.json(
        { success: false, error: 'No active authenticator found' },
        { status: 401 }
      );
    }

    // 2. Verify WebAuthn signature
    try {
      // Log verification details for debugging
      console.log('🔍 Transaction Verification:', {
        expectedChallenge: txChallenge ? `${txChallenge.substring(0, 10)}...${txChallenge.substring(txChallenge.length - 10)}` : 'missing',
        credentialID: authenticator.credential_id,
        origin,
        rpID
      });

      // Log the WebAuthn response format
      console.log('🔍 WebAuthn Response Format:', {
        id: webAuthnResponse.id,
        rawId: webAuthnResponse.rawId,
        type: webAuthnResponse.type,
        responseKeys: Object.keys(webAuthnResponse.response),
        clientExtensionResults: webAuthnResponse.clientExtensionResults
      });

      // Parse the WebAuthn response
      const clientDataJSON = Buffer.from(webAuthnResponse.response.clientDataJSON, 'base64').toString();
      const clientData = JSON.parse(clientDataJSON);
      
      // Log the decoded client data for debugging
      console.log('🔍 Client Data:', {
        type: clientData.type,
        origin: clientData.origin,
        challenge: clientData.challenge ? `${clientData.challenge.substring(0, 10)}...` : 'missing'
      });
      
      console.log('🔍 Challenge Processing:', {
        rawClientChallenge: clientData.challenge ? `${clientData.challenge.substring(0, 10)}...` : 'missing',
        storedChallenge: txChallenge ? `${txChallenge.substring(0, 10)}...` : 'missing',
        clientChallengeLength: clientData.challenge?.length,
        storedChallengeLength: txChallenge?.length
      });

      // IMPORTANT: Fix for challenge comparison - use the raw clientData.challenge
      // The browser already encoded this correctly, so we should compare directly with stored value
      if (clientData.challenge !== txChallenge) {
        console.log('❌ Challenge mismatch:', {
          stored: txChallenge,
          received: clientData.challenge,
          storedLength: txChallenge?.length,
          receivedLength: clientData.challenge?.length
        });
        throw new Error('Challenge mismatch');
      }

      console.log('✅ Challenge verified successfully');

      try {
        // Convert Maps to plain objects in the response
        const safeResponse = mapToPlainObject({
          id: webAuthnResponse.id,
          rawId: webAuthnResponse.rawId,
          type: 'public-key',
          response: {
            authenticatorData: webAuthnResponse.response.authenticatorData,
            clientDataJSON: webAuthnResponse.response.clientDataJSON,
            signature: webAuthnResponse.response.signature,
            userHandle: webAuthnResponse.response.userHandle || null
          },
          clientExtensionResults: {}
        });
        
        console.log('/send/route.ts typeof credential_public_key:', typeof authenticator.credential_public_key);
        console.log('/send/route.ts is Buffer:', Buffer.isBuffer(authenticator.credential_public_key));
        

        function decodeBase64String(b64: string): Buffer {
          return Buffer.from(b64, 'base64');
        }

        // Use the specialized function to prepare the public key
        const publicKeyBuffer = preparePublicKeyForVerification(authenticator.credential_public_key);
        
        // Use the verification function with the prepared key
        const verification = await verifyAuthenticationResponse({
          response: safeResponse,
          expectedChallenge: clientData.challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: true,
          credential: {
            publicKey: publicKeyBuffer,
            id: authenticator.credential_id,
            counter: authenticator.counter || 0
          }
        });

        console.log('✅ WebAuthn verification successful!');
        
        // Update authenticator counter
        await supabase
          .from('authenticators')
          .update({ 
            counter: verification.authenticationInfo.newCounter,
            last_used: new Date().toISOString()
          })
          .eq('id', authenticator.id);
      
      } catch (error) {
        console.error('WebAuthn verification error:', error);
        
        // Log additional debugging information
        console.log('🔍 Debugging verification error:', {
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        
        throw new Error(`WebAuthn verification failed: ${error instanceof Error ? error.message : String(error)}`);
      }

    } catch (error) {
      console.error('WebAuthn verification failed:', error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Authentication failed' },
        { status: 401 }
      );
    }

    // 3. Verify transaction data matches
    const storedTxData = JSON.parse(txData);
    if (
      storedTxData.to !== to ||
      storedTxData.value !== value ||
      storedTxData.data !== data
    ) {
      return NextResponse.json(
        { success: false, error: 'Transaction data mismatch' },
        { status: 401 }
      );
    }

    // After WebAuthn verification, before sending the transaction
    // Use the handleDeploymentBeforeTransaction function to check and deploy if needed
    try {
      console.log('Checking if smart account is deployed...');
      
      // Call the centralized deployment handler
      const deploymentResult = await handleDeploymentBeforeTransaction(
        userId,
        walletAddress as Address
      );
      
      if (!deploymentResult) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Failed to ensure wallet deployment. Please try again.',
            needsDeployment: true 
          },
          { status: 400 }
        );
      }
      
      // Now proceed with the transaction
      console.log('Sending transaction...');
      const result = await sendTransaction(
        walletAddress as Address,
        to as Address,
        parseEther(value).toString() as `0x${string}`,
        data as `0x${string}`,
        gasPaymentMethod
      );
      
      // Clean up challenge cookies
      cookieStore.delete('txChallenge');
      cookieStore.delete('txData');

      return NextResponse.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error in transaction processing:', error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Transaction error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send transaction' },
      { status: 500 }
    );
  }
} 