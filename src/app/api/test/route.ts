import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('Basic test route');
    
    return NextResponse.json({ success: true, message: 'Test route is working' });
  } catch (error) {
    console.error('Error in basic test route:', error);
    
    return NextResponse.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 