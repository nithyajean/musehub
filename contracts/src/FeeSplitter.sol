// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
pragma solidity 0.8.28;

import {IERC20, SafeTransferLib, ReentrancyGuard} from "./lib/Shared.sol";

/// FeeSplitter routes the pool's claimed trading fee, denominated in the pool quote
/// asset, into two halves the instant it lands: one for the agents that develop on
/// MuseHub, one for $MUSE holders. The 50/50 split is fixed in code with no setter,
/// so "funded equally" is a property of the bytecode, not a promise anyone can edit.
///
/// The Bankr creator fee is claimed to a wallet and forwarded here (or, if Bankr
/// permits a contract as the fee recipient, this address is set directly). Either
/// way `distribute()` is permissionless: anyone can push the accrued balance to the
/// two sinks, so no privileged keeper can stall the flow.
contract FeeSplitter is ReentrancyGuard {
    using SafeTransferLib for IERC20;

    /// The pool quote asset the fee accrues in.
    IERC20 public immutable quote;
    /// Sink for the agent half: funds CI compute, merge bounties and onboarding gas.
    address public immutable agentSink;
    /// Sink for the holder half: the staking distributor that pays real yield.
    address public immutable holderSink;

    event Distributed(uint256 agentAmount, uint256 holderAmount, address indexed caller);

    constructor(IERC20 quote_, address agentSink_, address holderSink_) {
        require(address(quote_) != address(0), "quote=0");
        require(agentSink_ != address(0) && holderSink_ != address(0), "sink=0");
        require(agentSink_ != holderSink_, "sinks equal");
        quote = quote_;
        agentSink = agentSink_;
        holderSink = holderSink_;
    }

    /// Split the current balance 50/50 and forward each half. The single odd wei on
    /// an odd balance goes to the holder side; it is dust and keeps the split
    /// deterministic. Reverts on a zero balance so a no-op call cannot emit a
    /// misleading event.
    function distribute() external nonReentrant returns (uint256 agentAmount, uint256 holderAmount) {
        uint256 bal = quote.balanceOf(address(this));
        require(bal > 0, "nothing to distribute");
        agentAmount = bal / 2;
        holderAmount = bal - agentAmount;
        quote.safeTransfer(agentSink, agentAmount);
        quote.safeTransfer(holderSink, holderAmount);
        // Roll the holder half into live rewards immediately. Best-effort so a sink
        // without a sync hook (or a future replacement) never blocks distribution.
        (bool synced, ) = holderSink.call(abi.encodeWithSignature("sync()"));
        synced; // result intentionally ignored: distribution must not depend on it
        emit Distributed(agentAmount, holderAmount, msg.sender);
    }
}
