import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, mintTo, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, type Signer } from '@solana/web3.js';
import type { CurrencyService } from '../contracts/services.ts';
import { DEVNET_RPC_URL, type DevnetMintResult, type DevnetTransferResult, type SplTokenService } from './interfaces.ts';

export interface SolanaTokenServiceOptions {
    connection?: Connection;
    rpcUrl?: string;
    payer: Signer;
    mint: PublicKey | string;
    authority?: Signer;
    decimals?: number;
    inventory?: CurrencyService;
}

export class SolanaDevnetTokenService implements SplTokenService {
    readonly connection: Connection;
    readonly payer: Signer;
    readonly mint: PublicKey;
    readonly authority: Signer;
    readonly decimals: number;
    readonly inventory?: CurrencyService;

    constructor(options: SolanaTokenServiceOptions) {
        this.connection = options.connection ?? new Connection(options.rpcUrl ?? DEVNET_RPC_URL, 'confirmed');
        this.payer = options.payer;
        this.mint = typeof options.mint === 'string' ? new PublicKey(options.mint) : options.mint;
        this.authority = options.authority ?? options.payer;
        this.decimals = options.decimals ?? 0;
        this.inventory = options.inventory;
    }

    get mintAddress(): string {
        return this.mint.toBase58();
    }

    async getBalance(accountId: string): Promise<number> {
        if (this.inventory) return await this.inventory.getBalance(accountId);
        const owner = new PublicKey(accountId);
        const ata = await getAssociatedTokenAddress(this.mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        try {
            const account = await getAccount(this.connection, ata, 'confirmed', TOKEN_PROGRAM_ID);
            return Number(account.amount);
        } catch (error) {
            if (error instanceof Error && /could not find account|Failed to find account/i.test(error.message)) return 0;
            throw error;
        }
    }

    async grant(accountId: string, amount: number, reason: string): Promise<number> {
        if (this.inventory) return await this.inventory.grant(accountId, amount, reason);
        await this.mintToWallet(accountId, amount);
        return await this.getBalance(accountId);
    }

    async spend(accountId: string, amount: number, reason: string): Promise<number> {
        if (!this.inventory) throw new Error(`on-chain spend requires an inventory ledger or escrow policy; refused ${reason}`);
        return await this.inventory.spend(accountId, amount, reason);
    }

    async listOwnedItems(accountId: string): Promise<string[]> {
        return this.inventory ? await this.inventory.listOwnedItems(accountId) : [];
    }

    async grantOwnedItem(accountId: string, cosmeticId: string, reason: string): Promise<void> {
        if (!this.inventory) return;
        await this.inventory.grantOwnedItem(accountId, cosmeticId, reason);
    }

    async mintToWallet(walletAddress: string, amount: number): Promise<DevnetMintResult> {
        assertPositiveInteger(amount, 'mint amount');
        const destination = await getOrCreateAssociatedTokenAccount(this.connection, this.payer, this.mint, new PublicKey(walletAddress));
        const signature = await mintTo(this.connection, this.payer, this.mint, destination, this.authority, amount, [], undefined, TOKEN_PROGRAM_ID);
        return { mintAddress: this.mintAddress, signature };
    }

    async transferBetweenWallets(fromWalletAddress: string, toWalletAddress: string, amount: number): Promise<DevnetTransferResult> {
        assertPositiveInteger(amount, 'transfer amount');
        if (!('secretKey' in this.payer)) throw new Error('transferBetweenWallets requires payer to sign for the source wallet in devnet tooling');
        const owner = new PublicKey(fromWalletAddress);
        if (!owner.equals(this.payer.publicKey)) throw new Error('source wallet must match payer public key for direct devnet transfer');
        const sourceTokenAccount = await getOrCreateAssociatedTokenAccount(this.connection, this.payer, this.mint, owner);
        const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(this.connection, this.payer, this.mint, new PublicKey(toWalletAddress));
        const tx = new Transaction().add(createTransferInstruction(sourceTokenAccount, destinationTokenAccount, owner, amount, [], TOKEN_PROGRAM_ID));
        const signature = await sendAndConfirmTransaction(this.connection, tx, [this.payer as Keypair]);
        return { signature, sourceTokenAccount: sourceTokenAccount.toBase58(), destinationTokenAccount: destinationTokenAccount.toBase58() };
    }
}

async function getOrCreateAssociatedTokenAccount(connection: Connection, payer: Signer, mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    const ata = await getAssociatedTokenAddress(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    try {
        await getAccount(connection, ata, 'confirmed', TOKEN_PROGRAM_ID);
        return ata;
    } catch (error) {
        if (!(error instanceof Error) || !/could not find account|Failed to find account/i.test(error.message)) throw error;
    }
    const tx = new Transaction().add(createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
    await sendAndConfirmTransaction(connection, tx, [payer]);
    return ata;
}

function assertPositiveInteger(value: number, label: string): void {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
}
