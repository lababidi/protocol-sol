import { useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { MARKETPLACE_PROGRAM_ID, OPTIONS_PROGRAM_ID } from '@/lib/anchorConfig';
import type { SplMarketplace } from '@/lib/idls/spl_marketplace';
import type { SolOptionProtocol } from '@/lib/idls/sol_option_protocol';
import marketplaceIdlJson from '@/lib/idls/spl_marketplace.json';
import optionsIdlJson from '@/lib/idls/sol_option_protocol.json';

export function useMarketplaceProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();
  console.log('useMarketplaceProgram');
  console.log(wallet.publicKey);

  return useMemo(() => {
    if (!wallet.publicKey) return null;

    const provider = new anchor.AnchorProvider(
      connection,
      wallet as any,
      anchor.AnchorProvider.defaultOptions()
    );

    return new Program<SplMarketplace>(
      marketplaceIdlJson as SplMarketplace,
      provider
    );
  }, [connection, wallet.publicKey]);
}

export function useOptionsProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(() => {
    if (!wallet.publicKey) return null;

    const provider = new anchor.AnchorProvider(
      connection,
      wallet as any,
      anchor.AnchorProvider.defaultOptions()
    );

    console.log('Creating options program...');
    console.log('IDL address:', optionsIdlJson.address);
    console.log('RPC:', connection.rpcEndpoint);

    return new Program<SolOptionProtocol>(
      optionsIdlJson as SolOptionProtocol,
      provider
    );
  }, [connection, wallet.publicKey]);
}
