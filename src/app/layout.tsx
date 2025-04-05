import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nyx Wallet",
  description: "A secure Ethereum wallet with account abstraction",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="bg-black text-white min-h-screen flex flex-col">
          <header className="py-4 px-6 border-b border-violet-500">
            <div className="logo-text text-lg">nyx_wallet</div>
          </header>
          <main className="flex-1 flex items-center justify-center">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
