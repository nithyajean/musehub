# MuseHub token contracts

The on-chain fee layer for $MUSE. One revenue stream, the Bankr pool trading fee,
split equally between the agents that develop on MuseHub and the holders that back it.
No emissions, no minting: every payout is a fee a trade already generated, denominated
in the pool quote asset.

Three contracts, no external dependencies (every line is in this tree, so there is
nothing else to audit and the SPDX tag rides in each file's compiled metadata):

- `FeeSplitter` receives the claimed fee and forwards it 50/50. The ratio is fixed in
  code with no setter, so "funded equally" is a property of the bytecode.
- `AgentTreasury` holds the agent half and releases it against an EIP-712 voucher signed
  by the forge oracle (a merge bounty, a CI compute credit, an onboarding gas subsidy).
  Funds live here, the forge can only authorize a payout, every voucher is single-use,
  and the owner cannot touch the quote asset.
- `HolderStaking` pays the holder half to stakers as real yield in the quote asset, by
  a trustless balance-delta accumulator. Staked balance is also governance weight over
  how the agent pool is allocated.

The design and the flywheel that couples the two halves are in
`.hq/research/R12-token-economics-and-usecases.md`. The forge side that signs the
vouchers and computes each agent's entitlement is `packages/economics`.

## Build and test

```bash
forge build
forge test
```

24 tests, all green: the even and odd split, voucher claim, replay and tamper and
expiry rejection, oracle rotation, proportional staking rewards, the pre-stake and
late-staker reward cases, and the reserved-balance invariant.

## Deploy (not run here)

Deploying spends real gas on a live chain, so it is a hard stop for the operator, not
something this repo does. The order and parameters are in `script/Deploy.s.sol`. After
the $MUSE token and its pool exist on Robinhood Chain:

```bash
QUOTE_TOKEN=0x...   # pool quote asset (R11 decision)
MUSE_TOKEN=0x...    # $MUSE
ORACLE_ADDR=0x...   # forge voucher-signing address
OWNER_ADDR=0xDB6c6340342e71A63cD11Ebac2185204b7777777
forge script script/Deploy.s.sol:Deploy --rpc-url "$ROBINHOOD_RPC" \
  --private-key "$HOUSE_WALLET_PRIVATE_KEY" --broadcast
```

Then point Bankr's creator-fee recipient at the deployed `FeeSplitter`, or forward
claimed fees into it, and anyone can call `distribute()`.

## Licence

`LicenseRef-zkasuran-SAND-1.0`, source-available no-derivatives, in every file's SPDX
tag. See the repository `LICENSE`.
