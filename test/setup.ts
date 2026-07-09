// Bun 1.3.14 crashes when bigint-buffer loads its native N-API binding.
// Solana web3 works with bigint-buffer's browser/pure-JS path, so force that path in tests.
(process as typeof process & { browser?: boolean }).browser = true;
