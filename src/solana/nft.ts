import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, keypairIdentity, percentAmount, publicKey, type KeypairSigner, type Umi } from '@metaplex-foundation/umi';
import { Connection, PublicKey } from '@solana/web3.js';
import type { CurrencyService } from '../contracts/services.ts';
import { DEVNET_RPC_URL, type CosmeticNftMintResult, type CosmeticNftService } from './interfaces.ts';
import { cosmeticMetadataUri, cosmeticPackageIdFromUri } from './metadata.ts';

export interface SolanaNftServiceOptions {
    umi?: Umi;
    connection?: Connection;
    rpcUrl?: string;
    authority: KeypairSigner;
    inventory: CurrencyService;
}

interface MintedCosmeticRecord {
    mintAddress: string;
    ownerAddress: string;
    cosmeticPackageId: string;
    metadataUri: string;
}

export class MetaplexDevnetNftService implements CosmeticNftService {
    readonly umi: Umi;
    readonly connection: Connection;
    readonly authority: KeypairSigner;
    readonly inventory: CurrencyService;
    private readonly mintedByMint = new Map<string, MintedCosmeticRecord>();

    constructor(options: SolanaNftServiceOptions) {
        this.connection = options.connection ?? new Connection(options.rpcUrl ?? DEVNET_RPC_URL, 'confirmed');
        this.authority = options.authority;
        this.inventory = options.inventory;
        this.umi = (options.umi ?? createUmi(options.rpcUrl ?? DEVNET_RPC_URL)).use(mplTokenMetadata()).use(keypairIdentity(options.authority));
    }

    async mintCosmetic(walletAddress: string, cosmeticPackageId: string, options: { name?: string; symbol?: string; uri?: string } = {}): Promise<CosmeticNftMintResult> {
        if (cosmeticPackageId.length === 0) throw new Error('cosmeticPackageId is required');
        const mint = generateSigner(this.umi);
        const metadataUri = options.uri ?? cosmeticMetadataUri(cosmeticPackageId);
        const builder = createNft(this.umi, {
            mint,
            name: options.name ?? `Lunar Pup ${cosmeticPackageId}`,
            symbol: options.symbol ?? 'LPUP',
            uri: metadataUri,
            sellerFeeBasisPoints: percentAmount(0),
            tokenOwner: publicKey(walletAddress),
        });
        const result = await builder.sendAndConfirm(this.umi);
        const signature = Buffer.from(result.signature).toString('base64');
        const mintAddress = mint.publicKey.toString();
        this.mintedByMint.set(mintAddress, { mintAddress, ownerAddress: walletAddress, cosmeticPackageId, metadataUri });
        return { mintAddress, signature, metadataUri, cosmeticPackageId };
    }

    async grantOwnedCosmetics(accountId: string, walletAddress: string): Promise<string[]> {
        const wallet = new PublicKey(walletAddress);
        const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(wallet, { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') });
        const granted: string[] = [];
        for (const account of tokenAccounts.value) {
            const info = account.account.data.parsed.info;
            const mintAddress = String(info.mint);
            const tokenAmount = info.tokenAmount;
            const ownsExactlyOneNft = Number(tokenAmount.amount) >= 1 && Number(tokenAmount.decimals) === 0;
            const record = this.mintedByMint.get(mintAddress);
            if (!ownsExactlyOneNft || !record) continue;
            const cosmeticPackageId = cosmeticPackageIdFromUri(record.metadataUri);
            if (!cosmeticPackageId) continue;
            await this.inventory.grantOwnedItem(accountId, cosmeticPackageId, `solana nft ownership ${mintAddress}`);
            granted.push(cosmeticPackageId);
        }
        return [...new Set(granted)].sort();
    }
}

