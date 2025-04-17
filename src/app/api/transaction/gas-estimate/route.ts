import { NextResponse } from 'next/server';
import { JsonRpcProvider, parseEther } from 'ethers';

export async function POST(request: Request) {
  try {
    // Validate environment variable
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
      throw new Error('RPC_URL environment variable is not set');
    }
    console.log('Using RPC URL:', rpcUrl.substring(0, 20) + '...');

    const body = await request.json();
    const { to, value, data, from } = body;
    console.log('Request params:', { to, value, data: data || '0x', from });

    // Validate required parameters
    if (!to || !from) {
      throw new Error('Missing required parameters: to and from addresses are required');
    }

    // Initialize provider
    const provider = new JsonRpcProvider(rpcUrl);

    // Test provider connection
    try {
      const network = await provider.getNetwork();
      console.log('Connected to network:', {
        chainId: network.chainId,
        name: network.name
      });
    } catch (error) {
      console.error('Provider connection error:', error);
      throw new Error('Failed to connect to Ethereum network');
    }

    // Convert ETH value to Wei
    let valueInWei;
    try {
      valueInWei = value ? parseEther(value) : 0n;
      console.log('Value conversion:', {
        original: value,
        valueInWei: valueInWei.toString()
      });
    } catch (error) {
      console.error('Value conversion error:', error);
      throw new Error('Invalid ETH amount format');
    }

    // Get current base fee
    const block = await provider.getBlock('latest');
    if (!block) {
      throw new Error('Failed to fetch latest block');
    }
    const baseFee = block.baseFeePerGas || 0n;
    console.log('Latest block info:', {
      number: block.number,
      baseFee: baseFee.toString(),
      timestamp: new Date(Number(block.timestamp) * 1000).toISOString()
    });

    // Estimate gas limit first
    let gasLimit;
    try {
      gasLimit = await provider.estimateGas({
        to,
        value: valueInWei,
        data: data || '0x',
        from,
      });
      console.log('Gas limit estimation:', {
        gasLimit: gasLimit.toString(),
        for: 'ETH transfer'
      });
    } catch (error) {
      console.error('Gas estimation error:', error);
      throw new Error('Failed to estimate gas limit');
    }

    // Get current ETH price
    try {
      const ethPriceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      if (!ethPriceResponse.ok) {
        throw new Error('Failed to fetch ETH price');
      }
      const ethPriceData = await ethPriceResponse.json();
      const ethPrice = ethPriceData.ethereum.usd;
      console.log('ETH price:', { usd: ethPrice });

      // Base network has fast processing without needing priority fees
      const totalGasPrice = baseFee;
      console.log('Gas price (wei):', totalGasPrice.toString());

      // Calculate costs in both ETH and USD
      const gasLimitBigInt = BigInt(gasLimit.toString());
      const gasCostInWei = totalGasPrice * gasLimitBigInt;
      const gasCostInEth = Number(gasCostInWei) / 1e18;
      const costUSD = gasCostInEth * ethPrice;

      console.log('Cost calculation:', {
        gasPrice: totalGasPrice.toString(),
        gasLimit: gasLimit.toString(),
        gasCostInWei: gasCostInWei.toString(),
        gasCostInEth,
        costUSD
      });

      const response = {
        baseFee: baseFee.toString(),
        totalGasPrice: totalGasPrice.toString(),
        feeAmount: gasCostInEth,
        feeCurrency: 'ETH',
        estimatedCostUSD: costUSD,
        ethPrice,
        gasLimit: gasLimit.toString(),
      };
      
      console.log('Final response:', response);
      return NextResponse.json(response);
    } catch (error) {
      console.error('ETH price fetch error:', error);
      throw new Error('Failed to fetch ETH price from CoinGecko');
    }
  } catch (error) {
    console.error('Gas estimation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to estimate gas' },
      { status: 500 }
    );
  }
} 