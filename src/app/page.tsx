import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import WalletDashboard from '@/components/WalletDashboard';

export default function Home() {
  return (
    <div className="flex items-center justify-center h-full p-4">
      <div className="max-w-md w-full p-6 bg-gray-900 rounded-lg">
        <h1 className="text-2xl font-bold text-white mb-4">Welcome to Nyx Wallet</h1>
        <p className="text-gray-300 mb-6">
          Your secure crypto wallet with multi-wallet support and biometric security.
        </p>
        <div className="flex justify-center">
          <a 
            href="/login" 
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    </div>
  );
}
