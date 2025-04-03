import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { generateRandomPrivateKey } from '@/lib/utils/key-encryption';
import { createUser } from '@/lib/utils/user-store';
import { type Address } from 'viem';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Simple wallet creation endpoint called');
    
    // Get username from request
    const body = await request.json();
    const { username } = body;
    
    if (!username) {
      console.log('API: Username missing');
      return NextResponse.json({ 
        success: false, 
        error: 'Username is required' 
      }, { status: 400 });
    }
    
    // Create a new user
    const newUser = createUser(username, 'direct');
    console.log(`API: Created new user: ${newUser.id} (${username})`);
    
    // Generate a simple private key (normally we'd use DKG but this is a fallback)
    const privateKey = generateRandomPrivateKey();
    console.log('API: Generated simple private key');
    
    // Generate a recovery key (this would normally be derived from the DKG process)
    const recoveryKey = randomBytes(32).toString('hex');
    console.log('API: Generated recovery key');
    
    // In a full implementation, we would create a real wallet from the private key
    // For demo purposes, we're just using a mock address
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678' as Address;
    console.log(`API: Using mock wallet address: ${walletAddress}`);
    
    // Set session cookies
    const cookieStore = cookies();
    cookieStore.set('session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    cookieStore.set('walletAddress', walletAddress, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    // Return success with the recovery key (ONLY ONCE!)
    return NextResponse.json({
      success: true,
      message: 'Simple wallet created successfully',
      recoveryKey,
      walletAddress
    });
    
  } catch (error) {
    console.error('API: Simple wallet creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create simple wallet' },
      { status: 500 }
    );
  }
} 