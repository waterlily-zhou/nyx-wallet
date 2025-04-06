import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Nyx Wallet",
  description: "A secure Ethereum wallet with account abstraction",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if user is authenticated to determine if we're showing dashboard
  const cookieStore = cookies();
  const isAuthenticated = cookieStore.has('session') && cookieStore.get('session')?.value === 'authenticated';
  
  return (
    <html lang="en">
      <body>
        <div className="bg-black text-white min-h-screen flex flex-col">
          <header className="py-4 px-6 border-b border-violet-500">
            <div className="logo-text text-lg">nyx_wallet</div>
          </header>
          <main className="flex-1 flex">
            {!isAuthenticated ? (
              <div className="w-full h-full flex items-center justify-center py-8">
                {children}
              </div>
            ) : (
              <>{children}</>
            )}
          </main>
        </div>
      </body>
    </html>
  );
}
