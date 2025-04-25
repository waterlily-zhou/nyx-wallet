import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    console.log('supabase client is:', supabase.auth);
    console.log('API: Challenge endpoint called');
    console.log('API: Request URL:', request.url);
    console.log('API: Request headers:', Object.fromEntries(request.headers.entries()));
    
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    console.log('API: Wallet address from cookie:', walletAddress);
    
    // Check if there are any authenticators in Supabase
    let hasAuthenticators = false;
    try {
      console.log('API: Checking for authenticators in Supabase...');
      const { data, error } = await supabase
        .from('authenticators')
        .select('id')
        .limit(1);
      
      if (!error && data && data.length > 0) {
        console.log('API: Found authenticators in Supabase:', data);
        hasAuthenticators = true;
      } else {
        console.log('API: No authenticators found in Supabase. Error:', error);
      }
    } catch (e) {
      console.log('API: Error checking for authenticators in Supabase:', e);
    }
    
    // Generate a random challenge
    const randomBytes = crypto.randomBytes(16);
    const walletHash = walletAddress ? 
      crypto.createHash('sha256').update(walletAddress).digest().slice(0, 16) : 
      crypto.randomBytes(16);
    
    // Combine random bytes and wallet hash
    const challengeData = Buffer.concat([randomBytes, walletHash]);
    const challengeBase64url = challengeData.toString('base64url');
    
    console.log('API: Generated challenge with length:', challengeBase64url.length);
    console.log('🔍 Challenge Debug Info:');
    console.log('  - Raw challenge:', challengeData.toString('hex'));
    console.log('  - Base64URL challenge:', challengeBase64url);
    console.log('  - Challenge Characters:', {
      '+': (challengeBase64url.match(/\+/g) || []).length,
      '/': (challengeBase64url.match(/\//g) || []).length,
      '-': (challengeBase64url.match(/-/g) || []).length,
      '_': (challengeBase64url.match(/_/g) || []).length,
      '=': (challengeBase64url.match(/=/g) || []).length
    });
    
    // Store the challenge and wallet address in cookies for verification
    cookieStore.set('auth_challenge', challengeBase64url, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 300 // 5 minutes
    });
    
    if (walletAddress) {
      cookieStore.set('challenge_wallet', walletAddress, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 300 // 5 minutes
      });
    }

    return NextResponse.json({
      success: true,
      challenge: challengeBase64url,
      walletVerification: !!walletAddress || hasAuthenticators
    });
  } catch (error) {
    console.error('Error generating challenge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate challenge' },
      { status: 500 }
    );
  }
} 