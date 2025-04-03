import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { userAccounts } from '@/lib/utils/user-store';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const cookieStore = cookies();
  let deviceId = cookieStore.get('deviceId')?.value;

  // If deviceId doesn't exist, generate and set it
  if (!deviceId) {
    deviceId = uuidv4();
    cookieStore.set('deviceId', deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 365 // 1 year
    });
  }

  // Check if any user has a credential matching this deviceId
  const registered = userAccounts.some(user =>
    user.credentials?.some((cred: any) => cred.deviceId === deviceId)
  );

  return NextResponse.json({ registered });
}
