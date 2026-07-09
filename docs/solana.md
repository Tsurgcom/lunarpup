# Solana devnet layer

Lunar Pup keeps chain code under `src/solana/`. Game code imports the small TypeScript interfaces from `src/solana/interfaces.ts`; it does not import `@solana/web3.js`, SPL Token, or Metaplex directly.

## Devnet setup

1. Create or import a devnet authority keypair outside the repo. Do not commit keypairs.
2. Point services at devnet only:

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
```

3. Construct services server-side with injected connections/signers:

```ts
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SolanaDevnetTokenService } from '../src/solana/token.ts';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const service = new SolanaDevnetTokenService({
  connection,
  payer: authorityKeypair,
  mint: new PublicKey(process.env.DEVNET_TOKEN_MINT!),
});
```

Tests must inject mocked RPC/UMI clients. They must not hit devnet.

## Faucet

Use Solana devnet faucet funding for the authority and test wallets:

```bash
solana config set --url devnet
solana airdrop 2 <AUTHORITY_PUBLIC_KEY>
solana airdrop 1 <PLAYER_PUBLIC_KEY>
```

If the public faucet is rate-limited, wait and retry or use the official web faucet. Do not switch production code to mainnet-beta to work around faucet limits.

## Wallet sign-in

`src/server/wallet.ts` registers two HTTP endpoints through `createServerRouter()`:

- `POST /wallet/challenge` with `{ "playerId": "...", "walletAddress": "..." }`
- `POST /wallet/verify` with `{ "playerId": "...", "walletAddress": "...", "nonce": "...", "signature": "<base64>" }`

The server challenge message binds player id, wallet address, nonce, issue time, and the phrase `Devnet only.` The server verifies the Ed25519 signature against the Solana public key and records the wallet session for that player.

## SPL token service

`SolanaDevnetTokenService` implements the `CurrencyService` contract plus devnet SPL helpers:

- `getBalance(walletAddress)` reads the wallet ATA balance.
- `mintToWallet(walletAddress, amount)` mints devnet tokens into the wallet ATA.
- `transferBetweenWallets(from, to, amount)` sends tokens when the injected payer owns the source wallet.
- Optional `inventory` delegates ledger/inventory methods to the existing SQLite-backed service.

The service accepts an injected `Connection`, so tests mock RPC instead of contacting devnet.

## Cosmetic NFTs

`MetaplexDevnetNftService` mints Metaplex NFTs on devnet. The metadata URI encodes the cosmetic package id:

```text
lunarpup://cosmetic/<package-id>?cosmeticPackageId=<package-id>
```

`grantOwnedCosmetics(accountId, walletAddress)` checks wallet token ownership and grants matching inventory items through the `CurrencyService` inventory methods. Tests use an in-memory UMI sender and mocked parsed token accounts.

## Mainnet launch gate

`scripts/solana/launch-mainnet.ts` is human-only. It refuses to run unless both gates pass:

1. `MAINNET_LAUNCH_CONFIRM=YES_I_AM_SURE`
2. An interactive terminal prompt receives exactly `y`

Non-interactive shells, CI, bots, and missing env confirmation fail closed. The script contains no autonomous launch path.
