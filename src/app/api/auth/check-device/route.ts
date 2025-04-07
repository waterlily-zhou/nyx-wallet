import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/server';
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

  // Check if any authenticator exists with this deviceId
  // This is a simplification - we'd need to actually store deviceId with authenticators
  // in Supabase for this to work properly
  const { data, error } = await supabase
    .from('authenticators')
    .select('count')
    .limit(1);
  
  // For now, just check if any authenticators exist
  const registered = data && data.length > 0;

  return NextResponse.json({ registered });
}
