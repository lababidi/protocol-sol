import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAccount, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { useMarketplaceProgram } from './useAnchor';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

export function useMarkets() {
  const program = useMarketplaceProgram();

  return useQuery({
    queryKey: ['markets'],
    queryFn: async () => {
      if (!program) return [];
      return program.account.market.all();
    },
    enabled: !!program,
    refetchInterval: 5000,
  });
}

export function useOrders(marketAddress?: string) {
  const program = useMarketplaceProgram();

  return useQuery({
    queryKey: ['orders', marketAddress],
    queryFn: async () => {
      if (!program || !marketAddress) return [];
      const orders = await program.account.order.all();
      return orders.filter(order =>
        order.account.market.toString() === marketAddress
      );
    },
    enabled: !!program && !!marketAddress,
    refetchInterval: 3000,
  });
}

export function useCreateMarket() {
  const program = useMarketplaceProgram();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ baseMint, quoteMint }: { baseMint: string; quoteMint: string }) => {
      if (!program || !publicKey) throw new Error('Wallet not connected');

      const baseMintPk = new PublicKey(baseMint);
      const quoteMintPk = new PublicKey(quoteMint);

      const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('market'), baseMintPk.toBuffer(), quoteMintPk.toBuffer()],
        program.programId
      );

      const tx = await program.methods
        .createMarket()
        .accounts({
          creator: publicKey,
          baseMint: baseMintPk,
          quoteMint: quoteMintPk,
          market: marketPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return { tx, marketPda: marketPda.toString() };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markets'] });
    },
  });
}

export function usePlaceOrder() {
  const program = useMarketplaceProgram();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      marketAddress,
      price,
      size,
      isBuy,
      depositMint,
      userDepositAccount,
    }: {
      marketAddress: string;
      price: string;
      size: string;
      isBuy: boolean;
      depositMint: string;
      userDepositAccount: string;
    }) => {
      if (!program || !publicKey) throw new Error('Wallet not connected');

      const marketPk = new PublicKey(marketAddress);
      const market = await program.account.market.fetch(marketPk);

      const [orderPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('order'),
          marketPk.toBuffer(),
          market.nextOrderId.toArrayLike(Buffer, 'le', 8),
        ],
        program.programId
      );

      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), orderPda.toBuffer()],
        program.programId
      );

      const depositMintPk = new PublicKey(depositMint);
      const userDepositAccountPk = new PublicKey(userDepositAccount);

      // Check if user deposit account exists, create if not
      const preInstructions = [];
      try {
        await getAccount(connection, userDepositAccountPk);
      } catch (e) {
        console.log('Creating deposit ATA:', userDepositAccountPk.toString());
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            publicKey,
            userDepositAccountPk,
            publicKey,
            depositMintPk
          )
        );
      }

      const txBuilder = program.methods
        .placeOrder(new BN(price), new BN(size), isBuy)
        .accounts({
          user: publicKey,
          market: marketPk,
          order: orderPda,
          depositMint: depositMintPk,
          userDepositAccount: userDepositAccountPk,
          escrow: escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        });

      if (preInstructions.length > 0) {
        txBuilder.preInstructions(preInstructions);
      }

      const tx = await txBuilder.rpc();

      return { tx, orderPda: orderPda.toString() };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders', variables.marketAddress] });
      queryClient.invalidateQueries({ queryKey: ['markets'] });
    },
  });
}

export function useFillOrder() {
  const program = useMarketplaceProgram();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderAddress,
      fillSize,
      takerBaseAccount,
      takerQuoteAccount,
      makerReceiveAccount,
    }: {
      orderAddress: string;
      fillSize: string;
      takerBaseAccount: string;
      takerQuoteAccount: string;
      makerReceiveAccount: string;
    }) => {
      if (!program || !publicKey) throw new Error('Wallet not connected');

      const orderPk = new PublicKey(orderAddress);
      const order = await program.account.order.fetch(orderPk);
      const market = await program.account.market.fetch(order.market);

      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), orderPk.toBuffer()],
        program.programId
      );

      const takerBaseAccountPk = new PublicKey(takerBaseAccount);
      const takerQuoteAccountPk = new PublicKey(takerQuoteAccount);
      const makerReceiveAccountPk = new PublicKey(makerReceiveAccount);

      // Check which accounts need to be created
      const preInstructions = [];

      const checkAndCreateATA = async (ata: PublicKey, mint: PublicKey, owner: PublicKey) => {
        try {
          await getAccount(connection, ata);
        } catch (e) {
          console.log('Creating ATA:', ata.toString());
          preInstructions.push(
            createAssociatedTokenAccountInstruction(
              publicKey,
              ata,
              owner,
              mint
            )
          );
        }
      };

      await checkAndCreateATA(takerBaseAccountPk, market.baseMint, publicKey);
      await checkAndCreateATA(takerQuoteAccountPk, market.quoteMint, publicKey);
      await checkAndCreateATA(makerReceiveAccountPk, order.isBuy ? market.baseMint : market.quoteMint, order.owner);

      const txBuilder = program.methods
        .fillOrder(new BN(fillSize))
        .accounts({
          taker: publicKey,
          market: order.market,
          makerOrder: orderPk,
          baseMint: market.baseMint,
          quoteMint: market.quoteMint,
          makerEscrow: escrowPda,
          takerBaseAccount: takerBaseAccountPk,
          takerQuoteAccount: takerQuoteAccountPk,
          makerReceiveAccount: makerReceiveAccountPk,
          tokenProgram: TOKEN_PROGRAM_ID,
        });

      if (preInstructions.length > 0) {
        txBuilder.preInstructions(preInstructions);
      }

      const tx = await txBuilder.rpc();

      return { tx };
    },
    onSuccess: (_, variables) => {
      const orderAddress = variables.orderAddress;
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['markets'] });
    },
  });
}
