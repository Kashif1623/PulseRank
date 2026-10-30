// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";
import {VerificationMethod}    from "../IPulseV2Interfaces.sol";
import {PulseTaskV2}           from "../PulseTaskV2.sol";

contract PulseStreamV2FuzzTest is PulseStreamV2TestBase {

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Fuzz: earned + penalty + refund == totalAmount for various amounts/durations
    //    (treasury == address(0) so penalty is absorbed into funder refund)
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_Conservation_NoTreasury(
        uint256 totalAmount,
        uint256 durationSecs,
        uint256 elapsedAfterStart
    ) public {
        // Bound inputs to sane ranges
        totalAmount   = bound(totalAmount, stream.MIN_AMOUNT(), 50_000_000); // up to 50 USDC
        durationSecs  = bound(durationSecs, 1, 365 days);
        elapsedAfterStart = bound(elapsedAfterStart, 0, durationSecs + 7 days);

        // Seed funder
        usdc.mint(funder, totalAmount);

        uint256 sid;
        {
            vm.startPrank(funder);
            usdc.approve(address(stream), totalAmount);
            sid = stream.proposeStream(agent, totalAmount, durationSecs, MODE, 0);
            vm.stopPrank();
            vm.prank(agent);
            stream.acceptStream(sid);
        }

        PulseStreamV2.Stream memory s0 = stream.getStream(sid);
        // Warp: some active time first, then past timeout
        vm.warp(s0.startTime + elapsedAfterStart + TIMEOUT_DELTA);

        vm.prank(keeper);
        stream.cancelTimedOutStream(sid);

        PulseStreamV2.Stream memory s1 = stream.getStream(sid);
        uint256 agentEarned  = s1.earnedAmount;
        uint256 unearned     = totalAmount - agentEarned;
        uint256 penalty      = (unearned * PENALTY_BPS) / 10_000;
        uint256 funderRefund = unearned - penalty;
        // treasury == address(0) → funderRefund += penalty in contract
        uint256 actualFunderRefund = stream.pendingPayouts(funder);
        uint256 actualAgentPayout  = stream.pendingPayouts(agent);

        // With no treasury: agent + funder == totalAmount
        assertEq(actualAgentPayout + actualFunderRefund, totalAmount,
            "conservation: agent + funder refund must equal totalAmount");

        // Funder gets unearned (full, since treasury=0)
        assertEq(actualFunderRefund, funderRefund + penalty,
            "funder refund must be full unearned when no treasury");

        // Agent gets earnedAmount only
        assertEq(actualAgentPayout, agentEarned);
    }

    function testFuzz_Conservation_WithTreasury(
        uint256 totalAmount,
        uint256 durationSecs,
        uint256 elapsedAfterStart
    ) public {
        // Set up treasury first
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr);
        vm.warp(block.timestamp + 2 days + 1);
        vm.prank(owner);
        stream.commitTreasury();

        totalAmount  = bound(totalAmount, stream.MIN_AMOUNT(), 50_000_000);
        durationSecs = bound(durationSecs, 1, 365 days);
        elapsedAfterStart = bound(elapsedAfterStart, 0, durationSecs + 7 days);

        usdc.mint(funder, totalAmount);

        uint256 sid;
        {
            vm.startPrank(funder);
            usdc.approve(address(stream), totalAmount);
            sid = stream.proposeStream(agent, totalAmount, durationSecs, MODE, 0);
            vm.stopPrank();
            vm.prank(agent);
            stream.acceptStream(sid);
        }

        PulseStreamV2.Stream memory s0 = stream.getStream(sid);
        vm.warp(s0.startTime + elapsedAfterStart + TIMEOUT_DELTA);

        uint256 treasuryBefore = _bal(treasuryAddr);

        vm.prank(keeper);
        stream.cancelTimedOutStream(sid);

        PulseStreamV2.Stream memory s1 = stream.getStream(sid);
        uint256 agentEarned  = s1.earnedAmount;
        uint256 unearned     = totalAmount - agentEarned;
        uint256 penalty      = (unearned * PENALTY_BPS) / 10_000;
        uint256 funderRefund = unearned - penalty;

        uint256 actualAgentPayout  = stream.pendingPayouts(agent);
        uint256 actualFunderRefund = stream.pendingPayouts(funder);
        uint256 treasuryReceived   = _bal(treasuryAddr) - treasuryBefore;

        // agent + funder + treasury == totalAmount
        assertEq(actualAgentPayout + actualFunderRefund + treasuryReceived, totalAmount,
            "conservation with treasury: all three parts must equal totalAmount");

        assertEq(treasuryReceived, penalty, "treasury receives exactly penalty");
        assertEq(actualFunderRefund, funderRefund, "funder gets unearned minus penalty");
        assertEq(actualAgentPayout, agentEarned, "agent gets earnedAmount");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6 (fuzz). _applyTaskCap: earnedAmount <= taskCap for any approvedBps < 10000
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_TaskCap_AlwaysApplied(uint256 approvedBps) public {
        // approvedBps in [0, 9999] — task cap is strictly below 100%
        approvedBps = bound(approvedBps, 0, 9_999);

        // Build a task with a single milestone at approvedBps, rest in a second milestone
        uint256 remainBps = 10_000 - approvedBps;

        PulseTaskV2.MilestoneInput[] memory ms;
        uint256 taskId;

        if (approvedBps == 0) {
            // Single milestone at 100% but DON'T approve it → approvedBps stays 0
            ms = new PulseTaskV2.MilestoneInput[](1);
            ms[0] = PulseTaskV2.MilestoneInput({
                description:    "full",
                paymentBps:     10_000,
                submitDeadline: block.timestamp + 30 days,
                attester:       address(0)
            });
        } else {
            // Two milestones: first = approvedBps (will be approved), second = remainBps
            ms = new PulseTaskV2.MilestoneInput[](2);
            ms[0] = PulseTaskV2.MilestoneInput({
                description:    "first",
                paymentBps:     approvedBps,
                submitDeadline: block.timestamp + 30 days,
                attester:       address(0)
            });
            ms[1] = PulseTaskV2.MilestoneInput({
                description:    "rest",
                paymentBps:     remainBps,
                submitDeadline: block.timestamp + 60 days,
                attester:       address(0)
            });
        }

        // Seed and create the anchor stream (needed so createTask can verify funder)
        usdc.mint(funder, TOTAL_AMOUNT);
        uint256 anchorSid;
        {
            vm.startPrank(funder);
            usdc.approve(address(stream), TOTAL_AMOUNT);
            anchorSid = stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, MODE, 0);
            vm.stopPrank();
        }

        vm.prank(funder);
        taskId = task.createTask(agent, anchorSid, VerificationMethod.Manual, ms);

        if (approvedBps > 0) {
            vm.prank(agent);
            task.submitMilestoneProof(taskId, 0, bytes32("proof"));
            vm.prank(funder);
            task.approveMilestone(taskId, 0);
        }

        // Confirm approvedBps
        assertEq(task.approvedBps(taskId), approvedBps);

        // Create the actual test stream that references taskId
        usdc.mint(funder, TOTAL_AMOUNT);
        uint256 sid = _createActiveStream(TOTAL_AMOUNT, DURATION, taskId);

        // Warp to full duration + timeout
        PulseStreamV2.Stream memory s0 = stream.getStream(sid);
        vm.warp(s0.startTime + DURATION + TIMEOUT_DELTA);

        vm.prank(keeper);
        stream.cancelTimedOutStream(sid);

        PulseStreamV2.Stream memory s1 = stream.getStream(sid);
        uint256 taskCap = (TOTAL_AMOUNT * approvedBps) / 10_000;

        assertLe(s1.earnedAmount, taskCap,
            "earnedAmount must not exceed taskCap");
    }
}
