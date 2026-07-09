# Lootbox odds and compliance note

Lunar Pup's `moon-crate` lootbox is server-authoritative. The server spends `100` moon bones, commits to the roll seed by storing the seed's SHA-256 hash, rolls against the published rarity odds, grants the cosmetic, and records the complete outcome in the event ledger.

## Published odds

The public endpoint `GET /lootbox/odds` returns the same constants used by the roll code in `src/server/lootbox.ts`:

- common: 70%
- rare: 20%
- epic: 8%
- legendary: 2%

The endpoint also discloses the box id, box price, and duplicate refund. Do not duplicate these values in client code or docs-derived runtime code; the server module is the source of truth.

## Duplicate refund

If a roll lands on a cosmetic the account already owns, the server does not grant another copy. It refunds `25` moon bones and records `duplicate: true` plus the refund amount in the `lootbox_roll` ledger payload.

## Ledger policy

Every successful roll appends one `lootbox_roll` event with:

- `box`
- `cost`
- `seedCommitment`
- `result` (`cosmeticId`, display name, rarity, slot, duplicate flag)
- `refund`
- ending `balance`

Currency spend, refund, and item grant events are still emitted by the currency/inventory service. The `lootbox_roll` event is the audit record for the roll itself.

## Regulatory note

Token-purchasable lootboxes need region gating and legal counsel before any mainnet use. Do not enable token-purchased boxes in production until counsel has reviewed the jurisdictions, disclosures, age gating, refund policy, and odds presentation.
