'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import { useMarkets, useOrders, useCreateMarket, usePlaceOrder, useFillOrder } from '@/hooks/useMarketplace';
import { useOptions, useMintOption } from '@/hooks/useOptions';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

const WalletButton = dynamic(
  () => import('@/components/ui/wallet-button').then((mod) => mod.WalletButton),
  { ssr: false }
);

export default function MarketplacePage() {
  const { publicKey } = useWallet();
  const { data: markets, isLoading: marketsLoading } = useMarkets();
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const { data: orders } = useOrders(selectedMarket || undefined);
  const { data: options, isLoading: optionsLoading } = useOptions();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const selectedOptionData = options?.find(o => o.publicKey.toString() === selectedOption);

  const createMarket = useCreateMarket();
  const placeOrder = usePlaceOrder();
  const fillOrder = useFillOrder();
  const mintOption = useMintOption();

  // Create Market Form
  const [baseMint, setBaseMint] = useState('');
  const [quoteMint, setQuoteMint] = useState('');

  // Place Order Form
  const [orderPrice, setOrderPrice] = useState('');
  const [orderSize, setOrderSize] = useState('');
  const [isBuy, setIsBuy] = useState(false);

  // Fill Order - store fill sizes per order
  const [fillSizes, setFillSizes] = useState<Record<string, string>>({});

  // Mint Option
  const [mintAmount, setMintAmount] = useState('');

  const [result, setResult] = useState('');

  const GUSDC_MINT = 'HLU9Hp2StXoxNZdSJR2twvpvFT7ZnTRuguxHPnQLwkqe';

  const handleCreateMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult('Creating market...');
    try {
      const res = await createMarket.mutateAsync({ baseMint, quoteMint });
      setResult(`Market created! Address: ${res.marketPda}\nTx: ${res.tx}`);
      setBaseMint('');
      setQuoteMint('');
      setSelectedMarket(res.marketPda);
    } catch (error: any) {
      setResult(`Error: ${error.message || error}`);
    }
  };

  const handleCreateMarketForOption = async () => {
    if (!selectedOption || !selectedOptionData) {
      setResult('Please select an option first');
      return;
    }
    setResult('Creating market for option...');
    try {
      // Derive option mint from the selected option context
      const optionContextPda = new PublicKey(selectedOption);
      const programId = new PublicKey('2xQGkb3maNPAA3Kaj7xd5RgJzddppLiPjxoupfruhXnF');
      const [optionMint] = PublicKey.findProgramAddressSync(
        [Buffer.from('option_mint'), optionContextPda.toBuffer()],
        programId
      );

      const res = await createMarket.mutateAsync({
        baseMint: optionMint.toString(),
        quoteMint: GUSDC_MINT,
      });
      setResult(`Market created for option!\nMarket: ${res.marketPda}\nTx: ${res.tx}`);
      setSelectedMarket(res.marketPda);
    } catch (error: any) {
      setResult(`Error: ${error.message || error}`);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMarket || !publicKey) {
      setResult('Please select a market and connect wallet');
      return;
    }
    setResult('Placing order...');
    try {
      // Get market data to determine base and quote mints
      const marketData = markets?.find(m => m.publicKey.toString() === selectedMarket);
      if (!marketData) {
        setResult('Market not found');
        return;
      }

      const baseMintPk = marketData.account.baseMint;
      const quoteMintPk = marketData.account.quoteMint;

      // Determine which mint to deposit based on order type
      const depositMintPk = isBuy ? quoteMintPk : baseMintPk;

      // Get user's token account for the deposit mint
      const userDepositAccountPk = await getAssociatedTokenAddress(
        depositMintPk,
        publicKey
      );

      const res = await placeOrder.mutateAsync({
        marketAddress: selectedMarket,
        price: orderPrice,
        size: orderSize,
        isBuy,
        depositMint: depositMintPk.toString(),
        userDepositAccount: userDepositAccountPk.toString(),
      });
      setResult(`Order placed! Address: ${res.orderPda}\nTx: ${res.tx}`);
      setOrderPrice('');
      setOrderSize('');
    } catch (error: any) {
      setResult(`Error: ${error.message || error}`);
    }
  };

  const handleFillOrder = async (orderAddress: string, orderData: any) => {
    const fillSize = fillSizes[orderAddress];
    if (!fillSize || !publicKey) {
      setResult('Please enter fill size and connect wallet');
      return;
    }
    setResult('Filling order...');
    try {
      console.log('=== FILL ORDER DEBUG ===');
      console.log('Order Address:', orderAddress);
      console.log('Order Data:', orderData);
      console.log('Markets:', markets);

      // Get market data
      const marketData = markets?.find(m => m.publicKey.toString() === orderData.account.market.toString());
      if (!marketData) {
        setResult('Market not found. Try refreshing the page.');
        return;
      }

      console.log('Market Data:', marketData);

      const baseMintPk = marketData.account.baseMint;
      const quoteMintPk = marketData.account.quoteMint;

      console.log('Base Mint:', baseMintPk?.toString());
      console.log('Quote Mint:', quoteMintPk?.toString());

      // Get taker's token accounts (person filling the order)
      const takerBaseAccountPk = await getAssociatedTokenAddress(baseMintPk, publicKey);
      const takerQuoteAccountPk = await getAssociatedTokenAddress(quoteMintPk, publicKey);

      console.log('Taker Base Account:', takerBaseAccountPk.toString());
      console.log('Taker Quote Account:', takerQuoteAccountPk.toString());

      // Get maker's receive account (order placer's receive account)
      const makerPk = orderData.account.owner;
      console.log('Maker PK (raw):', makerPk);

      if (!makerPk) {
        setResult('Error: Could not find order owner in order data');
        console.error('Order account structure:', orderData.account);
        return;
      }

      // Ensure makerPk is a PublicKey object
      const makerPublicKey = typeof makerPk === 'string'
        ? new PublicKey(makerPk)
        : makerPk instanceof PublicKey
        ? makerPk
        : new PublicKey(makerPk);

      console.log('Maker PK (converted):', makerPublicKey.toString());

      const makerReceiveMintPk = orderData.account.isBuy ? baseMintPk : quoteMintPk;
      console.log('Maker Receive Mint:', makerReceiveMintPk?.toString());

      const makerReceiveAccountPk = await getAssociatedTokenAddress(makerReceiveMintPk, makerPublicKey);
      console.log('Maker Receive Account:', makerReceiveAccountPk.toString());

      const res = await fillOrder.mutateAsync({
        orderAddress,
        fillSize,
        takerBaseAccount: takerBaseAccountPk.toString(),
        takerQuoteAccount: takerQuoteAccountPk.toString(),
        makerReceiveAccount: makerReceiveAccountPk.toString(),
      });
      setResult(`Order filled! Tx: ${res.tx}`);
      // Clear the fill size for this order
      setFillSizes(prev => {
        const updated = { ...prev };
        delete updated[orderAddress];
        return updated;
      });
    } catch (error: any) {
      console.error('Fill order error:', error);
      setResult(`Error: ${error.message || JSON.stringify(error)}`);
    }
  };

  const handleMintOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOption) {
      setResult('Please select an option first');
      return;
    }
    setResult('Minting option...');
    try {
      const res = await mintOption.mutateAsync({
        optionContextAddress: selectedOption,
        amount: mintAmount,
      });
      setResult(`Option minted! Tx: ${res.tx}`);
      setMintAmount('');
    } catch (error: any) {
      setResult(`Error: ${error.message || error}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      <div className="container mx-auto px-4 py-8">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-blue-400 hover:text-blue-300">← Home</Link>
            <h1 className="text-3xl font-bold text-white">Marketplace</h1>
          </div>
          <WalletButton />
        </header>

        {!publicKey ? (
          <div className="max-w-2xl mx-auto bg-gray-800/50 backdrop-blur-sm rounded-lg p-8">
            <p className="text-gray-300 text-center">Please connect your wallet to use the marketplace</p>
          </div>
        ) : (
          <main className="grid lg:grid-cols-2 gap-6">
            {/* Left Column: Create & Manage */}
            <div className="space-y-6">
              {/* Create Market */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Create Market</h2>
                <form onSubmit={handleCreateMarket} className="space-y-3">
                  <input
                    type="text"
                    value={baseMint}
                    onChange={(e) => setBaseMint(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Base Mint Address"
                    required
                  />
                  <input
                    type="text"
                    value={quoteMint}
                    onChange={(e) => setQuoteMint(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Quote Mint Address"
                    required
                  />
                  <button
                    type="submit"
                    disabled={createMarket.isPending}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold rounded transition text-sm"
                  >
                    {createMarket.isPending ? 'Creating...' : 'Create Market'}
                  </button>
                </form>
              </div>

              {/* Options List */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Available Options</h2>
                {optionsLoading ? (
                  <p className="text-gray-400 text-sm">Loading...</p>
                ) : options && options.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {options.map((option) => (
                      <div
                        key={option.publicKey.toString()}
                        onClick={() => setSelectedOption(option.publicKey.toString())}
                        className={`p-3 rounded border cursor-pointer transition ${
                          selectedOption === option.publicKey.toString()
                            ? 'bg-purple-600/30 border-purple-500'
                            : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                        }`}
                      >
                        <p className="text-white text-sm font-mono">
                          {option.publicKey.toString().slice(0, 8)}...
                        </p>
                        <p className="text-gray-400 text-xs mt-1">
                          Strike: {option.account.strikePrice.toString()} |
                          Type: {option.account.isPut ? 'PUT' : 'CALL'}
                        </p>
                        <p className="text-gray-400 text-xs">
                          Collateral: {option.account.collateralMint.toString().slice(0, 8)}...
                        </p>
                        <p className="text-gray-400 text-xs">
                          Expires: {new Date(option.account.expiration.toNumber() * 1000).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No options found. Create one on the Options page!</p>
                )}
              </div>

              {/* Buy Option (Mint) & Create Market */}
              {selectedOption && (
                <>
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-white mb-4">Buy Option (Mint)</h2>
                    <form onSubmit={handleMintOption} className="space-y-3">
                      <input
                        type="text"
                        value={mintAmount}
                        onChange={(e) => setMintAmount(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                        placeholder="Amount (e.g., 1000000 for 1 token with 6 decimals)"
                        required
                      />
                      <p className="text-xs text-gray-400">
                        This will deposit collateral and mint option + redemption tokens
                      </p>
                      <button
                        type="submit"
                        disabled={mintOption.isPending}
                        className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold rounded transition text-sm"
                      >
                        {mintOption.isPending ? 'Minting...' : 'Mint Option'}
                      </button>
                    </form>
                  </div>

                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-white mb-4">Create Market</h2>
                    <p className="text-sm text-gray-400 mb-3">
                      Create a trading market for this option (Option/gUSDC)
                    </p>
                    <button
                      onClick={handleCreateMarketForOption}
                      disabled={createMarket.isPending}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold rounded transition text-sm"
                    >
                      {createMarket.isPending ? 'Creating...' : 'Create Market for Option'}
                    </button>
                  </div>
                </>
              )}

              {/* Markets List */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Markets</h2>
                {marketsLoading ? (
                  <p className="text-gray-400 text-sm">Loading...</p>
                ) : markets && markets.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {markets.map((market) => (
                      <div
                        key={market.publicKey.toString()}
                        onClick={() => setSelectedMarket(market.publicKey.toString())}
                        className={`p-3 rounded border cursor-pointer transition ${
                          selectedMarket === market.publicKey.toString()
                            ? 'bg-blue-600/30 border-blue-500'
                            : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                        }`}
                      >
                        <p className="text-white text-sm font-mono">
                          {market.publicKey.toString().slice(0, 8)}...
                        </p>
                        <p className="text-gray-400 text-xs mt-1">
                          Base: {market.account.baseMint.toString().slice(0, 8)}... |
                          Quote: {market.account.quoteMint.toString().slice(0, 8)}...
                        </p>
                        <p className="text-gray-400 text-xs">
                          Orders: {market.account.totalOrdersPlaced.toString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No markets found</p>
                )}
              </div>

              {/* Place Order */}
              {selectedMarket && (
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-white mb-4">Place Order</h2>
                  <form onSubmit={handlePlaceOrder} className="space-y-3">
                    <div className="flex items-center gap-3 mb-3">
                      <button
                        type="button"
                        onClick={() => setIsBuy(false)}
                        className={`flex-1 py-2 rounded font-semibold transition ${
                          !isBuy
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        SELL
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsBuy(true)}
                        className={`flex-1 py-2 rounded font-semibold transition ${
                          isBuy
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        BUY
                      </button>
                    </div>
                    <input
                      type="text"
                      value={orderPrice}
                      onChange={(e) => setOrderPrice(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                      placeholder="Price in gUSDC (e.g., 1000000 = 1 gUSDC per option)"
                      required
                    />
                    <input
                      type="text"
                      value={orderSize}
                      onChange={(e) => setOrderSize(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                      placeholder="Size (e.g., 1000000 = 1 option token)"
                      required
                    />
                    <p className="text-xs text-gray-400">
                      {isBuy
                        ? 'Buy order: You deposit gUSDC, receive options when filled'
                        : 'Sell order: You deposit options, receive gUSDC when filled'}
                    </p>
                    <button
                      type="submit"
                      disabled={placeOrder.isPending}
                      className={`w-full py-2 disabled:bg-gray-600 text-white font-semibold rounded transition text-sm ${
                        isBuy
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {placeOrder.isPending ? 'Placing...' : `Place ${isBuy ? 'Buy' : 'Sell'} Order`}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Right Column: Orders */}
            <div className="space-y-6">
              {selectedMarket ? (
                <>
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-white mb-4">Orders</h2>
                    {orders && orders.length > 0 ? (
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {orders.map((order) => (
                          <div key={order.publicKey.toString()} className="bg-gray-700/50 border border-gray-600 rounded p-4">
                            <div className="flex justify-between items-start mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                order.account.isBuy ? 'bg-green-600' : 'bg-red-600'
                              }`}>
                                {order.account.isBuy ? 'BUY' : 'SELL'}
                              </span>
                              <span className="text-xs text-gray-400 font-mono">
                                {order.publicKey.toString().slice(0, 12)}...
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <p className="text-gray-400">Price:</p>
                                <p className="text-white font-mono">{order.account.price.toString()}</p>
                              </div>
                              <div>
                                <p className="text-gray-400">Size:</p>
                                <p className="text-white font-mono">{order.account.size.toString()}</p>
                              </div>
                              <div>
                                <p className="text-gray-400">Filled:</p>
                                <p className="text-white font-mono">{order.account.filled.toString()}</p>
                              </div>
                              <div>
                                <p className="text-gray-400">Remaining:</p>
                                <p className="text-white font-mono">
                                  {(order.account.size.toNumber() - order.account.filled.toNumber()).toString()}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <input
                                type="text"
                                placeholder="Fill amount"
                                value={fillSizes[order.publicKey.toString()] || ''}
                                className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-xs"
                                onChange={(e) => setFillSizes(prev => ({
                                  ...prev,
                                  [order.publicKey.toString()]: e.target.value
                                }))}
                              />
                              <button
                                onClick={() => handleFillOrder(order.publicKey.toString(), order)}
                                className={`px-4 py-1 text-white font-semibold rounded transition text-xs ${
                                  order.account.isBuy
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : 'bg-green-600 hover:bg-green-700'
                                }`}
                              >
                                {order.account.isBuy ? 'SELL' : 'BUY'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm">No orders for this market</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-8">
                  <p className="text-gray-400 text-center">Select a market to view orders</p>
                </div>
              )}

              {/* Result Display */}
              {result && (
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-lg p-4">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono">{result}</p>
                </div>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
