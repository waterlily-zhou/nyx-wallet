import { NextResponse } from 'next/server';
import { createPublicClientForSepolia as getPublicClient } from '@/lib/client-setup';
import { getEthPrice } from '@/lib/utils/price-feed';

export async function POST(request: Request) {
  try {
    const { gasOption = 'default' } = await request.json();
    const client = getPublicClient();
    
    // Get current base fee
    const block = await client.getBlock();
    const baseFee = block.baseFeePerGas || BigInt(0);
    
    // Fixed priority fee for Base network
    const priorityFee = BigInt(5000000); // 0.005 Gwei
    
    // Calculate total gas price
    const totalGasPrice = baseFee + priorityFee;
    
    // Get ETH price in USD
    const ethPrice = await getEthPrice();
    
    // Standard gas limit for simple transfers
    const gasLimit = BigInt(21000);
    
    // Calculate gas cost based on payment option
    let feeAmount;
    let feeAmountUSD;
    
    switch (gasOption) {
      case 'usdc':
        // For USDC payments, calculate cost in USD with 10% markup
        const gasCostInEth = Number(totalGasPrice * gasLimit) / 1e18;
        const gasCostInUSD = gasCostInEth * ethPrice;
        feeAmount = gasCostInUSD * 1.1; // 10% markup for USDC payments
        feeAmountUSD = feeAmount;
        break;
        
      case 'sponsored':
        // Sponsored transactions have no fee
        feeAmount = 0;
        feeAmountUSD = 0;
        break;
        
      case 'default':
      default:
        // Default ETH payment
        feeAmount = Number(totalGasPrice * gasLimit) / 1e18;
        feeAmountUSD = feeAmount * ethPrice;
        break;
    }
    
    const response = {
      baseFee: baseFee.toString(),
      priorityFee: priorityFee.toString(),
      totalGasPrice: totalGasPrice.toString(),
      feeAmount,
      feeAmountUSD,
      ethPrice,
      gasLimit: gasLimit.toString(),
      paymentOption: gasOption
    };
    
    console.log('Gas estimation response:', response);
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Gas estimation error:', error);
    return NextResponse.json(
      { error: 'Failed to estimate gas' },
      { status: 500 }
    );
  }
} 