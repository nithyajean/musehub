// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
pragma solidity 0.8.28;

import {IERC20, SafeTransferLib, ReentrancyGuard} from "./lib/Shared.sol";

/// FeeSplitter routes the pool's claimed trading fee, denominated in the pool quote
/// asset, the instant it lands. The owner takes a small fixed share off the top
/// (`ownerFeeBps`, 0.15% at launch), then the remainder is split 50/50 between the
/// agents that develop on MuseHub and the $MUSE holders that back it. Both the owner
/// share and the 50/50 split are fixed in code with no setter. The owner share is also
/// capped well below the two pools, so "agents and holders share the bulk equally" is
/// a property of the bytecode, not a promise anyone can edit.
///
/// The Bankr creator fee is claimed to a wallet and forwarded here (or, if Bankr
/// permits a contract as the fee recipient, this address is set directly). Either
/// way `distribute()` is permissionless: anyone can push the accrued balance to the
/// three destinations, so no privileged keeper can stall the flow.
contract FeeSplitter is ReentrancyGuard {
    using SafeTransferLib for IERC20;

    uint256 public constant BPS = 10_000;
    /// The owner share can never exceed 20%, so the agent and holder pools always
    /// take the large majority and always take it in equal halves.
    uint256 public constant MAX_OWNER_BPS = 2_000;

    /// The pool quote asset the fee accrues in.
    IERC20 public immutable quote;
    /// Sink for the agent half: funds CI compute, merge bounties and onboarding gas.
    address public immutable agentSink;
    /// Sink for the holder half: the staking distributor that pays real yield.
    address public immutable holderSink;
    /// Owner fee recipient (the project owner). May be the zero address only when the
    /// owner share is zero.
    address public immutable ownerRecipient;
    /// Owner share of each distribution, in basis points. 15 = 0.15% at launch.
    uint256 public immutable ownerFeeBps;

    event Distributed(
        uint256 ownerAmount, uint256 agentAmount, uint256 holderAmount, address indexed caller
    );

    constructor(
        IERC20 quote_,
        address agentSink_,
        address holderSink_,
        address ownerRecipient_,
        uint256 ownerFeeBps_
    ) {
        require(address(quote_) != address(0), "quote=0");
        require(agentSink_ != address(0) && holderSink_ != address(0), "sink=0");
        require(agentSink_ != holderSink_, "sinks equal");
        require(ownerFeeBps_ <= MAX_OWNER_BPS, "owner bps too high");
        require(ownerFeeBps_ == 0 || ownerRecipient_ != address(0), "owner=0");
        quote = quote_;
        agentSink = agentSink_;
        holderSink = holderSink_;
        ownerRecipient = ownerRecipient_;
        ownerFeeBps = ownerFeeBps_;
    }

    /// Take the owner share off the top, then split the rest 50/50 and forward each
    /// part. The single odd base unit on an odd remainder goes to the holder side; it
    /// is dust and keeps the split deterministic. Reverts on a zero balance so a no-op
    /// call cannot emit a misleading event.
    function distribute()
        external
        nonReentrant
        returns (uint256 ownerAmount, uint256 agentAmount, uint256 holderAmount)
    {
        uint256 bal = quote.balanceOf(address(this));
        require(bal > 0, "nothing to distribute");
        ownerAmount = (bal * ownerFeeBps) / BPS;
        uint256 rest = bal - ownerAmount;
        agentAmount = rest / 2;
        holderAmount = rest - agentAmount;
        if (ownerAmount > 0) quote.safeTransfer(ownerRecipient, ownerAmount);
        quote.safeTransfer(agentSink, agentAmount);
        quote.safeTransfer(holderSink, holderAmount);
        // Roll the holder half into live rewards immediately. Best-effort so a sink
        // without a sync hook (or a future replacement) never blocks distribution.
        (bool synced, ) = holderSink.call(abi.encodeWithSignature("sync()"));
        synced; // result intentionally ignored: distribution must not depend on it
        emit Distributed(ownerAmount, agentAmount, holderAmount, msg.sender);
    }
}
