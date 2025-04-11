import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Logout endpoint called');
    const cookieStore = cookies();
    
    // Clear all session-related cookies
    cookieStore.delete('session');
    cookieStore.delete('userId');
    cookieStore.delete('walletAddress');
    
    // Also clear any registration-related cookies if they exist
    cookieStore.delete('register_challenge');
    cookieStore.delete('register_user_id');
    cookieStore.delete('register_keys');
    cookieStore.delete('register_device_name');
    
    console.log('API: User logged out successfully');
    
    return NextResponse.json({ 
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('API: Logout error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to log out' 
    }, { status: 500 });
  }
} 