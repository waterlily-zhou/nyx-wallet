export async function getEthPrice(): Promise<number> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    if (!response.ok) {
      throw new Error('Failed to fetch ETH price');
    }
    const data = await response.json();
    return data.ethereum.usd;
  } catch (error) {
    console.error('Error fetching ETH price:', error);
    // Return a fallback price if the API fails
    return 2000; // Fallback to $2000 if API fails
  }
} 