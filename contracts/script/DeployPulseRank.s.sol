// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PulseRegistry} from "../PulseRegistry.sol";
import {PulseScore} from "../PulseScore.sol";
import {PulseStream} from "../PulseStream.sol";

/// @title DeployPulseRank
/// @notice Foundry deploy script for the full PulseRank system on Arc Mainnet.
///
/// Usage (Arc Mainnet, chain ID 5042):
///   forge script contracts/script/DeployPulseRank.s.sol \
///     --rpc-url https://rpc.mainnet.arc.io \
///     --broadcast \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --chain-id 5042
///
/// Environment variables:
///   DEPLOYER_PRIVATE_KEY  — mainnet deployer private key (never commit)
///
/// After a successful broadcast the script writes deployed addresses to stdout
/// and the script result JSON lives in ./broadcast/DeployPulseRank.s.sol/5042/.
contract DeployPulseRank is Script {
    /// @dev Arc Mainnet USDC (ERC-20, 6 decimals)
    address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");

        vm.startBroadcast();

        // 1. Deploy PulseRegistry
        PulseRegistry registry = new PulseRegistry();
        console2.log("PulseRegistry deployed at:", address(registry));

        // 2. Deploy PulseScore (owner = deployer)
        PulseScore score = new PulseScore(deployer);
        console2.log("PulseScore deployed at:", address(score));

        // 3. Deploy PulseStream (usdc, registry, score, owner = deployer)
        PulseStream stream = new PulseStream(ARC_USDC, address(registry), address(score), deployer);
        console2.log("PulseStream deployed at:", address(stream));

        // 4. Wire PulseScore -> PulseStream (owner-only, one-time)
        score.setPulseStream(address(stream));
        console2.log("PulseScore.setPulseStream() called -> PulseStream:", address(stream));

        vm.stopBroadcast();

        // Summary
        console2.log("\n=== PulseRank Deployment Summary ===");
        console2.log("Chain ID  : 5042 (Arc Mainnet)");
        console2.log("USDC      :", ARC_USDC);
        console2.log("Registry  :", address(registry));
        console2.log("Score     :", address(score));
        console2.log("Stream    :", address(stream));
        console2.log("Owner     :", deployer);
        console2.log("=====================================");
    }
}
