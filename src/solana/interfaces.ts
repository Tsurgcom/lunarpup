import type { CurrencyService } from '../contracts/services.ts';

export const DEVNET_RPC_URL = 'https://api.devnet.solana.com';

export interface DevnetMintResult {
    mintAddress: string;
    signature: string;
}

export interface DevnetTransferResult {
    signature: string;
    sourceTokenAccount: string;
    destinationTokenAccount: string;
}

export interface SplTokenService extends CurrencyService {
    readonly mintAddress: string;
    mintToWallet(walletAddress: string, amount: number): Promise<DevnetMintResult>;
    transferBetweenWallets(fromWalletAddress: string, toWalletAddress: string, amount: number): Promise<DevnetTransferResult>;
}

export interface CosmeticNftMetadata {
    name: string;
    symbol: string;
    cosmeticPackageId: string;
    uri: string;
}

export interface CosmeticNftMintResult {
    mintAddress: string;
    signature: string;
    metadataUri: string;
    cosmeticPackageId: string;
}

export interface CosmeticNftService {
    mintCosmetic(walletAddress: string, cosmeticPackageId: string, options?: Partial<Pick<CosmeticNftMetadata, 'name' | 'symbol' | 'uri'>>): Promise<CosmeticNftMintResult>;
    grantOwnedCosmetics(accountId: string, walletAddress: string): Promise<string[]>;
}
