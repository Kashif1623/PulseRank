// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockERC20}        from "../test-helpers/MockERC20.sol";
import {PulseRegistryV2}  from "../PulseRegistryV2.sol";
import {PulseScoreV2}     from "../PulseScoreV2.sol";
import {PulseTaskV2}      from "../PulseTaskV2.sol";
import {PulseStreamV2}    from "../PulseStreamV2.sol";
import {IPulseTaskV2, VerificationMethod} from "../IPulseV2Interfaces.sol";

/// @dev Abstract base with full fixture wiring.  No test functions here.
abstract contract PulseStreamV2TestBase is Test {
    // ── Canonical USDC address (hardcoded in PulseStreamV2) ──────────────────
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    // ── Actors ────────────────────────────────────────────────────────────────
    address internal owner   = makeAddr("owner");
    address internal funder  = makeAddr("funder");
    address internal agent   = makeAddr("agent");
    address internal keeper  = makeAddr("keeper");
    address internal treasuryAddr = makeAddr("treasury");
    address internal stranger = makeAddr("stranger");

    // ── Contracts ─────────────────────────────────────────────────────────────
    MockERC20        internal usdc;
    PulseRegistryV2  internal registry;
    PulseScoreV2     internal score;
    PulseTaskV2      internal task;
    PulseStreamV2    internal stream;

    // ── Mode-1 config (heartbeatInterval=300, gracePeriod=600) ────────────────
    uint8  internal constant MODE = 1;
    uint256 internal constant HB_INTERVAL = 300;
    uint256 internal constant GRACE       = 600;
    uint256 internal constant TIMEOUT_DELTA = HB_INTERVAL + GRACE + 1; // just past deadline

    // ── Default stream params ─────────────────────────────────────────────────
    uint256 internal constant TOTAL_AMOUNT = 1_000_000; // 1 USDC (6 dec)
    uint256 internal constant DURATION     = 3_600;     // 1 hour

    // ── Penalty constants ─────────────────────────────────────────────────────
    uint256 internal constant PENALTY_BPS = 500;

    function setUp() public virtual {
        // 1. Etch a MockERC20 at the canonical USDC address
        MockERC20 mockImpl = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mockImpl).code);
        usdc = MockERC20(USDC_ADDR);

        // 2. Deploy supporting contracts (owner = this test contract initially)
        registry = new PulseRegistryV2();
        score    = new PulseScoreV2(owner);
        task     = new PulseTaskV2(owner);

        // 3. Deploy the contract under test
        stream = new PulseStreamV2(
            USDC_ADDR,
            address(registry),
            address(score),
            address(task),
            owner
        );

        // 4. Link score & task to stream
        vm.startPrank(owner);
        score.setPulseStream(address(stream));
        task.setPulseStream(address(stream));
        vm.stopPrank();

        // 5. Register agent in registry
        vm.prank(agent);
        registry.registerAgent(bytes32("agentAlpha"), "ipfs://alpha", 0);

        // 6. Seed USDC balances
        usdc.mint(funder, 100_000_000); // 100 USDC
        usdc.mint(keeper,  10_000_000); // 10 USDC (not needed for amounts, just in case)
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /// @dev Proposes, activates and returns a streamId.
    function _createActiveStream(
        uint256 totalAmount,
        uint256 durationSecs,
        uint256 taskId
    ) internal returns (uint256 streamId) {
        vm.startPrank(funder);
        usdc.approve(address(stream), totalAmount);
        streamId = stream.proposeStream(agent, totalAmount, durationSecs, MODE, taskId);
        vm.stopPrank();

        vm.prank(agent);
        stream.acceptStream(streamId);
    }

    /// @dev Creates a default active stream (TOTAL_AMOUNT, DURATION, taskId=0).
    function _createDefaultStream() internal returns (uint256 streamId) {
        return _createActiveStream(TOTAL_AMOUNT, DURATION, 0);
    }

    /// @dev Warps past the timeout threshold for a stream.
    function _warpToTimeout(uint256 streamId) internal {
        PulseStreamV2.Stream memory s = stream.getStream(streamId);
        vm.warp(s.lastHeartbeat + HB_INTERVAL + GRACE + 1);
    }

    /// @dev Returns USDC balance of an address.
    function _bal(address who) internal view returns (uint256) {
        return usdc.balanceOf(who);
    }
}
