import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'This endpoint is only available in development mode' }, { status: 403 });
  }

  const cookieStore = cookies();
  const allCookies = cookieStore.getAll();

  // Map cookies to a more readable format
  const cookieData = allCookies.map(cookie => ({
    name: cookie.name,
    value: cookie.name.toLowerCase().includes('token') || cookie.name.toLowerCase().includes('key') 
      ? '[REDACTED]' 
      : cookie.value
  }));

  return NextResponse.json({ 
    cookies: cookieData,
    message: 'Debug information about cookies'
  });
} 