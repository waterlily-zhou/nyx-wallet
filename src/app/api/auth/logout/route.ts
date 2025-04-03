import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    console.log('Logout endpoint called');
    const cookieStore = cookies();
    
    // Clear all auth-related cookies
    cookieStore.delete('session');
    cookieStore.delete('walletAddress');
    cookieStore.delete('auth_challenge');
    
    console.log('User logged out successfully');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Error during logout:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to logout' },
      { status: 500 }
    );
  }
} 