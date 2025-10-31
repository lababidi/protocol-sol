'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import { useCreateOption } from '@/hooks/useOptions';

const WalletButton = dynamic(
  () => import('@/components/ui/wallet-button').then((mod) => mod.WalletButton),
  { ssr: false }
);

const TOKENS = [
  { symbol: 'gSOL', mint: 'GjxvChjt5YESgPJeUTjwvMQnfrazmdzTTjVfEUimhR4a'},
  { symbol: 'gUSDC', mint: 'HLU9Hp2StXoxNZdSJR2twvpvFT7ZnTRuguxHPnQLwkqe'},
  { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  { symbol: 'wSOL', mint: 'So11111111111111111111111111111111111111112' },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
];

export default function OptionsPage() {
  const { publicKey } = useWallet();
  const createOption = useCreateOption();

  const [baseMint, setBaseMint] = useState('');
  const [quoteMint, setQuoteMint] = useState('');
  const [strikePrice, setStrikePrice] = useState('');
  const [expirationHours, setExpirationHours] = useState('24');
  const [isPut, setIsPut] = useState(false);
  const [result, setResult] = useState('');

  const handleCreateOption = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult('Creating option series...');

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const expiration = currentTime + parseInt(expirationHours) * 3600;

      const res = await createOption.mutateAsync({
        baseMint,
        quoteMint,
        strikePrice,
        expiration: expiration.toString(),
        isPut,
      });

      setResult(`Success! Option Context: ${res.optionContextPda}\nTx: ${res.tx}`);
    } catch (error: any) {
      setResult(`Error: ${error.message || error}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-8">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-purple-400 hover:text-purple-300">← Home</Link>
            <h1 className="text-3xl font-bold text-white">Options Protocol</h1>
          </div>
          <WalletButton />
        </header>

        <main className="max-w-2xl mx-auto">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-8 mb-6">
            <h2 className="text-2xl font-semibold text-white mb-6">Create Option Series</h2>

            {!publicKey ? (
              <p className="text-gray-300">Please connect your wallet to create options</p>
            ) : (
              <form onSubmit={handleCreateOption} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Underlying Collateral
                  </label>
                  <select
                    value={baseMint}
                    onChange={(e) => setBaseMint(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="">Select token...</option>
                    {TOKENS.map((token) => (
                      <option key={token.mint} value={token.mint}>
                        {token.symbol}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Consideration (Cash to swap on exercise)
                  </label>
                  <select
                    value={quoteMint}
                    onChange={(e) => setQuoteMint(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="">Select token...</option>
                    {TOKENS.map((token) => (
                      <option key={token.mint} value={token.mint}>
                        {token.symbol}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Strike Price (in smallest unit)
                  </label>
                  <input
                    type="text"
                    value={strikePrice}
                    onChange={(e) => setStrikePrice(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="50"
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Enter as integer in smallest unit. Example: For 0.00005 USDC (6 decimals), enter <code className="px-1 bg-gray-900/50 rounded">50</code>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Expiration (hours from now)
                  </label>
                  <input
                    type="number"
                    value={expirationHours}
                    onChange={(e) => setExpirationHours(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="24"
                    required
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isPut"
                    checked={isPut}
                    onChange={(e) => setIsPut(e.target.checked)}
                    className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="isPut" className="text-sm font-medium text-gray-300">
                    Is Put Option (uncheck for Call)
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={createOption.isPending}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition"
                >
                  {createOption.isPending ? 'Creating...' : 'Create Option Series'}
                </button>
              </form>
            )}

            {result && (
              <div className="mt-6 p-4 bg-gray-900/50 rounded-lg">
                <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono">{result}</p>
              </div>
            )}
          </div>

          <div className="bg-blue-600/20 border border-blue-500 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Next Step</h3>
            <p className="text-gray-300 text-sm mb-4">
              After creating an option series, head to the Marketplace to create a market and start trading!
            </p>
            <Link href="/marketplace">
              <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition">
                Go to Marketplace →
              </button>
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
