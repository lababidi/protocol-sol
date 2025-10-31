import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useOptionsProgram } from './useAnchor';
import {useConnection, useWallet} from '@solana/wallet-adapter-react';
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    getAccount
} from '@solana/spl-token';
import { SYSVAR_RENT_PUBKEY } from '@solana/web3.js';

export function useCreateOption() {
    const program = useOptionsProgram();
    const { publicKey } = useWallet();
    const queryClient = useQueryClient();
    const { connection } = useConnection();

    console.log('options');
    console.log(publicKey);

    return useMutation({
        mutationFn: async ({
                               baseMint,
                               quoteMint,
                               strikePrice,
                               expiration,
                               isPut,
                           }: {
            baseMint: string;
            quoteMint: string;
            strikePrice: string;
            expiration: string;
            isPut: boolean;
        }) => {
            if (!program || !publicKey) throw new Error('Wallet not connected');

            const baseMintPk = new PublicKey(baseMint);
            const quoteMintPk = new PublicKey(quoteMint);
            const strikeBN = new BN(strikePrice);
            const expirationBN = new BN(expiration);

            // Derive the option_context PDA
            const [optionContextPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from('option_context'),
                    baseMintPk.toBuffer(),
                    quoteMintPk.toBuffer(),
                    strikeBN.toArrayLike(Buffer, 'le', 8),
                    expirationBN.toArrayLike(Buffer, 'le', 8),
                    Buffer.from([isPut ? 1 : 0]),
                ],
                program.programId
            );

            // Derive all the other required PDAs
            const [optionMint] = PublicKey.findProgramAddressSync(
                [Buffer.from('option_mint'), optionContextPda.toBuffer()],
                program.programId
            );

            const [redemptionMint] = PublicKey.findProgramAddressSync(
                [Buffer.from('redemption_mint'), optionContextPda.toBuffer()],
                program.programId
            );

            const [collateralVault] = PublicKey.findProgramAddressSync(
                [Buffer.from('collateral_vault'), optionContextPda.toBuffer()],
                program.programId
            );

            const [considerationVault] = PublicKey.findProgramAddressSync(
                [Buffer.from('consideration_vault'), optionContextPda.toBuffer()],
                program.programId
            );

            console.log('Program ID:', program.programId.toString());
            console.log('Option Context PDA:', optionContextPda.toString());

            console.log('=== CHECKING ACCOUNTS ===');

// Check if base mint exists
            try {
                const baseMintInfo = await connection.getAccountInfo(baseMintPk);
                console.log('Base Mint exists:', !!baseMintInfo);
                console.log('Base Mint owner:', baseMintInfo?.owner.toString());
            } catch (e) {
                console.error('Error checking base mint:', e);
            }

// Check if quote mint exists
            try {
                const quoteMintInfo = await connection.getAccountInfo(quoteMintPk);
                console.log('Quote Mint exists:', !!quoteMintInfo);
                console.log('Quote Mint owner:', quoteMintInfo?.owner.toString());
            } catch (e) {
                console.error('Error checking quote mint:', e);
            }
            try {
                const tx = await program.methods
                    .createOption(baseMintPk, quoteMintPk, strikeBN, expirationBN, isPut)
                    .accountsStrict({
                        user: publicKey,
                        optionContext: optionContextPda,
                        collateralMint: baseMintPk,
                        considerationMint: quoteMintPk,
                        optionMint: optionMint,
                        redemptionMint: redemptionMint,
                        collateralVault: collateralVault,
                        considerationVault: considerationVault,
                        systemProgram: SystemProgram.programId,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        rent: SYSVAR_RENT_PUBKEY
                    })
                    .rpc();

                return {tx, optionContextPda: optionContextPda.toString()};
            }catch (error){

                console.error('FULL ERROR:', error);
                console.error('ERROR STRING:', JSON.stringify(error, null, 2));
                throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['options'] });
        },
    });
}

export function useOptions() {
    const program = useOptionsProgram();

    return useQuery({
        queryKey: ['options'],
        queryFn: async () => {
            if (!program) return [];
            return program.account.optionData.all();
        },
        enabled: !!program,
        refetchInterval: 5000,
    });
}

export function useMintOption() {
    const program = useOptionsProgram();
    const { publicKey } = useWallet();
    const queryClient = useQueryClient();
    const { connection } = useConnection();

    return useMutation({
        mutationFn: async ({
            optionContextAddress,
            amount,
        }: {
            optionContextAddress: string;
            amount: string;
        }) => {
            if (!program || !publicKey) throw new Error('Wallet not connected');

            const optionContextPda = new PublicKey(optionContextAddress);
            const optionContext = await program.account.optionData.fetch(optionContextPda);

            const amountBN = new BN(amount);

            // Derive all the required PDAs
            const [optionMint] = PublicKey.findProgramAddressSync(
                [Buffer.from('option_mint'), optionContextPda.toBuffer()],
                program.programId
            );

            const [redemptionMint] = PublicKey.findProgramAddressSync(
                [Buffer.from('redemption_mint'), optionContextPda.toBuffer()],
                program.programId
            );

            const [collateralVault] = PublicKey.findProgramAddressSync(
                [Buffer.from('collateral_vault'), optionContextPda.toBuffer()],
                program.programId
            );

            const [considerationVault] = PublicKey.findProgramAddressSync(
                [Buffer.from('consideration_vault'), optionContextPda.toBuffer()],
                program.programId
            );

            // Get user's token account addresses
            const userCollateralAccount = await getAssociatedTokenAddress(
                optionContext.collateralMint,
                publicKey
            );

            const userConsiderationAccount = await getAssociatedTokenAddress(
                optionContext.considerationMint,
                publicKey
            );

            const userOptionAccount = await getAssociatedTokenAddress(
                optionMint,
                publicKey
            );

            const userRedemptionAccount = await getAssociatedTokenAddress(
                redemptionMint,
                publicKey
            );

            console.log('=== MINT OPTION ===');
            console.log('Option Context:', optionContextPda.toString());
            console.log('Amount:', amountBN.toString());

            // Check which ATAs need to be created and add preInstructions
            const preInstructions: any[] = [];

            // Helper function to check if account exists
            const checkAndCreateATA = async (ata: PublicKey, mint: PublicKey) => {
                try {
                    await getAccount(connection, ata);
                    console.log('ATA exists:', ata.toString());
                } catch (e) {
                    console.log('Creating ATA:', ata.toString());
                    preInstructions.push(
                        createAssociatedTokenAccountInstruction(
                            publicKey,
                            ata,
                            publicKey,
                            mint
                        )
                    );
                }
            };

            // Check all ATAs
            await checkAndCreateATA(userCollateralAccount, optionContext.collateralMint);
            await checkAndCreateATA(userConsiderationAccount, optionContext.considerationMint);
            await checkAndCreateATA(userOptionAccount, optionMint);
            await checkAndCreateATA(userRedemptionAccount, redemptionMint);

            const txBuilder = program.methods
                .mint(amountBN)
                .accountsStrict({
                    user: publicKey,
                    optionContext: optionContextPda,
                    collateralMint: optionContext.collateralMint,
                    considerationMint: optionContext.considerationMint,
                    optionMint: optionMint,
                    redemptionMint: redemptionMint,
                    collateralVault: collateralVault,
                    considerationVault: considerationVault,
                    userCollateralAccount: userCollateralAccount,
                    userConsiderationAccount: userConsiderationAccount,
                    userOptionAccount: userOptionAccount,
                    userRedemptionAccount: userRedemptionAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                });

            // Add pre-instructions if any
            if (preInstructions.length > 0) {
                txBuilder.preInstructions(preInstructions);
            }

            const tx = await txBuilder.rpc();

            return { tx };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['options'] });
        },
    });
}
