// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";

/// @dev Deploy, propose, accept, cancel, heartbeat, pause/unpause, claim.
contract PulseStreamV2LifecycleTest is PulseStreamV2TestBase {
    // ── Deployment ───────────────────────────────────────────────────────────

    function test_Deploy_StoresConfig() public view {
        assertEq(stream.USDC(), USDC_ADDR);
        assertEq(address(stream.registry()), address(registry));
        assertEq(address(stream.scoreContract()), address(score));
        assertEq(address(stream.taskContract()), address(task));
        assertEq(stream.owner(), owner);
        assertEq(stream.nextStreamId(), 1);
        (uint256 hb, uint256 gr) = stream.getModeConfig(1);
        assertEq(hb, 300);
        assertEq(gr, 600);
        (hb, gr) = stream.getModeConfig(2);
        assertEq(hb, 1800);
        assertEq(gr, 1800);
        (hb, gr) = stream.getModeConfig(3);
        assertEq(hb, 3600);
        assertEq(gr, 7200);
    }

    function test_Deploy_RevertsZeroAddresses() public {
        address r = address(registry);
        address s = address(score);
        address t = address(task);
        vm.expectRevert(PulseStreamV2.ZeroAddress.selector);
        new PulseStreamV2(address(0), r, s, t, owner);
        vm.expectRevert(PulseStreamV2.ZeroAddress.selector);
        new PulseStreamV2(USDC_ADDR, address(0), s, t, owner);
        vm.expectRevert(PulseStreamV2.ZeroAddress.selector);
        new PulseStreamV2(USDC_ADDR, r, address(0), t, owner);
        vm.expectRevert(PulseStreamV2.ZeroAddress.selector);
        new PulseStreamV2(USDC_ADDR, r, s, address(0), owner);
        // initialOwner == 0 is rejected by Ownable (OwnableInvalidOwner) before the body runs
        vm.expectRevert();
        new PulseStreamV2(USDC_ADDR, r, s, t, address(0));
    }

    // ── proposeStream ────────────────────────────────────────────────────────

    function test_Propose_HappyPath() public {
        uint256 funderBefore = _bal(funder);
        vm.startPrank(funder);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        vm.expectEmit(true, true, true, true, address(stream));
        emit PulseStreamV2.StreamProposed(1, funder, agent, TOTAL_AMOUNT, DURATION, MODE, 0);
        uint256 sid = stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, MODE, 0);
        vm.stopPrank();

        assertEq(sid, 1);
        assertEq(stream.nextStreamId(), 2);
        assertEq(funderBefore - _bal(funder), TOTAL_AMOUNT);
        assertEq(_bal(address(stream)), TOTAL_AMOUNT);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(s.funder, funder);
        assertEq(s.agent, agent);
        assertEq(s.totalAmount, TOTAL_AMOUNT);
        assertEq(s.durationSecs, DURATION);
        assertEq(s.ratePerSecX18, (TOTAL_AMOUNT * 1e18) / DURATION);
        assertEq(s.mode, MODE);
        assertEq(uint256(s.status), uint256(PulseStreamV2.StreamStatus.Proposed));
        assertEq(stream.agentStreams(agent, 0), sid);
        assertEq(stream.funderStreams(funder, 0), sid);
    }

    function test_Propose_IncrementsIds() public {
        usdc.mint(funder, TOTAL_AMOUNT);
        uint256 a = _proposeStream(TOTAL_AMOUNT, DURATION);
        uint256 b = _proposeStream(TOTAL_AMOUNT, DURATION);
        assertEq(b, a + 1);
    }

    function test_Propose_RevertsAgentNotRegistered() public {
        vm.startPrank(funder);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        vm.expectRevert(PulseStreamV2.AgentNotRegistered.selector);
        stream.proposeStream(stranger, TOTAL_AMOUNT, DURATION, MODE, 0);
        vm.stopPrank();
    }

    function test_Propose_RevertsAmountTooLow() public {
        vm.startPrank(funder);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        vm.expectRevert(PulseStreamV2.AmountTooLow.selector);
        stream.proposeStream(agent, 199_999, DURATION, MODE, 0);
        vm.stopPrank();
    }

    function test_Propose_MinAmountAccepted() public {
        vm.startPrank(funder);
        usdc.approve(address(stream), 200_000);
        stream.proposeStream(agent, 200_000, DURATION, MODE, 0);
        vm.stopPrank();
    }

    function test_Propose_RevertsInvalidDuration() public {
        vm.startPrank(funder);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        vm.expectRevert(PulseStreamV2.InvalidDuration.selector);
        stream.proposeStream(agent, TOTAL_AMOUNT, 0, MODE, 0);
        vm.stopPrank();
    }

    function test_Propose_RevertsInvalidMode() public {
        vm.startPrank(funder);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        vm.expectRevert(PulseStreamV2.InvalidMode.selector);
        stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, 0, 0);
        vm.expectRevert(PulseStreamV2.InvalidMode.selector);
        stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, 4, 0);
        vm.stopPrank();
    }

    function test_Propose_RevertsWithoutAllowance() public {
        vm.prank(funder);
        vm.expectRevert();
        stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, MODE, 0);
    }

    // ── acceptStream / cancelProposal ────────────────────────────────────────

    function test_Accept_RevertsNotAgent() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.NotAgent.selector);
        stream.acceptStream(sid);
    }

    function test_Accept_RevertsWrongStatus_Cancelled() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.prank(funder);
        stream.cancelProposal(sid);
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.acceptStream(sid);
    }

    function test_Cancel_HappyPath() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.expectEmit(true, false, false, false, address(stream));
        emit PulseStreamV2.StreamCancelled(sid);
        vm.prank(funder);
        stream.cancelProposal(sid);

        assertEq(uint256(stream.getStream(sid).status), uint256(PulseStreamV2.StreamStatus.Cancelled));
        assertEq(stream.pendingPayouts(funder), TOTAL_AMOUNT);
    }

    function test_Cancel_RevertsNotFunder() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.NotFunder.selector);
        stream.cancelProposal(sid);
    }

    function test_Cancel_RevertsWrongStatus_Twice() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.startPrank(funder);
        stream.cancelProposal(sid);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.cancelProposal(sid);
        vm.stopPrank();
        assertEq(stream.pendingPayouts(funder), TOTAL_AMOUNT);
    }

    function test_Cancel_RevertsWrongStatus_Active() public {
        uint256 sid = _createDefaultStream();
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.cancelProposal(sid);
    }

    // ── sendHeartbeat ────────────────────────────────────────────────────────

    function test_Heartbeat_HappyPath() public {
        uint256 sid = _createDefaultStream();
        skip(HB_INTERVAL);
        vm.expectEmit(true, false, false, false, address(stream));
        emit PulseStreamV2.HeartbeatSent(sid, block.timestamp, 0, 0);
        vm.prank(agent);
        stream.sendHeartbeat(sid);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(s.lastHeartbeat, block.timestamp);
        assertEq(s.earnedAmount, (s.ratePerSecX18 * HB_INTERVAL) / 1e18);
    }

    function test_Heartbeat_RevertsNotAgent() public {
        uint256 sid = _createDefaultStream();
        skip(HB_INTERVAL);
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.NotAgent.selector);
        stream.sendHeartbeat(sid);
    }

    function test_Heartbeat_RevertsWrongStatus_Proposed() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.sendHeartbeat(sid);
    }

    function test_Heartbeat_RevertsTooEarly() public {
        uint256 sid = _createDefaultStream();
        skip(HB_INTERVAL - 1);
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.HeartbeatTooEarly.selector);
        stream.sendHeartbeat(sid);
    }

    // ── pause / unpause ──────────────────────────────────────────────────────

    function test_Pause_Unpause_HappyPath() public {
        uint256 sid = _createDefaultStream();
        skip(100);
        vm.expectEmit(true, false, false, true, address(stream));
        emit PulseStreamV2.StreamPaused(sid, block.timestamp);
        vm.prank(funder);
        stream.pauseStream(sid);
        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(uint256(s.status), uint256(PulseStreamV2.StreamStatus.Paused));
        assertEq(s.pausedAt, block.timestamp);

        skip(500);
        vm.expectEmit(true, false, false, true, address(stream));
        emit PulseStreamV2.StreamUnpaused(sid, 500);
        vm.prank(funder);
        stream.unpauseStream(sid);
        s = stream.getStream(sid);
        assertEq(uint256(s.status), uint256(PulseStreamV2.StreamStatus.Active));
        assertEq(s.pausedAt, 0);
        assertEq(s.pausedDuration, 500);
        assertEq(s.lastHeartbeat, block.timestamp);
    }

    function test_Pause_RevertsNotFunder() public {
        uint256 sid = _createDefaultStream();
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.NotFunder.selector);
        stream.pauseStream(sid);
    }

    function test_Pause_RevertsWrongStatus_Proposed() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.pauseStream(sid);
    }

    function test_Unpause_RevertsNotFunder() public {
        uint256 sid = _createDefaultStream();
        vm.prank(funder);
        stream.pauseStream(sid);
        vm.prank(agent);
        vm.expectRevert(PulseStreamV2.NotFunder.selector);
        stream.unpauseStream(sid);
    }

    function test_Unpause_RevertsWrongStatus_Active() public {
        uint256 sid = _createDefaultStream();
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.unpauseStream(sid);
    }

    // ── claimPayout ──────────────────────────────────────────────────────────

    function test_Claim_HappyPath() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.prank(funder);
        stream.cancelProposal(sid);

        uint256 before = _bal(funder);
        vm.expectEmit(true, false, false, true, address(stream));
        emit PulseStreamV2.PayoutClaimed(funder, TOTAL_AMOUNT);
        vm.prank(funder);
        stream.claimPayout();

        assertEq(_bal(funder) - before, TOTAL_AMOUNT);
        assertEq(stream.pendingPayouts(funder), 0);
        assertEq(_bal(address(stream)), 0);
    }

    function test_Claim_RevertsNoPayout() public {
        vm.prank(stranger);
        vm.expectRevert(PulseStreamV2.NoPayout.selector);
        stream.claimPayout();
    }

    function test_Claim_SecondClaimReverts() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        vm.startPrank(funder);
        stream.cancelProposal(sid);
        stream.claimPayout();
        vm.expectRevert(PulseStreamV2.NoPayout.selector);
        stream.claimPayout();
        vm.stopPrank();
    }

    // ── views ────────────────────────────────────────────────────────────────

    function test_GetStreamParties() public {
        uint256 sid = _proposeStream(TOTAL_AMOUNT, DURATION);
        (address f, address a) = stream.getStreamParties(sid);
        assertEq(f, funder);
        assertEq(a, agent);
    }
}
