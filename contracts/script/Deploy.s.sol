// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
pragma solidity 0.8.28;

import {FeeSplitter} from "../src/FeeSplitter.sol";
import {AgentTreasury} from "../src/AgentTreasury.sol";
import {HolderStaking} from "../src/HolderStaking.sol";
import {IERC20} from "../src/lib/Shared.sol";

// Deploys the fee layer in dependency order: the two sinks first, then the splitter
// that points at them. Parameterized entirely by env vars so no address is baked in:
//
//   QUOTE_TOKEN    the pool quote asset the fee accrues in (decided in R11: USDG)
//   MUSE_TOKEN     the MUSE token launched via Bankr
//   ORACLE_ADDR    the forge voucher-signing address (economics signerAddress)
//   OWNER_ADDR     owner of AgentTreasury and the owner-fee recipient, the house EOA
//   OWNER_FEE_BPS  the owner share of each distribution, in basis points (15 = 0.15%)
//
// This spends real gas on a live chain, so it is NOT run here. It is the ready
// command for the operator, after the token and pool exist:
//
//   forge script script/Deploy.s.sol:Deploy \
//     --rpc-url "$ROBINHOOD_RPC" --private-key "$HOUSE_WALLET_PRIVATE_KEY" --broadcast
//
// After deploy, point Bankr's creator-fee recipient at the FeeSplitter (or forward
// claimed fees into it), then anyone can call distribute() to pay the owner share and
// split the rest 50/50.
interface Vm {
    function envAddress(string calldata) external view returns (address);
    function envUint(string calldata) external view returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract Deploy {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    function run()
        external
        returns (FeeSplitter splitter, AgentTreasury treasury, HolderStaking staking)
    {
        address quote = vm.envAddress("QUOTE_TOKEN");
        address muse = vm.envAddress("MUSE_TOKEN");
        address oracle = vm.envAddress("ORACLE_ADDR");
        address owner = vm.envAddress("OWNER_ADDR");
        uint256 ownerFeeBps = vm.envUint("OWNER_FEE_BPS");

        vm.startBroadcast();
        treasury = new AgentTreasury(IERC20(quote), oracle, owner);
        staking = new HolderStaking(IERC20(muse), IERC20(quote));
        splitter = new FeeSplitter(
            IERC20(quote), address(treasury), address(staking), owner, ownerFeeBps
        );
        vm.stopBroadcast();
    }
}
