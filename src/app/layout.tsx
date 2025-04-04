import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={inter.className}>
        <div style={{ background: "black", color: "white", minHeight: "100vh" }}>
          <header style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #333" }}>
            <div style={{ fontWeight: "bold" }}>nyx_wallet</div>
          </header>
          <main>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
