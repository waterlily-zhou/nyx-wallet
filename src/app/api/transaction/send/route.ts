import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { parseEther, Address } from 'viem';
import { sendTransaction } from '@/lib/wallet/send-transaction';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { supabase } from '@/lib/supabase/server';
import { decryptPrivateKey } from '@/lib/utils/key-encryption';
import { rpID, origin } from '@/lib/utils/user-store';

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
      
      // The challenge in clientData is base64-encoded, so we need to decode it
      const receivedChallenge = Buffer.from(clientData.challenge, 'base64').toString();
      
      console.log('🔍 Challenge Processing:', {
        type: clientData.type,
        origin: clientData.origin,
        rawChallenge: clientData.challenge ? `${clientData.challenge.substring(0, 10)}...` : 'missing',
        decodedChallenge: receivedChallenge ? `${receivedChallenge.substring(0, 10)}...` : 'missing',
        storedChallenge: txChallenge ? `${txChallenge.substring(0, 10)}...` : 'missing'
      });

      // Compare the decoded challenge with our stored challenge
      if (receivedChallenge !== txChallenge) {
        console.log('❌ Challenge mismatch:', {
          stored: txChallenge,
          received: receivedChallenge,
          storedLength: txChallenge?.length,
          receivedLength: receivedChallenge?.length
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
        

        // Ensure credential publicKey is in the correct format
        let publicKeyBuffer: Buffer;
        try {
          // Check if the key is stored in hex format (common in Supabase bytea columns)
          const isHexFormat = /^[0-9a-fA-F]+$/.test(authenticator.credential_public_key);
          
          publicKeyBuffer = isHexFormat
            ? Buffer.from(authenticator.credential_public_key, 'hex')
            : Buffer.from(authenticator.credential_public_key, 'base64');
          
          console.log('✅ Credential_public_key decoded using:', isHexFormat ? 'hex' : 'base64');
          console.log('✅ Credential_public_key length:', publicKeyBuffer.length);
        } catch (e) {
          console.error('❌ Invalid credential_public_key format:', e);
          throw new Error('Invalid credential_public_key format');
        }
        

        
        // Use the verification function with the proper parameters
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

    // 4. Send the transaction
    const result = await sendTransaction(
      walletAddress as Address,
      to as Address,
      parseEther(value).toString() as `0x${string}`,
      data as `0x${string}`,
      gasPaymentMethod
    );

    // Clear the challenge cookies
    cookieStore.delete('txChallenge');
    cookieStore.delete('txData');

    return NextResponse.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Transaction error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send transaction' },
      { status: 500 }
    );
  }
} 