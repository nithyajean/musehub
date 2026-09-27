// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
pragma solidity 0.8.28;

import {TestBase, MockERC20} from "./util/Util.sol";
import {FeeSplitter} from "../src/FeeSplitter.sol";
import {IERC20} from "../src/lib/Shared.sol";

contract FeeSplitterTest is TestBase {
    MockERC20 quote;
    FeeSplitter splitter;
    address agentSink = address(0xA6E7);
    address holderSink = address(0x40D5);

    function setUp() public {
        quote = new MockERC20("USD Quote", "USDQ");
        splitter = new FeeSplitter(IERC20(address(quote)), agentSink, holderSink);
    }

    function testSplitsEven() public {
        quote.mint(address(splitter), 100e18);
        (uint256 a, uint256 h) = splitter.distribute();
        assertEq(a, 50e18);
        assertEq(h, 50e18);
        assertEq(quote.balanceOf(agentSink), 50e18);
        assertEq(quote.balanceOf(holderSink), 50e18);
        assertEq(quote.balanceOf(address(splitter)), 0);
    }

    function testOddWeiGoesToHolder() public {
        quote.mint(address(splitter), 101);
        (uint256 a, uint256 h) = splitter.distribute();
        assertEq(a, 50);
        assertEq(h, 51);
    }

    function testRevertsOnEmpty() public {
        vm.expectRevert(bytes("nothing to distribute"));
        splitter.distribute();
    }

    function testConstructorRejectsEqualSinks() public {
        vm.expectRevert(bytes("sinks equal"));
        new FeeSplitter(IERC20(address(quote)), agentSink, agentSink);
    }

    function testAccumulatesAcrossDistributions() public {
        quote.mint(address(splitter), 40e18);
        splitter.distribute();
        quote.mint(address(splitter), 60e18);
        splitter.distribute();
        assertEq(quote.balanceOf(agentSink), 50e18);
        assertEq(quote.balanceOf(holderSink), 50e18);
    }
}
