// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test}                  from "forge-std/Test.sol";
import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";
import {MockERC20}             from "../test-helpers/MockERC20.sol";

/// @dev Drives random lifecycle sequences across a Proposed funder and a self-funding agent.
///      Every call is wrapped in try/catch so reverting paths (e.g. settle on a non-Active
///      stream) are explored without aborting the run.
contract SettleHandler is Test {
    PulseStreamV2 public stream;
    MockERC20 public usdc;
    address public funder;
    address public agent;

    uint256[] public ids;
    mapping(uint256 => uint256) public settleCount;
    bool public settledNonActive; // ghost: a settle succeeded on a non-Active stream

    constructor(PulseStreamV2 s, MockERC20 u, address f, address a) {
        stream = s;
        usdc = u;
        funder = f;
        agent = a;
    }

    function idsLength() external view returns (uint256) {
        return ids.length;
    }

    function _pick(uint256 seed) internal view returns (bool ok, uint256 sid) {
        if (ids.length == 0) return (false, 0);
        return (true, ids[seed % ids.length]);
    }

    /// @dev selfStream => proposer is the agent (created Active), else the funder (Proposed).
    function propose(bool selfStream, uint256 amount, uint256 duration, uint256 modeSeed) external {
        amount   = bound(amount, stream.MIN_AMOUNT(), 5_000_000);
        duration = bound(duration, 1, 30 days);
        uint8 mode = uint8(bound(modeSeed, 1, 3));
        address who = selfStream ? agent : funder;

        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(stream), amount);
        try stream.proposeStream(agent, amount, duration, mode, 0) returns (uint256 sid) {
            ids.push(sid);
        } catch {}
        vm.stopPrank();
    }

    function accept(uint256 seed) external {
        (bool ok, uint256 sid) = _pick(seed);
        if (!ok) return;
        vm.prank(agent);
        try stream.acceptStream(sid) {} catch {}
    }

    function cancel(uint256 seed) external {
        (bool ok, uint256 sid) = _pick(seed);
        if (!ok) return;
        vm.prank(funder);
        try stream.cancelProposal(sid) {} catch {}
        vm.prank(agent);
        try stream.cancelProposal(sid) {} catch {} // self-streams: agent is funder
    }

    function settle(uint256 seed, bool asAgent) external {
        (bool ok, uint256 sid) = _pick(seed);
        if (!ok) return;
        PulseStreamV2.StreamStatus before_ = stream.getStream(sid).status;
        vm.prank(asAgent ? agent : funder);
        try stream.settleStream(sid) {
            settleCount[sid] += 1;
            if (before_ != PulseStreamV2.StreamStatus.Active) settledNonActive = true;
        } catch {}
    }

    function settleAgain(uint256 seed) external {
        // Aggressively retries settle from both parties on the same stream.
        (bool ok, uint256 sid) = _pick(seed);
        if (!ok) return;
        for (uint256 i = 0; i < 2; i++) {
            PulseStreamV2.StreamStatus before_ = stream.getStream(sid).status;
            vm.prank(i == 0 ? funder : agent);
            try stream.settleStream(sid) {
                settleCount[sid] += 1;
                if (before_ != PulseStreamV2.StreamStatus.Active) settledNonActive = true;
            } catch {}
        }
    }

    function pause(uint256 seed) external {
        (bool ok, uint256 sid) = _pick(seed);
        if (!ok) return;
        vm.prank(funder);
        try stream.pauseStream(sid) {} catch {}
        vm.prank(agent);
        try stream.pauseStream(sid) {} catch {}
    }

    function unpause(uint256 seed) external {
        (bool ok, uint256 sid) = _pick(seed);
        if (!ok) return;
        vm.prank(funder);
        try stream.unpauseStream(sid) {} catch {}
        vm.prank(agent);
        try stream.unpauseStream(sid) {} catch {}
    }

    function reclaim(uint256 seed, bool asAgent) external {
        (bool ok, uint256 sid) = _pick(seed);
        if (!ok) return;
        vm.prank(asAgent ? agent : funder);
        try stream.triggerReclaim(sid) {} catch {}
    }

    function timeout(uint256 seed) external {
        (bool ok, uint256 sid) = _pick(seed);
        if (!ok) return;
        try stream.cancelTimedOutStream(sid) {} catch {}
    }

    function claim(bool asAgent) external {
        vm.prank(asAgent ? agent : funder);
        try stream.claimPayout() {} catch {}
    }

    function warp(uint256 secs) external {
        secs = bound(secs, 0, 3 days);
        vm.warp(block.timestamp + secs);
    }
}

contract PulseStreamV2SettleInvariantTest is PulseStreamV2TestBase {
    SettleHandler internal handler;

    function setUp() public override {
        super.setUp();
        // Treasury set so timeout penalties leave the contract; accounting must still balance.
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr);
        skip(2 days);
        vm.prank(owner);
        stream.commitTreasury();

        handler = new SettleHandler(stream, usdc, funder, agent);
        targetContract(address(handler));
    }

    function _locked() internal view returns (uint256 locked) {
        uint256 n = stream.nextStreamId();
        for (uint256 sid = 1; sid < n; sid++) {
            PulseStreamV2.StreamStatus st = stream.getStream(sid).status;
            if (
                st == PulseStreamV2.StreamStatus.Proposed || st == PulseStreamV2.StreamStatus.Active
                    || st == PulseStreamV2.StreamStatus.Paused
            ) locked += stream.getStream(sid).totalAmount;
        }
    }

    /// @dev Required property: total pending payouts never exceed escrowed USDC.
    function invariant_PendingPayoutsNeverExceedEscrow() public view {
        uint256 pending = stream.pendingPayouts(funder) + stream.pendingPayouts(agent);
        assertLe(pending, usdc.balanceOf(address(stream)), "pending > escrow");
    }

    /// @dev Stronger conservation: escrow == pending payouts + funds of still-open streams.
    function invariant_EscrowEqualsPendingPlusOpenStreams() public view {
        uint256 pending = stream.pendingPayouts(funder) + stream.pendingPayouts(agent);
        assertEq(usdc.balanceOf(address(stream)), pending + _locked(), "escrow accounting broken");
    }

    function invariant_NoSettleOnNonActive() public view {
        assertFalse(handler.settledNonActive());
    }

    function invariant_EachStreamSettledAtMostOnce() public view {
        uint256 n = handler.idsLength();
        for (uint256 i = 0; i < n; i++) {
            assertLe(handler.settleCount(handler.ids(i)), 1, "stream settled twice");
        }
    }
}
