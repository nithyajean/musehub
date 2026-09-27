// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
pragma solidity 0.8.28;

import {IERC20, SafeTransferLib, ReentrancyGuard} from "./lib/Shared.sol";

/// HolderStaking pays the holder half of the fee stream to $MUSE holders as real
/// yield. Stake $MUSE, earn a pro-rata share of the quote-asset fees the pool
/// generates. Rewards are only ever fees already collected: there is no emission
/// schedule and nothing is minted, so the yield cannot outrun what trading earned.
///
/// The reward source is trustless. FeeSplitter (or anyone) transfers the quote asset
/// in, and `sync()` rolls the new balance into the per-share accumulator. Because the
/// reward asset and the staked asset are different tokens, the contract can tell a
/// fresh fee drip from staked principal by balance alone, with no privileged notifier.
///
/// Staked balance is also each holder's governance weight over how the agent pool is
/// allocated. The vote itself is tallied off-chain from `votingPower`; this contract
/// is the weight of record.
contract HolderStaking is ReentrancyGuard {
    using SafeTransferLib for IERC20;

    uint256 private constant ACC = 1e18;

    IERC20 public immutable stakeToken; // $MUSE
    IERC20 public immutable rewardToken; // pool quote asset

    uint256 public totalStaked;
    mapping(address => uint256) public staked;

    /// Fees per staked token, scaled by ACC, accumulated over all syncs.
    uint256 public accRewardPerShare;
    /// Quote asset already rolled into the accumulator and still owed to stakers.
    /// balanceOf(this) minus this is the unaccounted drip a sync will pick up.
    uint256 public reserved;

    mapping(address => uint256) public userRewardPerSharePaid;
    mapping(address => uint256) public rewards;

    event Staked(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event RewardPaid(address indexed account, uint256 amount);
    event Synced(uint256 newRewards, uint256 accRewardPerShare);

    constructor(IERC20 stakeToken_, IERC20 rewardToken_) {
        require(address(stakeToken_) != address(0) && address(rewardToken_) != address(0), "token=0");
        require(address(stakeToken_) != address(rewardToken_), "tokens equal");
        stakeToken = stakeToken_;
        rewardToken = rewardToken_;
    }

    /// Roll any newly-arrived quote asset into the per-share accumulator. Permissionless
    /// and idempotent. Integer-division dust stays unaccounted and is picked up next time.
    function sync() public {
        if (totalStaked == 0) return;
        uint256 bal = rewardToken.balanceOf(address(this));
        uint256 newDrip = bal - reserved;
        if (newDrip == 0) return;
        uint256 perShare = (newDrip * ACC) / totalStaked;
        if (perShare == 0) return;
        accRewardPerShare += perShare;
        // Only reserve what the per-share figure actually represents, so reserved never
        // drifts above the true claimable total and the dust rolls forward.
        reserved += (perShare * totalStaked) / ACC;
        emit Synced(newDrip, accRewardPerShare);
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        sync();
        _crystallize(msg.sender);
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        require(staked[msg.sender] >= amount, "insufficient stake");
        sync();
        _crystallize(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        stakeToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function claim() external nonReentrant returns (uint256 owed) {
        sync();
        _crystallize(msg.sender);
        owed = rewards[msg.sender];
        require(owed > 0, "nothing to claim");
        rewards[msg.sender] = 0;
        reserved -= owed;
        rewardToken.safeTransfer(msg.sender, owed);
        emit RewardPaid(msg.sender, owed);
    }

    /// Withdraw all stake and all rewards in one call.
    function exit() external nonReentrant {
        uint256 amount = staked[msg.sender];
        require(amount > 0, "no stake");
        sync();
        _crystallize(msg.sender);
        staked[msg.sender] = 0;
        totalStaked -= amount;
        stakeToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
        uint256 owed = rewards[msg.sender];
        if (owed > 0) {
            rewards[msg.sender] = 0;
            reserved -= owed;
            rewardToken.safeTransfer(msg.sender, owed);
            emit RewardPaid(msg.sender, owed);
        }
    }

    /// Claimable quote asset for an account, including a drip that has arrived but not
    /// yet been synced, so a read is accurate without a state-changing call first.
    function earned(address account) public view returns (uint256) {
        uint256 acc = accRewardPerShare;
        if (totalStaked > 0) {
            uint256 newDrip = rewardToken.balanceOf(address(this)) - reserved;
            if (newDrip > 0) acc += (newDrip * ACC) / totalStaked;
        }
        return (staked[account] * (acc - userRewardPerSharePaid[account])) / ACC + rewards[account];
    }

    /// Governance weight of record: one staked $MUSE is one vote on agent-pool allocation.
    function votingPower(address account) external view returns (uint256) {
        return staked[account];
    }

    function _crystallize(address account) private {
        rewards[account] += (staked[account] * (accRewardPerShare - userRewardPerSharePaid[account])) / ACC;
        userRewardPerSharePaid[account] = accRewardPerShare;
    }
}
