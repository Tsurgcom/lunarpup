STATUS: open
PRIORITY: P2
COMPLEXITY: high
TOUCHES: src/solana/, scripts/solana/
BLOCKED_BY: 01

# 05 — Solana layer (devnet only)

Wallet sign-in, SPL token, and Metaplex NFT minting — entirely behind a clean interface so
the game never imports chain code directly. DEVNET ONLY.

- Wallet sign-in (sign-message auth linking wallet → player identity).
- SPL token: devnet mint + balance/transfer service implementing the currency interface.
- Metaplex: mint an NFT pointing at a cosmetic package id (content-addressed URI);
  ownership check grants the cosmetic in inventory.
- `scripts/solana/launch-mainnet.ts` exists but hard-gates on explicit human
  confirmation + env flag; documented as a human-only action.

DONE WHEN: devnet round-trip in tests/smoke (sign in, receive token, mint NFT, ownership
reflects in inventory); zero mainnet endpoints reachable from game code; tsc+tests green.
