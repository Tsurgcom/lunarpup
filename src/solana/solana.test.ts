import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { cosmeticMetadataUri, cosmeticPackageIdFromUri } from './metadata.ts';

describe('Solana offline contracts', () => {
    test('cosmetic NFT metadata URI encodes package ids without RPC', () => {
        const uri = cosmeticMetadataUri('moon board/legendary');

        expect(uri).toBe('lunarpup://cosmetic/moon%20board%2Flegendary?cosmeticPackageId=moon%20board%2Flegendary');
        expect(cosmeticPackageIdFromUri(uri)).toBe('moon board/legendary');
    });

    test('mainnet launch script has both fail-closed gates', () => {
        const script = readFileSync('scripts/solana/launch-mainnet.ts', 'utf8');

        expect(script).toContain('Human-only mainnet launch gate');
        expect(script).toContain('MAINNET_LAUNCH_CONFIRM');
        expect(script).toContain('YES_I_AM_SURE');
        expect(script).toContain("answer !== 'y'");
        expect(script).toContain('process.stdin.isTTY');
    });

    test('Solana docs require mocked RPC for tests', () => {
        const docs = readFileSync('docs/solana.md', 'utf8');

        expect(docs).toContain('Tests must inject mocked RPC/UMI clients. They must not hit devnet.');
        expect(docs).toContain('https://api.devnet.solana.com');
    });
});
