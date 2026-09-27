// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
pragma solidity 0.8.28;

import {IERC20, SafeTransferLib, ReentrancyGuard, Owned} from "./lib/Shared.sol";

/// AgentTreasury holds the agent half of the fee stream and pays it out to the
/// agents that earn it: CI compute credits, merge bounties and onboarding gas. The
/// forge is the only thing that knows who merged what and which CI runs ran, so the
/// forge is the oracle. It signs an EIP-712 voucher (recipient, amount, nonce,
/// deadline); the agent presents it here and the contract releases funds only if the
/// signature is the oracle's and the nonce is unspent.
///
/// The contract never trusts the forge with custody. Funds live here and the forge
/// can only authorize a payout, never move one itself. Every voucher is single-use.
/// The owner can rotate the oracle key (key compromise) but cannot touch the quote
/// asset, so the agent pool cannot be drained by the operator.
contract AgentTreasury is ReentrancyGuard, Owned {
    using SafeTransferLib for IERC20;

    IERC20 public immutable quote;
    /// The forge's voucher-signing key. Off-chain it maps to the same identity that
    /// signs the forge's audit trail. Rotatable by the owner.
    address public oracle;

    mapping(uint256 => bool) public nonceUsed;

    bytes32 private constant VOUCHER_TYPEHASH =
        keccak256("Voucher(address recipient,uint256 amount,uint256 nonce,uint256 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private immutable _nameHash;
    bytes32 private immutable _versionHash;
    uint256 private immutable _cachedChainId;
    bytes32 private immutable _cachedDomainSeparator;

    event Claimed(address indexed recipient, uint256 amount, uint256 indexed nonce);
    event OracleChanged(address indexed from, address indexed to);

    constructor(IERC20 quote_, address oracle_, address owner_) Owned(owner_) {
        require(address(quote_) != address(0), "quote=0");
        require(oracle_ != address(0), "oracle=0");
        quote = quote_;
        oracle = oracle_;
        _nameHash = keccak256(bytes("MuseHub AgentTreasury"));
        _versionHash = keccak256(bytes("1"));
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();
        emit OracleChanged(address(0), oracle_);
    }

    function setOracle(address next) external onlyOwner {
        require(next != address(0), "oracle=0");
        emit OracleChanged(oracle, next);
        oracle = next;
    }

    /// Redeem an oracle-signed voucher. The recipient is the agent's bound wallet, set
    /// by the forge from the amount it computed for that agent this epoch. Reverts on a
    /// spent nonce, an expired deadline or a signature that is not the oracle's.
    function claim(
        address recipient,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(block.timestamp <= deadline, "voucher expired");
        require(!nonceUsed[nonce], "nonce used");
        bytes32 structHash = keccak256(abi.encode(VOUCHER_TYPEHASH, recipient, amount, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        require(_recover(digest, signature) == oracle, "bad signature");
        nonceUsed[nonce] = true;
        quote.safeTransfer(recipient, amount);
        emit Claimed(recipient, amount, nonce);
    }

    /// True if a voucher would verify right now. A read-only preflight the forge and
    /// the dashboard use before presenting a claim, so no gas is wasted on a bad one.
    function isValidVoucher(
        address recipient,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external view returns (bool) {
        if (block.timestamp > deadline || nonceUsed[nonce]) return false;
        bytes32 structHash = keccak256(abi.encode(VOUCHER_TYPEHASH, recipient, amount, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        return _recover(digest, signature) == oracle;
    }

    /// Recover a wrongly-sent token. Cannot touch the quote asset, so the agent pool
    /// itself is never at the owner's discretion.
    function rescue(IERC20 token, address to, uint256 amount) external onlyOwner {
        require(address(token) != address(quote), "quote locked");
        token.safeTransfer(to, amount);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    function _domainSeparator() private view returns (bytes32) {
        return block.chainid == _cachedChainId ? _cachedDomainSeparator : _buildDomainSeparator();
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, _nameHash, _versionHash, block.chainid, address(this))
        );
    }

    /// ecrecover with an EIP-2 low-s malleability guard and a strict 65-byte layout.
    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
