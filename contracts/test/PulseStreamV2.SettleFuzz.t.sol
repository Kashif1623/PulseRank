// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";

/// @dev Fuzz arithmetic for settleStream / proposeStream and the no-double-credit property.
contract PulseStreamV2SettleFuzzTest is PulseStreamV2TestBase {
    function testFuzz_Settle_Conservation(uint256 amount, uint256 duration, uint256 elapsed) public {
        amount   = bound(amount, stream.MIN_AMOUNT(), 50_000_000);
        duration = bound(duration, 1, 365 days);
        elapsed  = bound(elapsed, 0, duration * 2);

        usdc.mint(funder, amount);
        uint256 sid = _createActiveStream(amount, duration, 0);
        skip(elapsed);

        vm.prank(funder);
        stream.settleStream(sid);

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        uint256 activeElapsed = elapsed > duration ? duration : elapsed;
        uint256 expectedEarned = (((amount * 1e18) / duration) * activeElapsed) / 1e18;
        if (expectedEarned > amount) expectedEarned = amount;

        assertEq(s.earnedAmount, expectedEarned, "earned = rate * activeElapsed");
        assertEq(stream.pendingPayouts(agent), expectedEarned);
        assertEq(stream.pendingPayouts(funder), amount - expectedEarned);
        assertEq(stream.pendingPayouts(agent) + stream.pendingPayouts(funder), amount, "conservation");
        assertLe(s.earnedAmount, amount);
    }

    function testFuzz_Settle_NeverDoubleCredits(uint256 amount, uint256 duration, uint256 elapsed, uint8 extraCalls)
        public
    {
        amount     = bound(amount, stream.MIN_AMOUNT(), 50_000_000);
        duration   = bound(duration, 1, 365 days);
        elapsed    = bound(elapsed, 0, duration * 2);
        extraCalls = uint8(bound(extraCalls, 1, 8));

        usdc.mint(funder, amount);
        uint256 sid = _createActiveStream(amount, duration, 0);
        skip(elapsed);
        vm.prank(agent);
        stream.settleStream(sid);

        uint256 a = stream.pendingPayouts(agent);
        uint256 f = stream.pendingPayouts(funder);

        for (uint256 i = 0; i < extraCalls; i++) {
            skip(1 days);
            vm.prank(i % 2 == 0 ? funder : agent);
            vm.expectRevert(PulseStreamV2.WrongStatus.selector);
            stream.settleStream(sid);
        }
        assertEq(stream.pendingPayouts(agent), a);
        assertEq(stream.pendingPayouts(funder), f);
        assertLe(a + f, _bal(address(stream)));
    }

    function testFuzz_Settle_PausedTimeDoesNotAccrue(uint256 amount, uint256 duration, uint256 before_, uint256 paused_)
        public
    {
        amount   = bound(amount, stream.MIN_AMOUNT(), 50_000_000);
        duration = bound(duration, 100, 365 days);
        before_  = bound(before_, 0, duration / 2);
        paused_  = bound(paused_, 1, 30 days);

        usdc.mint(funder, amount);
        uint256 sid = _createActiveStream(amount, duration, 0);
        skip(before_);
        vm.prank(funder);
        stream.pauseStream(sid);
        skip(paused_);
        vm.prank(funder);
        stream.unpauseStream(sid);
        vm.prank(funder);
        stream.settleStream(sid); // immediately after unpause

        uint256 expected = (((amount * 1e18) / duration) * before_) / 1e18;
        assertEq(stream.pendingPayouts(agent), expected);
    }

    function testFuzz_Settle_RevertsUnlessActive(uint8 kind) public {
        kind = uint8(bound(kind, 0, 4));
        uint256 sid;
        if (kind == 0) {
            sid = _proposeStream(TOTAL_AMOUNT, DURATION); // Proposed
        } else if (kind == 1) {
            sid = _proposeStream(TOTAL_AMOUNT, DURATION); // Cancelled
            vm.prank(funder);
            stream.cancelProposal(sid);
        } else if (kind == 2) {
            sid = _createDefaultStream(); // Paused
            vm.prank(funder);
            stream.pauseStream(sid);
        } else if (kind == 3) {
            sid = _createDefaultStream(); // Reclaimed
            vm.prank(funder);
            stream.triggerReclaim(sid);
        } else {
            sid = _createDefaultStream(); // Completed
            vm.prank(funder);
            stream.settleStream(sid);
        }
        uint256 a = stream.pendingPayouts(agent);
        uint256 f = stream.pendingPayouts(funder);
        vm.prank(funder);
        vm.expectRevert(PulseStreamV2.WrongStatus.selector);
        stream.settleStream(sid);
        assertEq(stream.pendingPayouts(agent), a);
        assertEq(stream.pendingPayouts(funder), f);
    }

    function testFuzz_Propose_RateAndEscrow(uint256 amount, uint256 duration, uint8 mode) public {
        amount   = bound(amount, stream.MIN_AMOUNT(), 50_000_000);
        duration = bound(duration, 1, 365 days);
        mode     = uint8(bound(mode, 1, 3));

        usdc.mint(funder, amount);
        vm.startPrank(funder);
        usdc.approve(address(stream), amount);
        uint256 sid = stream.proposeStream(agent, amount, duration, mode, 0);
        vm.stopPrank();

        PulseStreamV2.Stream memory s = stream.getStream(sid);
        assertEq(s.ratePerSecX18, (amount * 1e18) / duration);
        // rate * duration never over-allocates the escrow
        assertLe((s.ratePerSecX18 * duration) / 1e18, amount);
        assertEq(_bal(address(stream)), amount);
    }
}
