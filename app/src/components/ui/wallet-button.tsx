'use client'

import dynamic from 'next/dynamic'
import '@solana/wallet-adapter-react-ui/styles.css'

const WalletMultiButton = dynamic(
  async () =>
    (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  {
    ssr: false,
    loading: () => (
      <button className="wallet-adapter-button wallet-adapter-button-trigger" style={{ pointerEvents: 'none' }}>
        Loading...
      </button>
    ),
  }
)

export function WalletButton() {
  return <WalletMultiButton />
}
