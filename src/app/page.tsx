import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import WalletDashboard from '@/components/WalletDashboard';

export default async function Home() {
  const cookieStore = cookies();
  const walletAddress = cookieStore.get('walletAddress')?.value;

  if (!walletAddress) {
    redirect('/login');
  }

  return <WalletDashboard />;
}
