// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";

contract PulseStreamV2TriggerReclaimTest is PulseStreamV2TestBase {

    // ─────────────────────────────────────────────────────────────────────────
    // 7. triggerReclaim: non-participant reverts with NotParticipant
    // ─────────────────────────────────────────────────────────────────────────

    function test_TriggerReclaim_RevertsForStranger() public {
        uint256 sid = _createDefaultStream();

        vm.prank(stranger);
        vm.expectRevert(PulseStreamV2.NotParticipant.selector);
        stream.triggerReclaim(sid);
    }

    function test_TriggerReclaim_RevertsForKeeper() public {
        uint256 sid = _createDefaultStream();

        vm.prank(keeper);
        vm.expectRevert(PulseStreamV2.NotParticipant.selector);
        stream.triggerReclaim(sid);
    }

    function test_TriggerReclaim_FunderCanCall() public {
        uint256 sid = _createDefaultStream();

        vm.prank(funder);
        stream.triggerReclaim(sid);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint8(s.status), uint8(PulseStreamV2.StreamStatus.Reclaimed));
    }

    function test_TriggerReclaim_AgentCanCall() public {
        uint256 sid = _createDefaultStream();

        vm.prank(agent);
        stream.triggerReclaim(sid);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint8(s.status), uint8(PulseStreamV2.StreamStatus.Reclaimed));
    }

    function test_TriggerReclaim_EmitsStreamReclaimed() public {
        uint256 sid = _createDefaultStream();

        vm.prank(funder);
        vm.expectEmit(true, true, false, false, address(stream));
        emit PulseStreamV2.StreamReclaimed(sid, funder, 0, 0, 0);
        stream.triggerReclaim(sid);
    }

    function test_TriggerReclaim_DistributesFundsCorrectly_ZeroElapsed() public {
        uint256 sid = _createDefaultStream();

        // Call immediately — zero active time, so agent earns 0
        vm.prank(funder);
        stream.triggerReclaim(sid);

        uint256 agentPayout  = stream.pendingPayouts(agent);
        uint256 funderPayout = stream.pendingPayouts(funder);

        assertEq(agentPayout,  0);
        assertEq(funderPayout, TOTAL_AMOUNT);
    }

    function test_TriggerReclaim_DistributesFundsCorrectly_HalfElapsed() public {
        uint256 sid = _createDefaultStream();

        PulseStreamV2.Stream memory s0 = stream.getStream(sid);
        vm.warp(s0.startTime + DURATION / 2);

        vm.prank(agent);
        stream.triggerReclaim(sid);

        uint256 agentPayout  = stream.pendingPayouts(agent);
        uint256 funderPayout = stream.pendingPayouts(funder);

        // Approximately half — allow 1-unit rounding
        assertApproxEqAbs(agentPayout, TOTAL_AMOUNT / 2, 1);
        assertApproxEqAbs(funderPayout, TOTAL_AMOUNT / 2, 1);
        assertEq(agentPayout + funderPayout, TOTAL_AMOUNT);
    }

    function test_TriggerReclaim_RevertsWrongStatus_Completed() public {
        uint256 sid = _createDefaultStream();

        vm.prank(funder);
        stream.settleStream(sid);

        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.triggerReclaim(sid);
    }

    function test_TriggerReclaim_RevertsWrongStatus_AlreadyReclaimed() public {
        uint256 sid = _createDefaultStream();

        vm.prank(funder);
        stream.triggerReclaim(sid); // first call

        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.triggerReclaim(sid); // second call
    }

    function test_TriggerReclaim_WorksOnPausedStream() public {
        uint256 sid = _createDefaultStream();

        vm.prank(funder);
        stream.pauseStream(sid);

        // triggerReclaim must accept Paused status too
        vm.prank(funder);
        stream.triggerReclaim(sid);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint8(s.status), uint8(PulseStreamV2.StreamStatus.Reclaimed));
    }
}
