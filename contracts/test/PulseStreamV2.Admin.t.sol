// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";

/// @dev Owner-only admin: dispute contract timelock, treasury timelock, mode config, callback.
contract PulseStreamV2AdminTest is PulseStreamV2TestBase {
    address internal dispute = makeAddr("dispute");

    function _unauth(address who) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, who);
    }

    // ── dispute contract ─────────────────────────────────────────────────────

    function test_Dispute_ProposeAndCommit() public {
        vm.expectEmit(true, false, false, true, address(stream));
        emit PulseStreamV2.DisputeContractProposed(dispute, block.timestamp + 2 days);
        vm.prank(owner);
        stream.proposeDisputeContract(dispute);
        assertEq(stream.pendingDisputeContract(), dispute);
        assertEq(stream.disputeContractEffectiveAt(), block.timestamp + 2 days);

        skip(2 days);
        vm.expectEmit(true, false, false, false, address(stream));
        emit PulseStreamV2.DisputeContractSet(dispute);
        vm.prank(owner);
        stream.commitDisputeContract();
        assertEq(stream.disputeContract(), dispute);
        assertEq(stream.pendingDisputeContract(), address(0));
        assertEq(stream.disputeContractEffectiveAt(), 0);
    }

    function test_Dispute_ProposeRevertsZero() public {
        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.ZeroAddress.selector);
        stream.proposeDisputeContract(address(0));
    }

    function test_Dispute_ProposeRevertsNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(_unauth(stranger));
        stream.proposeDisputeContract(dispute);
    }

    function test_Dispute_CommitRevertsBeforeTimelock() public {
        vm.prank(owner);
        stream.proposeDisputeContract(dispute);
        skip(2 days - 1);
        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.TimelockNotExpired.selector);
        stream.commitDisputeContract();
    }

    function test_Dispute_CommitRevertsNothingPending() public {
        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.ZeroAddress.selector);
        stream.commitDisputeContract();
    }

    function test_Dispute_CommitRevertsNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(_unauth(stranger));
        stream.commitDisputeContract();
    }

    function test_DisputeCallback_HappyAndUnauthorized() public {
        vm.prank(owner);
        stream.proposeDisputeContract(dispute);
        skip(2 days);
        vm.prank(owner);
        stream.commitDisputeContract();

        vm.expectEmit(true, false, false, true, address(stream));
        emit PulseStreamV2.DisputeCallbackExecuted(7, true);
        vm.prank(dispute);
        stream.resolveDisputeCallback(7, true);

        vm.prank(stranger);
        vm.expectRevert(PulseStreamV2.NotAuthorized.selector);
        stream.resolveDisputeCallback(7, true);
    }

    // ── treasury ─────────────────────────────────────────────────────────────

    function test_Treasury_ProposeAndCommit() public {
        vm.expectEmit(true, false, false, true, address(stream));
        emit PulseStreamV2.TreasuryProposed(treasuryAddr, block.timestamp + 2 days);
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr);
        assertEq(stream.pendingTreasury(), treasuryAddr);

        skip(2 days);
        vm.expectEmit(true, false, false, false, address(stream));
        emit PulseStreamV2.TreasurySet(treasuryAddr);
        vm.prank(owner);
        stream.commitTreasury();
        assertEq(stream.treasury(), treasuryAddr);
        assertEq(stream.pendingTreasury(), address(0));
        assertEq(stream.pendingTreasuryEffectiveAt(), 0);
    }

    function test_Treasury_ProposeRevertsZero() public {
        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.ZeroAddress.selector);
        stream.proposeTreasury(address(0));
    }

    function test_Treasury_ProposeRevertsNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(_unauth(stranger));
        stream.proposeTreasury(treasuryAddr);
    }

    function test_Treasury_CommitRevertsBeforeTimelock() public {
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr);
        skip(2 days - 1);
        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.TimelockNotExpired.selector);
        stream.commitTreasury();
    }

    function test_Treasury_CommitRevertsNothingPending() public {
        // At t=1 (pendingTreasuryEffectiveAt == 0) the timelock passes, so TreasuryNotSet fires
        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.TreasuryNotSet.selector);
        stream.commitTreasury();
    }

    function test_Treasury_CommitRevertsNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(_unauth(stranger));
        stream.commitTreasury();
    }

    // ── mode config ──────────────────────────────────────────────────────────

    function test_SetModeConfig_HappyPath() public {
        vm.expectEmit(true, false, false, true, address(stream));
        emit PulseStreamV2.ModeConfigUpdated(4, 600, 900);
        vm.prank(owner);
        stream.setModeConfig(4, 600, 900);
        (uint256 hb, uint256 gr) = stream.getModeConfig(4);
        assertEq(hb, 600);
        assertEq(gr, 900);
    }

    function test_SetModeConfig_NewModeUsableForStreams() public {
        vm.prank(owner);
        stream.setModeConfig(4, 600, 900);
        vm.startPrank(funder);
        usdc.approve(address(stream), TOTAL_AMOUNT);
        uint256 sid = stream.proposeStream(agent, TOTAL_AMOUNT, DURATION, 4, 0);
        vm.stopPrank();
        assertEq(stream.getStream(sid).mode, 4);
    }

    function test_SetModeConfig_Bounds() public {
        vm.startPrank(owner);
        vm.expectRevert(PulseStreamV2.InvalidMode.selector);
        stream.setModeConfig(1, 299, 600);
        vm.expectRevert(PulseStreamV2.InvalidMode.selector);
        stream.setModeConfig(1, 3601, 600);
        vm.expectRevert(PulseStreamV2.InvalidMode.selector);
        stream.setModeConfig(1, 300, 299);
        vm.expectRevert(PulseStreamV2.InvalidMode.selector);
        stream.setModeConfig(1, 300, 7201);
        // boundaries accepted
        stream.setModeConfig(1, 300, 300);
        stream.setModeConfig(1, 3600, 7200);
        vm.stopPrank();
    }

    function test_SetModeConfig_RevertsNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(_unauth(stranger));
        stream.setModeConfig(1, 300, 600);
    }
}
