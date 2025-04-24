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
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';
import { AuthenticatorTransportFuture } from '@simplewebauthn/types';
import { toHash } from '@simplewebauthn/server/helpers';

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

// handle credential public key format
function preparePublicKeyForVerification(key: string | Buffer): Buffer {
  try {
    if (Buffer.isBuffer(key)) return key;
    const keyString = key as string;
    
    let jsonData = null;
    let decodedString = keyString;
    
    console.log('🔍 Key type check:', {
      isBuffer: Buffer.isBuffer(key),
      type: typeof keyString,
      startsWithBackslashX: keyString.startsWith('\\x'),
      startsWithEyI: keyString.startsWith('eyI'),
      length: keyString.length
    });
    
    // Handle PostgreSQL bytea format (\x...)
    if (keyString.startsWith('\\x')) {
      console.log('✅ Detected PostgreSQL bytea format');
      const hexString = keyString.substring(2);
      
      // Convert hex to string
      decodedString = '';
      for (let i = 0; i < hexString.length; i += 2) {
        decodedString += String.fromCharCode(parseInt(hexString.substring(i, i + 2), 16));
      }
      
      console.log('🔍 After hex decode:', {
        startsWith: decodedString.substring(0, 10),
        length: decodedString.length,
        isBase64: decodedString.startsWith('eyI')
      });
    }
    
    // Now process the string (which might be the original or hex-decoded)
    // If it's base64-encoded JSON (eyI...)
    if (decodedString.startsWith('eyI')) {
      console.log('✅ Detected base64-encoded JSON');
      
      // Decode the base64 to get the JSON string
      const jsonString = Buffer.from(decodedString, 'base64').toString();
      console.log('🔍 JSON string preview:', jsonString.substring(0, 50));
      
      // Parse the JSON
      jsonData = JSON.parse(jsonString);
      console.log('✅ Parsed JSON with keys:', Object.keys(jsonData).join(', '));
    }
    
    // If we have JSON data, process it properly
    if (jsonData) {
      // Create a proper COSE_Key Map for CBOR encoding
      const cbor = require('cbor');

      // Check if the JSON seems to be array-like with numeric indices
      if ('0' in jsonData && '1' in jsonData && !('-1' in jsonData) && !('-2' in jsonData)) {
        console.log('🔍 Detected array-like credential format, reconstructing COSE key');
        // For array-like data, extract key bytes directly
        const dataView = new Uint8Array(Object.keys(jsonData).length);
        
        // Fill the ArrayBuffer with values from the JSON
        Object.entries(jsonData).forEach(([index, value]) => {
          dataView[parseInt(index)] = Number(value);
        });
        
        console.log('✅ Reconstructed raw credential data of length:', dataView.length);
        return Buffer.from(dataView);
      }
      
      // Standard COSE key format handling
      const coseKeyMap = new Map();
      
      // Convert JSON to Map with proper numeric keys
      for (const [key, value] of Object.entries(jsonData)) {
        // Convert string keys to numbers where possible
        const numKey = !isNaN(Number(key)) ? Number(key) : key;
        coseKeyMap.set(numKey, value);
      }
      
      // FIX: Check key type and fix required parameters
      const keyType = coseKeyMap.get(1); // 1 is kty (key type)
      console.log('🔍 COSE key type (kty):', keyType);
      
      if (keyType === 1) { // OKP key type
        console.log('✅ Detected OKP key type');
        
        // Fix: If alg is 3 for OKP, change it to -8 (EdDSA)
        if (coseKeyMap.get(3) === 3) {
          console.log('⚠️ Fixing invalid algorithm 3 for OKP key to -8 (EdDSA)');
          coseKeyMap.set(3, -8);
        }
        
        // CRITICAL FIX: Ensure curve parameter exists for OKP
        if (!coseKeyMap.has(-1)) {
          console.log('⚠️ Adding missing curve parameter for OKP key');
          coseKeyMap.set(-1, 6); // 6 = Ed25519
        }
        
        // CRITICAL FIX: Ensure x parameter exists for OKP
        if (!coseKeyMap.has(-2)) {
          // Try to find x parameter in JSON data
          // In many implementations, it's stored in key 5 or after key 4
          if (jsonData['5'] !== undefined && Array.isArray(jsonData['5'])) {
            console.log('⚠️ Adding missing x parameter for OKP key from array data at key 5');
            coseKeyMap.set(-2, Buffer.from(jsonData['5']));
          } else {
            // Search for a value that looks like a public key
            for (const [key, value] of Object.entries(jsonData)) {
              if (Array.isArray(value) && value.length >= 32) {
                console.log(`⚠️ Adding missing x parameter for OKP key from array at key ${key}`);
                coseKeyMap.set(-2, Buffer.from(value));
                break;
              }
            }
          }
        }
        
        console.log('🔍 Final parameters: kty:', coseKeyMap.get(1), 
                    'alg:', coseKeyMap.get(3), 
                    'crv:', coseKeyMap.get(-1), 
                    'has x:', coseKeyMap.has(-2));
      }
      
      const encoded = cbor.encode(coseKeyMap);
      console.log('✅ CBOR encoded, length:', encoded.length);
      return encoded;
    }
    
    // Last resort - try direct formats
    console.log('⚠️ No JSON detected, trying direct decoding');
    return Buffer.from(keyString, 'base64');
  } catch (e) {
    console.error('❌ Error preparing public key:', e);
    throw new Error(`Failed to prepare credential public key: ${(e as Error).message}`);
  }
}

// Improved helper function to decode challenges
function decodePgBytea(value: string | null | undefined): string {
  // Handle null/undefined cases
  if (!value) {
    return '';
  }
  
  console.log('🔍 Decoding challenge value:', {
    type: typeof value,
    length: value.length,
    sample: value.substring(0, 10) + '...' + value.substring(value.length - 10),
    isPgBytea: value.startsWith('\\x'),
    isBase64: /^[A-Za-z0-9+/=]+$/.test(value),
    isBase64Url: /^[A-Za-z0-9_-]+$/.test(value)
  });

  // Case 1: PostgreSQL bytea format (\x...)
  if (value.startsWith('\\x')) {
    console.log('✅ Detected PostgreSQL bytea format, converting from hex');
    const hexString = value.substring(2);
    let decodedString = '';
    
    // Convert each hex pair to a character
    for (let i = 0; i < hexString.length; i += 2) {
      decodedString += String.fromCharCode(parseInt(hexString.substring(i, i + 2), 16));
    }
    
    return decodedString;
  }
  
  // Case 2: Base64url format (used by WebAuthn)
  // For base64url, we generally don't need to decode since WebAuthn handles this
  // But we might need to convert between base64url and standard base64
  
  // Return as is, since WebAuthn already handles base64url format
  return value;
}

// Normalize base64url encoding for consistent comparison
function normalizeBase64(value: string): string {
  // Handle null/undefined
  if (!value) return '';
  
  // First, convert to standard base64 if it's in base64url format
  // Replace '-' with '+', '_' with '/', and add padding if needed
  let standardized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  // Add padding if needed
  while (standardized.length % 4) {
    standardized += '=';
  }
  
  // Log the normalization for debugging
  console.log('🔍 Normalizing base64:', {
    original: value.substring(0, 10) + '...',
    standardized: standardized.substring(0, 10) + '...',
    originalLength: value.length,
    standardizedLength: standardized.length
  });
  
  return standardized;
}

// Convert to base64url format (RFC 4648)
function toBase64Url(value: string): string {
  if (!value) return '';
  
  // Convert standard base64 to base64url
  return value
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
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
      gasOption = 'default',
      webauthnResponse
    } = body;

    if (!to || !value || !webauthnResponse) {
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
        id: webauthnResponse.id,
        rawId: webauthnResponse.rawId,
        type: webauthnResponse.type,
        responseKeys: Object.keys(webauthnResponse.response),
        clientExtensionResults: webauthnResponse.clientExtensionResults
      });

      // Parse the WebAuthn response
      const clientDataJSON = Buffer.from(webauthnResponse.response.clientDataJSON, 'base64').toString();
      const clientData = JSON.parse(clientDataJSON);
      
      // Log the decoded client data for debugging
      console.log('🔍 Client Data:', {
        type: clientData.type,
        origin: clientData.origin,
        challenge: clientData.challenge ? `${clientData.challenge.substring(0, 10)}...` : 'missing'
      });
      
      // Get the stored challenge from cookie (already in base64url format)
      const storedChallenge = txChallenge;
      
      // Convert both to byte arrays for comparison
      const storedBytes = Buffer.from(storedChallenge, 'base64url');
      const clientBytes = Buffer.from(clientData.challenge, 'base64');
      
      // Log for debugging
      console.log('🔍 Challenge Bytes Comparison:', {
        storedBytesLength: storedBytes.length,
        clientBytesLength: clientBytes.length,
        equal: storedBytes.equals(clientBytes),
        storedHex: storedBytes.toString('hex').substring(0, 20) + '...',
        clientHex: clientBytes.toString('hex').substring(0, 20) + '...'
      });
      
      // Direct byte comparison
      if (!storedBytes.equals(clientBytes)) {
        console.error('❌ Challenge mismatch');
        throw new Error('Challenge mismatch');
      }
      
      console.log('✅ Challenge verified successfully through byte comparison');

      try {
        // Convert Maps to plain objects in the response
        const safeResponse = mapToPlainObject({
          id: webauthnResponse.id,
          rawId: webauthnResponse.rawId,
          type: 'public-key',
          response: {
            authenticatorData: webauthnResponse.response.authenticatorData,
            clientDataJSON: webauthnResponse.response.clientDataJSON,
            signature: webauthnResponse.response.signature,
            userHandle: webauthnResponse.response.userHandle || null
          },
          clientExtensionResults: {}
        });
        
        console.log('/send/route.ts typeof credential_public_key:', typeof authenticator.credential_public_key);
        console.log('/send/route.ts is Buffer:', Buffer.isBuffer(authenticator.credential_public_key));
        
        // normalise exactly the same way you'll pass to the verifier
        const stored = storedChallenge;
        const client = clientData.challenge;

        // 👇 NEW – dump the raw bytes so we can _see_ the rogue char
        const bufS = Buffer.from(stored , 'base64url');
        const bufC = Buffer.from(client , 'base64');

        console.log('🔬 bytes S:', bufS.toString('hex'));
        console.log('🔬 bytes C:', bufC.toString('hex'));
        console.log('lenS / lenC', bufS.length, bufC.length);

        console.log('equal?', bufS.equals(bufC));

        function decodeBase64String(b64: string): Buffer {
          return Buffer.from(b64, 'base64');
        }

        // Use the specialized function to prepare the public key
        // First decode from PostgreSQL bytea format if necessary
        const credentialKey = authenticator.credential_public_key;
        console.log('🔍 Credential key format:', {
          original: credentialKey ? `${typeof credentialKey === 'string' ? credentialKey.substring(0, 30) : 'Buffer'}...` : 'missing',
          isBytea: typeof credentialKey === 'string' && credentialKey.startsWith('\\x')
        });
        
        // Decode the public key from PostgreSQL bytea format if needed
        const decodedKey = typeof credentialKey === 'string' 
          ? decodePgBytea(credentialKey) 
          : credentialKey;
          
        console.log('🔍 Decoded credential key:', {
          decoded: decodedKey ? (typeof decodedKey === 'string' ? decodedKey.substring(0, 30) : 'Buffer') + '...' : 'missing'
        });
        
        const publicKeyBuffer = preparePublicKeyForVerification(decodedKey);
        
        // Use the verification function with the prepared key
        const verification = await verifyAuthenticationResponse({
          response: safeResponse,
          expectedChallenge: Buffer.from(storedBytes).toString('base64url'),
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
        gasOption
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

// Helper to find the first position where two strings differ
function findFirstDifferenceIndex(str1: string, str2: string): string {
  const minLength = Math.min(str1.length, str2.length);
  
  for (let i = 0; i < minLength; i++) {
    if (str1[i] !== str2[i]) {
      return `Position ${i}: '${str1[i]}' vs '${str2[i]}'`;
    }
  }
  
  if (str1.length !== str2.length) {
    return `Length mismatch: ${str1.length} vs ${str2.length}`;
  }
  
  return 'Identical';
}