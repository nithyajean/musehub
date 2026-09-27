// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
pragma solidity 0.8.28;

import {TestBase, MockERC20} from "./util/Util.sol";
import {AgentTreasury} from "../src/AgentTreasury.sol";
import {IERC20} from "../src/lib/Shared.sol";

contract AgentTreasuryTest is TestBase {
    MockERC20 quote;
    AgentTreasury treasury;

    uint256 oracleKey = 0xA11CE;
    address oracle;
    address owner = address(0x0117E7);
    address agentWallet = address(0xA6E7);

    bytes32 constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 constant VOUCHER_TYPEHASH =
        keccak256("Voucher(address recipient,uint256 amount,uint256 nonce,uint256 deadline)");

    function setUp() public {
        oracle = vm.addr(oracleKey);
        quote = new MockERC20("USD Quote", "USDQ");
        treasury = new AgentTreasury(IERC20(address(quote)), oracle, owner);
        quote.mint(address(treasury), 1_000e18);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("MuseHub AgentTreasury")),
                keccak256(bytes("1")),
                block.chainid,
                address(treasury)
            )
        );
    }

    function _sign(uint256 key, address recipient, uint256 amount, uint256 nonce, uint256 deadline)
        internal
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(VOUCHER_TYPEHASH, recipient, amount, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function testClaimPaysRecipient() public {
        uint256 deadline = block.timestamp + 1 days;
        bytes memory sig = _sign(oracleKey, agentWallet, 250e18, 1, deadline);
        treasury.claim(agentWallet, 250e18, 1, deadline, sig);
        assertEq(quote.balanceOf(agentWallet), 250e18);
        assertEq(quote.balanceOf(address(treasury)), 750e18);
        assertTrue(treasury.nonceUsed(1));
    }

    function testIsValidVoucherPreflight() public {
        uint256 deadline = block.timestamp + 1 days;
        bytes memory sig = _sign(oracleKey, agentWallet, 10e18, 7, deadline);
        assertTrue(treasury.isValidVoucher(agentWallet, 10e18, 7, deadline, sig));
        treasury.claim(agentWallet, 10e18, 7, deadline, sig);
        assertFalse(treasury.isValidVoucher(agentWallet, 10e18, 7, deadline, sig));
    }

    function testReplayReverts() public {
        uint256 deadline = block.timestamp + 1 days;
        bytes memory sig = _sign(oracleKey, agentWallet, 10e18, 2, deadline);
        treasury.claim(agentWallet, 10e18, 2, deadline, sig);
        vm.expectRevert(bytes("nonce used"));
        treasury.claim(agentWallet, 10e18, 2, deadline, sig);
    }

    function testWrongSignerReverts() public {
        uint256 deadline = block.timestamp + 1 days;
        bytes memory sig = _sign(0xBADBAD, agentWallet, 10e18, 3, deadline);
        vm.expectRevert(bytes("bad signature"));
        treasury.claim(agentWallet, 10e18, 3, deadline, sig);
    }

    function testTamperedAmountReverts() public {
        uint256 deadline = block.timestamp + 1 days;
        bytes memory sig = _sign(oracleKey, agentWallet, 10e18, 4, deadline);
        vm.expectRevert(bytes("bad signature"));
        treasury.claim(agentWallet, 11e18, 4, deadline, sig);
    }

    function testExpiredReverts() public {
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _sign(oracleKey, agentWallet, 10e18, 5, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(bytes("voucher expired"));
        treasury.claim(agentWallet, 10e18, 5, deadline, sig);
    }

    function testSetOracleOnlyOwner() public {
        address newOracle = address(0xBEEF);
        vm.expectRevert(bytes("not owner"));
        treasury.setOracle(newOracle);
        vm.prank(owner);
        treasury.setOracle(newOracle);
        assertEq(treasury.oracle(), newOracle);
    }

    function testRescueCannotTouchQuote() public {
        vm.prank(owner);
        vm.expectRevert(bytes("quote locked"));
        treasury.rescue(IERC20(address(quote)), owner, 1);
    }
}
