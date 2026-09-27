// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
pragma solidity 0.8.28;

import {TestBase, MockERC20} from "./util/Util.sol";
import {FeeSplitter} from "../src/FeeSplitter.sol";
import {IERC20} from "../src/lib/Shared.sol";

contract FeeSplitterTest is TestBase {
    MockERC20 quote;
    address agentSink = address(0xA6E7);
    address holderSink = address(0x40D5);
    address ownerRecipient = address(0x0117E7);

    function setUp() public {
        quote = new MockERC20("USD Quote", "USDQ");
    }

    function mk(uint256 ownerBps) internal returns (FeeSplitter) {
        return new FeeSplitter(
            IERC20(address(quote)), agentSink, holderSink, ownerRecipient, ownerBps
        );
    }

    function testPureEvenSplitWhenNoOwnerShare() public {
        FeeSplitter s = mk(0);
        quote.mint(address(s), 100e18);
        (uint256 o, uint256 a, uint256 h) = s.distribute();
        assertEq(o, 0);
        assertEq(a, 50e18);
        assertEq(h, 50e18);
        assertEq(quote.balanceOf(ownerRecipient), 0);
    }

    function testOddWeiGoesToHolder() public {
        FeeSplitter s = mk(0);
        quote.mint(address(s), 101);
        (uint256 o, uint256 a, uint256 h) = s.distribute();
        assertEq(o, 0);
        assertEq(a, 50);
        assertEq(h, 51);
    }

    function testOwnerTakesFifteenBpsThenSplitsRestEvenly() public {
        FeeSplitter s = mk(15); // 0.15%
        quote.mint(address(s), 100e18);
        (uint256 o, uint256 a, uint256 h) = s.distribute();
        assertEq(o, 15e16); // 0.15e18
        assertEq(a, 49_925e15); // 49.925e18
        assertEq(h, 49_925e15);
        assertEq(a, h); // agents and holders still equal on the remainder
        assertEq(o + a + h, 100e18);
        assertEq(quote.balanceOf(ownerRecipient), 15e16);
    }

    function testOwnerShareRoundsDownRemainderToHolder() public {
        FeeSplitter s = mk(15);
        quote.mint(address(s), 101);
        (uint256 o, uint256 a, uint256 h) = s.distribute();
        assertEq(o, 0); // 101*15/10000 = 0
        assertEq(a, 50);
        assertEq(h, 51);
        assertEq(o + a + h, 101);
    }

    function testRevertsOnEmpty() public {
        FeeSplitter s = mk(15);
        vm.expectRevert(bytes("nothing to distribute"));
        s.distribute();
    }

    function testConstructorRejectsEqualSinks() public {
        vm.expectRevert(bytes("sinks equal"));
        new FeeSplitter(IERC20(address(quote)), agentSink, agentSink, ownerRecipient, 15);
    }

    function testConstructorRejectsOwnerShareOverCap() public {
        vm.expectRevert(bytes("owner bps too high"));
        new FeeSplitter(IERC20(address(quote)), agentSink, holderSink, ownerRecipient, 2001);
    }

    function testConstructorRejectsZeroOwnerWithShare() public {
        vm.expectRevert(bytes("owner=0"));
        new FeeSplitter(IERC20(address(quote)), agentSink, holderSink, address(0), 15);
    }

    function testAccumulatesAcrossDistributions() public {
        FeeSplitter s = mk(0);
        quote.mint(address(s), 40e18);
        s.distribute();
        quote.mint(address(s), 60e18);
        s.distribute();
        assertEq(quote.balanceOf(agentSink), 50e18);
        assertEq(quote.balanceOf(holderSink), 50e18);
    }
}
