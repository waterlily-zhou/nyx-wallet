import { NextRequest, NextResponse } from 'next/server';
import { createPublicClientForSepolia as getPublicClient } from '@/lib/client-setup';
import { getEthPrice } from '@/lib/utils/price-feed';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { to, value, data, from, gasOption } = body;
    
    console.log('Gas estimate request:', { to, value, data, from, gasOption });
    
    // For now, return dummy data to prevent 404
    return NextResponse.json({
      feeAmount: 0.000370,
      feeCurrency: 'ETH',
      estimatedCostUSD: 1.23,
      gasLimit: '500000'
    });
  } catch (error) {
    console.error('Error estimating gas:', error);
    return NextResponse.json(
      { error: 'Failed to estimate gas' },
      { status: 500 }
    );
  }
} 