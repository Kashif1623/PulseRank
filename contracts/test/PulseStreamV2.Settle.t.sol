// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";

/// @dev settleStream: only Active streams can be settled; never double-credits.
contract PulseStreamV2SettleTest is PulseStreamV2TestBase {
    /// @dev Mirrors the contract's floored accrual: floor(floor(total*1e18/dur) * t / 1e18).
    function _earned(uint256 t) internal pure returns (uint256) {
        return (((TOTAL_AMOUNT * 1e18) / DURATION) * t) / 1e18;
    }

    // ── Happy path ───────────────────────────────────────────────────────────

    function test_Settle_HalfElapsed_SplitsEarnedAndRefund() public {
        uint256 sid = _createDefaultStream();
        skip(DURATION / 2);

        vm.prank(funder);
        stream.settleStream(sid);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint256(s.status), uint256(PulseStreamV2.StreamStatus.Completed));
        assertEq(s.earnedAmount, _earned(DURATION / 2));
        assertEq(stream.pendingPayouts(agent), _earned(DURATION / 2));
        assertEq(stream.pendingPayouts(funder), TOTAL_AMOUNT - _earned(DURATION / 2));
    }

    function test_Settle_AgentCanSettle() public {
        uint256 sid = _createDefaultStream();
        skip(DURATION / 4);
        vm.prank(agent);
        stream.settleStream(sid);
        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint256(s.status), uint256(PulseStreamV2.StreamStatus.Completed));
        assertEq(stream.pendingPayouts(agent) + stream.pendingPayouts(funder), TOTAL_AMOUNT);
    }

    function test_Settle_AfterFullDuration_AgentGetsAll() public {
        uint256 sid = _createDefaultStream();
        skip(DURATION * 5);
        vm.prank(funder);
        stream.settleStream(sid);
        // rate = floor(total*1e18/dur); earned is floored, so agent gets at most total
        uint256 agentPay = stream.pendingPayouts(agent);
        assertLe(agentPay, TOTAL_AMOUNT);
        assertGe(agentPay, TOTAL_AMOUNT - 1);
        assertEq(agentPay + stream.pendingPayouts(funder), TOTAL_AMOUNT);
    }

    function test_Settle_ZeroElapsed_FullRefundToFunder() public {
        uint256 sid = _createDefaultStream();
        vm.prank(funder);
        stream.settleStream(sid);
        assertEq(stream.pendingPayouts(agent), 0);
        assertEq(stream.pendingPayouts(funder), TOTAL_AMOUNT);
    }

    function test_Settle_EmitsStreamCompleted() public {
        uint256 sid = _createDefaultStream();
        skip(DURATION / 2);
        vm.expectEmit(true, false, false, true, address(stream));
        emit PulseStreamV2.StreamCompleted(sid, _earned(DURATION / 2), TOTAL_AMOUNT - _earned(DURATION / 2));
        vm.prank(funder);
        stream.settleStream(sid);
    }

    function test_Settle_PayoutsClaimable() public {
        uint256 sid = _createDefaultStream();
        skip(DURATION / 2);
        vm.prank(funder);
        stream.settleStream(sid);

        uint256 agentBefore = _bal(agent);
        vm.prank(agent);
        stream.claimPayout();
        assertEq(_bal(agent) - agentBefore, _earned(DURATION / 2));
    }

    // ── Revert paths ─────────────────────────────────────────────────────────

    function test_Settle_RevertsNotParticipant() public {
        uint256 sid = _createDefaultStream();
        vm.prank(stranger);
        vm.expectRevert(PulseStreamV2.NotParticipant.selector);
        stream.settleStream(sid);
    }

    function test_Settle_RevertsWrongStatus_SettleTwice() public {
        uint256 sid = _createDefaultStream();
        skip(DURATION / 2);
        vm.prank(funder);
        stream.settleStream(sid);

        uint256 agentPending  = stream.pendingPayouts(agent);
        uint256 funderPending = stream.pendingPayouts(funder);

        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.settleStream(sid);
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.settleStream(sid);

        // No double-credit
        assertEq(stream.pendingPayouts(agent), agentPending);
        assertEq(stream.pendingPayouts(funder), funderPending);
    }

    function test_Settle_RevertsWrongStatus_Proposed() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.settleStream(sid);
        assertEq(stream.pendingPayouts(funder), 0);
        assertEq(_bal(address(stream)), TOTAL_AMOUNT);
    }

    function test_Settle_RevertsWrongStatus_Cancelled() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.prank(funder);
        stream.cancelProposal(sid);
        // funder already credited the refund once by cancel; settle must not credit again
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.settleStream(sid);
        assertEq(stream.pendingPayouts(funder), TOTAL_AMOUNT);
    }

    function test_Settle_RevertsWrongStatus_Reclaimed() public {
        uint256 sid = _createDefaultStream();
        skip(DURATION / 2);
        vm.prank(funder);
        stream.triggerReclaim(sid);
        uint256 total = stream.pendingPayouts(agent) + stream.pendingPayouts(funder);

        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.settleStream(sid);
        assertEq(stream.pendingPayouts(agent) + stream.pendingPayouts(funder), total);
        assertEq(total, TOTAL_AMOUNT);
    }

    function test_Settle_RevertsWrongStatus_TimedOutReclaimed() public {
        uint256 sid = _createDefaultStream();
        _warpToTimeout(sid);
        stream.cancelTimedOutStream(sid);
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.settleStream(sid);
    }

    function test_Settle_RevertsWrongStatus_Paused() public {
        uint256 sid = _createDefaultStream();
        skip(100);
        vm.prank(funder);
        stream.pauseStream(sid);
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.settleStream(sid);
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.settleStream(sid);
        assertEq(stream.pendingPayouts(agent) + stream.pendingPayouts(funder), 0);
    }

    function test_Settle_PausedThenUnpaused_CanSettle() public {
        uint256 sid = _createDefaultStream();
        vm.prank(funder);
        stream.pauseStream(sid);
        skip(1000);
        vm.prank(funder);
        stream.unpauseStream(sid);
        skip(DURATION / 2);
        vm.prank(funder);
        stream.settleStream(sid);
        // paused time does not accrue
        assertEq(stream.pendingPayouts(agent), _earned(DURATION / 2));
    }

    function test_Settle_RevertsNonexistentStream() public {
        // streams[99] is zero struct: participants are address(0) so caller is not a participant
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.NotParticipant.selector);
        stream.settleStream(99);
    }

    function test_Settle_AfterSettle_OtherTerminalActionsRevert() public {
        uint256 sid = _createDefaultStream();
        vm.prank(funder);
        stream.settleStream(sid);
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.triggerReclaim(sid);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.cancelTimedOutStream(sid);
    }
}
