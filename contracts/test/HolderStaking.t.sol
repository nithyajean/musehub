// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
pragma solidity 0.8.28;

import {TestBase, MockERC20} from "./util/Util.sol";
import {HolderStaking} from "../src/HolderStaking.sol";
import {IERC20} from "../src/lib/Shared.sol";

contract HolderStakingTest is TestBase {
    MockERC20 muse; // staking token
    MockERC20 quote; // reward token
    HolderStaking staking;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        muse = new MockERC20("Muse", "MUSE");
        quote = new MockERC20("USD Quote", "USDQ");
        staking = new HolderStaking(IERC20(address(muse)), IERC20(address(quote)));
        muse.mint(alice, 1_000e18);
        muse.mint(bob, 1_000e18);
        vm.prank(alice);
        muse.approve(address(staking), type(uint256).max);
        vm.prank(bob);
        muse.approve(address(staking), type(uint256).max);
    }

    function _stake(address who, uint256 amount) internal {
        vm.prank(who);
        staking.stake(amount);
    }

    function _drip(uint256 amount) internal {
        quote.mint(address(staking), amount);
        staking.sync();
    }

    function testConstructorRejectsEqualTokens() public {
        vm.expectRevert(bytes("tokens equal"));
        new HolderStaking(IERC20(address(muse)), IERC20(address(muse)));
    }

    function testEqualStakeSplitsRewardEvenly() public {
        _stake(alice, 100e18);
        _stake(bob, 100e18);
        _drip(100e18);
        assertEq(staking.earned(alice), 50e18);
        assertEq(staking.earned(bob), 50e18);
    }

    function testProportionalToStake() public {
        _stake(alice, 300e18);
        _stake(bob, 100e18);
        _drip(40e18);
        assertEq(staking.earned(alice), 30e18);
        assertEq(staking.earned(bob), 10e18);
    }

    function testClaimTransfersReward() public {
        _stake(alice, 100e18);
        _stake(bob, 100e18);
        _drip(100e18);
        vm.prank(alice);
        uint256 owed = staking.claim();
        assertEq(owed, 50e18);
        assertEq(quote.balanceOf(alice), 50e18);
        assertEq(staking.earned(alice), 0);
    }

    function testDripBeforeStakeGoesToFirstStaker() public {
        quote.mint(address(staking), 100e18); // arrives with no stakers
        staking.sync(); // no-op, nothing distributed
        _stake(alice, 100e18);
        assertEq(staking.earned(alice), 100e18);
    }

    function testLateStakerGetsNoPastRewards() public {
        _stake(alice, 100e18);
        _drip(100e18); // all to alice
        _stake(bob, 100e18); // joins after the drip
        assertEq(staking.earned(alice), 100e18);
        assertEq(staking.earned(bob), 0);
        _drip(100e18); // now split evenly
        assertEq(staking.earned(alice), 150e18);
        assertEq(staking.earned(bob), 50e18);
    }

    function testWithdrawReturnsPrincipal() public {
        _stake(alice, 100e18);
        vm.prank(alice);
        staking.withdraw(40e18);
        assertEq(muse.balanceOf(alice), 940e18);
        assertEq(staking.staked(alice), 60e18);
        assertEq(staking.totalStaked(), 60e18);
    }

    function testExitReturnsStakeAndReward() public {
        _stake(alice, 100e18);
        _drip(30e18);
        vm.prank(alice);
        staking.exit();
        assertEq(muse.balanceOf(alice), 1_000e18);
        assertEq(quote.balanceOf(alice), 30e18);
        assertEq(staking.staked(alice), 0);
    }

    function testClaimRevertsWhenNothing() public {
        _stake(alice, 100e18);
        vm.prank(alice);
        vm.expectRevert(bytes("nothing to claim"));
        staking.claim();
    }

    function testReservedTracksClaimable() public {
        _stake(alice, 100e18);
        _stake(bob, 100e18);
        _drip(100e18);
        assertEq(staking.reserved(), 100e18);
        vm.prank(alice);
        staking.claim();
        assertEq(staking.reserved(), 50e18);
        vm.prank(bob);
        staking.claim();
        assertEq(staking.reserved(), 0);
    }

    function testVotingPowerEqualsStake() public {
        _stake(alice, 250e18);
        assertEq(staking.votingPower(alice), 250e18);
    }
}
