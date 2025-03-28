import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';

export default async function LoginPage() {
  const cookieStore = cookies();
  const walletAddress = cookieStore.get('walletAddress')?.value;

  if (walletAddress) {
    redirect('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Welcome to Nyx Wallet
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            Create or access your secure Ethereum wallet
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
} 