// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";
import {Ownable}               from "@openzeppelin/contracts/access/Ownable.sol";

contract PulseStreamV2TreasuryTest is PulseStreamV2TestBase {

    // ── proposeTreasury ───────────────────────────────────────────────────────

    function test_ProposeTreasury_SetsFields() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(stream));
        emit PulseStreamV2.TreasuryProposed(treasuryAddr, 0);
        stream.proposeTreasury(treasuryAddr);

        assertEq(stream.pendingTreasury(), treasuryAddr);
        // effectiveAt = block.timestamp + 2 days
        assertEq(stream.pendingTreasuryEffectiveAt(), block.timestamp + 2 days);
    }

    function test_ProposeTreasury_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        stream.proposeTreasury(treasuryAddr);
    }

    function test_ProposeTreasury_RevertsForZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.ZeroAddress.selector);
        stream.proposeTreasury(address(0));
    }

    // ── commitTreasury ────────────────────────────────────────────────────────

    function test_CommitTreasury_HappyPath() public {
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr);

        // Warp just past the 2-day delay
        vm.warp(block.timestamp + 2 days + 1);

        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(stream));
        emit PulseStreamV2.TreasurySet(treasuryAddr);
        stream.commitTreasury();

        assertEq(stream.treasury(), treasuryAddr);
        assertEq(stream.pendingTreasury(), address(0));
        assertEq(stream.pendingTreasuryEffectiveAt(), 0);
    }

    function test_CommitTreasury_RevertsBeforeDelay() public {
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr);

        // Warp to one second BEFORE effectiveAt — strict-less-than check in contract
        vm.warp(stream.pendingTreasuryEffectiveAt() - 1);

        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.TimelockNotExpired.selector);
        stream.commitTreasury();
    }

    function test_CommitTreasury_RevertsBeforeDelayInstant() public {
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr);

        // Try immediately (no warp)
        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.TimelockNotExpired.selector);
        stream.commitTreasury();
    }

    function test_CommitTreasury_RevertsWhenNothingProposed() public {
        // pendingTreasuryEffectiveAt == 0 → block.timestamp (> 0) > 0 is true, so
        // the TimelockNotExpired check passes, but pendingTreasury is address(0)
        // which triggers TreasuryNotSet.
        // First warp so the timestamp condition passes.
        vm.warp(1);
        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.TreasuryNotSet.selector);
        stream.commitTreasury();
    }

    function test_CommitTreasury_RevertsForNonOwner() public {
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr);
        vm.warp(block.timestamp + 2 days + 1);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        stream.commitTreasury();
    }

    // ── replaceability: second proposal overrides the first ───────────────────

    function test_ProposeTreasury_OverridesExistingPending() public {
        address alt = makeAddr("alt");
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr);

        vm.prank(owner);
        stream.proposeTreasury(alt);

        assertEq(stream.pendingTreasury(), alt);
    }
}
