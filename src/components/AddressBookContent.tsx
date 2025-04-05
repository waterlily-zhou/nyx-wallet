'use client';

interface AddressBookContentProps {
  walletAddress: string;
}

export default function AddressBookContent({ walletAddress }: AddressBookContentProps) {
  return (
    <div className="flex-1 overflow-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Address Book</h1>
      <div className="bg-zinc-900 rounded-lg p-6">
        <p className="text-gray-400 mb-4">Manage your saved addresses for quick transactions.</p>
        <div className="border border-gray-800 rounded-lg divide-y divide-gray-800">
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">My Exchange</p>
              <p className="text-xs text-gray-500 font-mono">0x742d35Cc6634C0532925a3b844Bc454e4438f44e</p>
            </div>
            <button className="text-violet-400 hover:text-violet-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
            </button>
          </div>
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">Cold Storage</p>
              <p className="text-xs text-gray-500 font-mono">0x395dE04e1F750aBc5D8274a688D6a8f2Fb4e79F1</p>
            </div>
            <button className="text-violet-400 hover:text-violet-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <button className="mt-6 flex items-center text-violet-400 hover:text-violet-300">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
          </svg>
          Add New Address
        </button>
      </div>
    </div>
  );
} 