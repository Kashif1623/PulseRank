// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";
import {Vm}                    from "forge-std/Vm.sol";

/// @dev proposeStream with agent == msg.sender starts Active; others start Proposed.
contract PulseStreamV2SelfStreamTest is PulseStreamV2TestBase {
    function test_SelfStream_CreatedActiveWithTimestamps() public {
        vm.warp(1_700_000_000);
        uint256 sid = _createSelfStream(TOTAL_AMOUNT, DURATION);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint256(s.status), uint256(PulseStreamV2.StreamStatus.Active));
        assertEq(s.funder, agent);
        assertEq(s.agent, agent);
        assertEq(s.startTime, block.timestamp);
        assertEq(s.lastHeartbeat, block.timestamp);
        assertEq(s.lastMissCheckpoint, block.timestamp);
        assertEq(s.totalAmount, TOTAL_AMOUNT);
        assertEq(s.durationSecs, DURATION);
        assertEq(s.ratePerSecX18, (TOTAL_AMOUNT * 1e18) / DURATION);
    }

    function test_SelfStream_EscrowsUsdc() public {
        usdc.mint(agent, TOTAL_AMOUNT);
        uint256 before = _bal(agent);
        uint256 escrowBefore = _bal(address(stream));
        vm.startPrank(agent);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, MODE, 0);
        vm.stopPrank();
        assertEq(before - _bal(agent), TOTAL_AMOUNT);
        assertEq(_bal(address(stream)) - escrowBefore, TOTAL_AMOUNT);
    }

    function test_SelfStream_EmitsProposedThenActivated() public {
        usdc.mint(agent, TOTAL_AMOUNT);
        vm.startPrank(agent);
        usdc.approve(address(stream), TOTAL_AMOUNT);

        // Strict ordering: StreamProposed then StreamActivated.
        vm.expectEmit(true, true, true, true, address(stream));
        emit PulseStreamV2.StreamProposed(1, agent, agent, TOTAL_AMOUNT, DURATION, MODE, 0);
        vm.expectEmit(true, false, false, true, address(stream));
        emit PulseStreamV2.StreamActivated(1, block.timestamp);
        stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, MODE, 0);
        vm.stopPrank();
    }

    function test_SelfStream_LogOrderProposedBeforeActivated() public {
        usdc.mint(agent, TOTAL_AMOUNT);
        vm.startPrank(agent);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        vm.recordLogs();
        stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, MODE, 0);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        int256 proposedIdx = -1;
        int256 activatedIdx = -1;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(stream)) continue;
            if (logs[i].topics[0] == PulseStreamV2.StreamProposed.selector) proposedIdx = int256(i);
            if (logs[i].topics[0] == PulseStreamV2.StreamActivated.selector) activatedIdx = int256(i);
        }
        assertGe(proposedIdx, 0, "StreamProposed missing");
        assertGe(activatedIdx, 0, "StreamActivated missing");
        assertLt(proposedIdx, activatedIdx, "Proposed must precede Activated");
    }

    function test_SelfStream_InitialisesScore() public {
        assertFalse(score.initialized(agent));
        _createSelfStream(TOTAL_AMOUNT, DURATION);
        assertTrue(score.initialized(agent));
        assertEq(score.scores(agent), 400);
    }

    function test_SelfStream_AcceptStreamRevertsWrongStatus() public {
        uint256 sid = _createSelfStream(TOTAL_AMOUNT, DURATION);
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.acceptStream(sid);
    }

    function test_SelfStream_CancelProposalRevertsWrongStatus() public {
        uint256 sid = _createSelfStream(TOTAL_AMOUNT, DURATION);
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.cancelProposal(sid);
    }

    function test_SelfStream_HeartbeatAndSettleWork() public {
        uint256 sid = _createSelfStream(TOTAL_AMOUNT, DURATION);
        skip(HB_INTERVAL);
        vm.prank(agent);
        stream.sendHeartbeat(sid);
        skip(DURATION);
        vm.prank(agent);
        stream.settleStream(sid);
        assertEq(stream.pendingPayouts(agent), TOTAL_AMOUNT);
    }

    function test_SelfStream_AgentNotRegisteredStillReverts() public {
        // stranger is not a registered agent: self-stream is not a bypass of registration
        usdc.mint(stranger, TOTAL_AMOUNT);
        vm.startPrank(stranger);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        vm.expectRevert(PulseStreamV2.AgentNotRegistered.selector);
        stream.proposeStream(stranger, TOTAL_AMOUNT, DURATION, MODE, 0);
        vm.stopPrank();
    }

    // ── Non-self streams still start Proposed ────────────────────────────────

    function test_NonSelfStream_StartsProposed() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint256(s.status), uint256(PulseStreamV2.StreamStatus.Proposed));
        assertEq(s.startTime, 0);
        assertEq(s.lastHeartbeat, 0);
        assertEq(s.lastMissCheckpoint, 0);
        assertFalse(score.initialized(agent));
    }

    function test_NonSelfStream_EmitsOnlyProposed() public {
        vm.startPrank(funder);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        vm.recordLogs();
        stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, MODE, 0);
        vm.stopPrank();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 proposed;
        uint256 activated;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(stream)) continue;
            if (logs[i].topics[0] == PulseStreamV2.StreamProposed.selector) proposed++;
            if (logs[i].topics[0] == PulseStreamV2.StreamActivated.selector) activated++;
        }
        assertEq(proposed, 1);
        assertEq(activated, 0);
    }

    function test_NonSelfStream_AcceptActivates() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        skip(50);
        vm.expectEmit(true, false, false, true, address(stream));
        emit PulseStreamV2.StreamActivated(sid, block.timestamp);
        vm.prank(agent);
        stream.acceptStream(sid);
        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint256(s.status), uint256(PulseStreamV2.StreamStatus.Active));
        assertEq(s.startTime, block.timestamp);
        assertEq(s.lastHeartbeat, block.timestamp);
        assertEq(s.lastMissCheckpoint, block.timestamp);
        assertTrue(score.initialized(agent));
    }

    function test_NonSelfStream_AcceptTwiceReverts() public {
        uint256 sid = _createDefaultStream();
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.acceptStream(sid);
    }

    // ── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_SelfStream_ActiveAtAnyTime(uint256 amount, uint256 duration, uint256 t0) public {
        amount   = bound(amount, stream.MIN_AMOUNT(), 50_000_000);
        duration = bound(duration, 1, 365 days);
        t0       = bound(t0, 1, 4_000_000_000);
        vm.warp(t0);
        uint256 sid = _createSelfStream(amount, duration);
        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint256(s.status), uint256(PulseStreamV2.StreamStatus.Active));
        assertEq(s.startTime, t0);
        assertEq(s.lastHeartbeat, t0);
        assertEq(s.lastMissCheckpoint, t0);
        assertEq(s.ratePerSecX18, (amount * 1e18) / duration);
    }
}
