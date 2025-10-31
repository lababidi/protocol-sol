'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

const WalletButton = dynamic(
  () => import('@/components/ui/wallet-button').then((mod) => mod.WalletButton),
  { ssr: false }
);

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-8">
        <header className="flex justify-between items-center mb-12">
          <h1 className="text-4xl font-bold text-white">Solana Options Marketplace</h1>
          <WalletButton />
        </header>

        <main className="max-w-4xl mx-auto">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-8 mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Welcome to the Demo</h2>
            <p className="text-gray-300 mb-6">
              This is a minimal hackathon demo showcasing:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 mb-6">
              <li>Fully collateralized American options protocol</li>
              <li>SPL token marketplace with atomic swaps</li>
              <li>Clean separation between options creation and trading</li>
            </ul>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Link href="/options">
              <div className="bg-purple-600/20 border border-purple-500 rounded-lg p-6 hover:bg-purple-600/30 transition cursor-pointer">
                <h3 className="text-xl font-semibold text-white mb-2">Options Protocol</h3>
                <p className="text-gray-300 text-sm">
                  Create option series with custom strike prices and expiration dates
                </p>
              </div>
            </Link>

            <Link href="/marketplace">
              <div className="bg-blue-600/20 border border-blue-500 rounded-lg p-6 hover:bg-blue-600/30 transition cursor-pointer">
                <h3 className="text-xl font-semibold text-white mb-2">Marketplace</h3>
                <p className="text-gray-300 text-sm">
                  Create markets, place orders, and execute atomic swaps
                </p>
              </div>
            </Link>
          </div>

          <div className="mt-12 bg-gray-800/50 backdrop-blur-sm rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">Quick Start</h3>
            <ol className="list-decimal list-inside text-gray-300 space-y-2">
              <li>Connect your wallet (Phantom or Solflare)</li>
              <li>Create an option series in the Options tab</li>
              <li>Go to Marketplace and create a market for your option token</li>
              <li>Place and fill orders to see atomic swaps in action</li>
            </ol>
          </div>
        </main>
      </div>
    </div>
  );
}
