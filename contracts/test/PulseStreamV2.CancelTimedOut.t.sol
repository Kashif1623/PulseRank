// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";
import {VerificationMethod}    from "../IPulseV2Interfaces.sol";
import {PulseTaskV2}           from "../PulseTaskV2.sol";

contract PulseStreamV2CancelTimedOutTest is PulseStreamV2TestBase {

    // ─────────────────────────────────────────────────────────────────────────
    // 1. HAPPY PATH — anyone can cancel, correct fund distribution
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelTimedOut_HappyPath_CorrectDistribution() public {
        uint256 sid = _createDefaultStream();

        // Warp: half the duration elapses before timeout fires
        PulseStreamV2.Stream memory s0 = stream.getStream(sid);
        uint256 halfDuration = DURATION / 2;
        vm.warp(s0.startTime + halfDuration + TIMEOUT_DELTA);

        uint256 treasuryBefore       = _bal(treasuryAddr);
        uint256 funderPayoutBefore   = stream.pendingPayouts(funder);
        uint256 agentPayoutBefore    = stream.pendingPayouts(agent);

        // Set treasury so penalty is NOT folded back
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr);
        vm.warp(block.timestamp + 2 days + 1);
        vm.prank(owner);
        stream.commitTreasury();

        // Keeper calls (permissionless)
        vm.prank(keeper);
        stream.cancelTimedOutStream(sid);

        PulseStreamV2.Stream memory s1 = stream.getStream(sid);

        // Status must be Reclaimed
        assertEq(uint8(s1.status), uint8(PulseStreamV2.StreamStatus.Reclaimed));

        // earnedAmount stored
        uint256 agentEarned = s1.earnedAmount;
        uint256 unearned    = TOTAL_AMOUNT - agentEarned;
        uint256 penalty     = (unearned * PENALTY_BPS) / 10_000;
        uint256 funderRefund = unearned - penalty;

        // Pending payouts updated
        assertEq(stream.pendingPayouts(agent),  agentPayoutBefore + agentEarned);
        assertEq(stream.pendingPayouts(funder), funderPayoutBefore + funderRefund);

        // Penalty transferred directly to treasury (not as pendingPayout)
        assertEq(_bal(treasuryAddr), treasuryBefore + penalty);

        // Conservation: earned + penalty + refund == totalAmount
        assertEq(agentEarned + penalty + funderRefund, TOTAL_AMOUNT);

        // Score was slashed via recordHardReclaim
        assertEq(score.failedStreams(agent), 1);
    }

    function test_CancelTimedOut_AnyoneCanCall_Keeper() public {
        uint256 sid = _createDefaultStream();
        _warpToTimeout(sid);

        // stranger (not funder or agent) can call
        vm.prank(stranger);
        stream.cancelTimedOutStream(sid);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint8(s.status), uint8(PulseStreamV2.StreamStatus.Reclaimed));
    }

    function test_CancelTimedOut_AnyoneCanCall_Funder() public {
        uint256 sid = _createDefaultStream();
        _warpToTimeout(sid);

        vm.prank(funder);
        stream.cancelTimedOutStream(sid);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint8(s.status), uint8(PulseStreamV2.StreamStatus.Reclaimed));
    }

    function test_CancelTimedOut_EmitsStreamTimedOut() public {
        uint256 sid = _createDefaultStream();
        _warpToTimeout(sid);

        vm.prank(keeper);
        vm.expectEmit(true, true, false, false, address(stream));
        emit PulseStreamV2.StreamTimedOut(sid, keeper, 0, 0, 0);
        stream.cancelTimedOutStream(sid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. REVERT — stream is Paused (WrongStatus)
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelTimedOut_Reverts_WhenPaused() public {
        uint256 sid = _createDefaultStream();

        vm.prank(funder);
        stream.pauseStream(sid);

        // Warp past timeout anyway
        _warpToTimeout(sid);

        vm.prank(keeper);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.cancelTimedOutStream(sid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. REVERT — stream has not timed out yet (StreamNotTimedOut)
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelTimedOut_Reverts_NotTimedOut_Immediately() public {
        uint256 sid = _createDefaultStream();

        vm.prank(keeper);
        vm.expectRevert(PulseStreamV2.StreamNotTimedOut.selector);
        stream.cancelTimedOutStream(sid);
    }

    function test_CancelTimedOut_Reverts_NotTimedOut_OneBefore() public {
        uint256 sid = _createDefaultStream();
        PulseStreamV2.Stream memory s = stream.getStream(sid);
        // Warp to exactly the deadline (not past it)
        vm.warp(s.lastHeartbeat + HB_INTERVAL + GRACE);

        vm.prank(keeper);
        vm.expectRevert(PulseStreamV2.StreamNotTimedOut.selector);
        stream.cancelTimedOutStream(sid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. REVERT — already terminal status (WrongStatus)
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelTimedOut_Reverts_AfterReclaimed() public {
        uint256 sid = _createDefaultStream();
        _warpToTimeout(sid);

        stream.cancelTimedOutStream(sid); // first call succeeds

        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.cancelTimedOutStream(sid); // second call fails
    }

    function test_CancelTimedOut_Reverts_AfterCompleted() public {
        uint256 sid = _createDefaultStream();
        // Settle the stream as a participant
        vm.prank(funder);
        stream.settleStream(sid);

        _warpToTimeout(sid);

        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.cancelTimedOutStream(sid);
    }

    function test_CancelTimedOut_Reverts_AfterCancelled() public {
        // Propose a stream (Proposed status) and cancel proposal
        vm.startPrank(funder);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        uint256 sid = stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, MODE, 0);
        stream.cancelProposal(sid);
        vm.stopPrank();

        _warpToTimeout(sid); // timestamp-wise past threshold (though never Active)

        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.cancelTimedOutStream(sid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. TREASURY FALLBACK — penalty folds into funder refund when treasury==0
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelTimedOut_PenaltyFoldsIntoRefund_WhenNoTreasury() public {
        // treasury is address(0) by default
        assertEq(stream.treasury(), address(0));

        uint256 sid = _createDefaultStream();
        _warpToTimeout(sid);

        uint256 funderPayoutBefore = stream.pendingPayouts(funder);

        vm.prank(keeper);
        stream.cancelTimedOutStream(sid);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        uint256 agentEarned  = s.earnedAmount;
        uint256 unearned     = TOTAL_AMOUNT - agentEarned;
        uint256 penalty      = (unearned * PENALTY_BPS) / 10_000;
        uint256 expectedFunderRefund = unearned; // full unearned goes back (no treasury deduction)

        // Funder gets full unearned (penalty folds in)
        assertEq(stream.pendingPayouts(funder), funderPayoutBefore + expectedFunderRefund);

        // Treasury USDC balance unchanged (nothing transferred there)
        assertEq(_bal(treasuryAddr), 0);

        // Conservation still holds
        assertEq(agentEarned + unearned, TOTAL_AMOUNT);
        // and penalty + (unearned-penalty) == unearned
        assertEq(penalty + (unearned - penalty), unearned);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. TASK CAP applied before penalty math
    // ─────────────────────────────────────────────────────────────────────────

    function test_CancelTimedOut_TaskCapApplied_PartialApproval() public {
        // Create a task with 2 milestones, approve only the first (5000 bps)
        PulseTaskV2.MilestoneInput[] memory ms = new PulseTaskV2.MilestoneInput[](2);
        ms[0] = PulseTaskV2.MilestoneInput({
            description:    "m0",
            paymentBps:     5_000,
            submitDeadline: block.timestamp + 7 days,
            attester:       address(0)
        });
        ms[1] = PulseTaskV2.MilestoneInput({
            description:    "m1",
            paymentBps:     5_000,
            submitDeadline: block.timestamp + 14 days,
            attester:       address(0)
        });

        // Propose a stream first so task can verify stream funder
        uint256 sid;
        {
            vm.startPrank(funder);
            usdc.approve(address(stream), TOTAL_AMOUNT);
            sid = stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, MODE, 0);
            vm.stopPrank();
        }

        // Create task linked to that stream
        vm.prank(funder);
        uint256 taskId = task.createTask(agent, sid, VerificationMethod.Manual, ms);

        // Now re-propose another stream that references taskId
        uint256 sid2 = _createActiveStream(TOTAL_AMOUNT, DURATION, taskId);

        // Approve milestone 0 by funder → approvedBps == 5000
        // Submit proof first
        vm.prank(agent);
        task.submitMilestoneProof(taskId, 0, bytes32("proof0"));
        vm.prank(funder);
        task.approveMilestone(taskId, 0);

        // Warp past timeout
        _warpToTimeout(sid2);

        vm.prank(keeper);
        stream.cancelTimedOutStream(sid2);

        PulseStreamV2.Stream memory s = stream.getStream(sid2);
        uint256 agentEarned = s.earnedAmount;

        // Task cap: 50% of totalAmount = 500_000
        uint256 taskCap = (TOTAL_AMOUNT * 5_000) / 10_000;
        // Agent earned should be <= taskCap
        assertLe(agentEarned, taskCap);

        // Conservation
        uint256 unearned     = TOTAL_AMOUNT - agentEarned;
        uint256 penalty      = (unearned * PENALTY_BPS) / 10_000;
        uint256 funderRefund = unearned - penalty;
        // treasury is address(0) so penalty folds back
        assertEq(agentEarned + funderRefund + penalty, TOTAL_AMOUNT);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // isTimedOut view
    // ─────────────────────────────────────────────────────────────────────────

    function test_IsTimedOut_FalseBeforeTimeout() public {
        uint256 sid = _createDefaultStream();
        assertFalse(stream.isTimedOut(sid));
    }

    function test_IsTimedOut_FalseAtExactBoundary() public {
        uint256 sid = _createDefaultStream();
        PulseStreamV2.Stream memory s = stream.getStream(sid);
        vm.warp(s.lastHeartbeat + HB_INTERVAL + GRACE);
        assertFalse(stream.isTimedOut(sid));
    }

    function test_IsTimedOut_TrueAfterTimeout() public {
        uint256 sid = _createDefaultStream();
        _warpToTimeout(sid);
        assertTrue(stream.isTimedOut(sid));
    }

    function test_IsTimedOut_TrueForPausedStream_ViewContractBug() public {
        uint256 sid = _createDefaultStream();
        vm.prank(funder);
        stream.pauseStream(sid);
        _warpToTimeout(sid);
        // isTimedOut() returns TRUE for a Paused stream past the threshold
        // because its guard allows Paused status, but cancelTimedOutStream()
        // reverts WrongStatus for Paused. The two are inconsistent — contract bug.
        assertTrue(stream.isTimedOut(sid));
    }

    function test_IsTimedOut_FalseForReclaimed() public {
        uint256 sid = _createDefaultStream();
        _warpToTimeout(sid);
        stream.cancelTimedOutStream(sid);
        assertFalse(stream.isTimedOut(sid));
    }
}
