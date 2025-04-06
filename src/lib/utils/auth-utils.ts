import { NextResponse } from 'next/server';
import { type Address } from 'viem';

/**
 * Sets the session cookie on the response.
 * 
 * @param response - The NextResponse object to set the cookie on
 * @param userId - The user ID to store in the cookie
 * @param walletAddress - The wallet address to store in the cookie
 * @returns The modified response
 */
export function setSessionCookie(
  response: NextResponse,
  userId: string,
  walletAddress?: Address
): NextResponse {
  // Set a session cookie
  response.cookies.set('session', 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/'
  });
  
  // Set a userId cookie (not httpOnly so client can read it)
  response.cookies.set('userId', userId, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/'
  });
  
  // Set a wallet address cookie if provided
  if (walletAddress) {
    response.cookies.set('walletAddress', walletAddress, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    });
  }
  
  return response;
} 