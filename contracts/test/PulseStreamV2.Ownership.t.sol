// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable}      from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {PulseStreamV2TestBase} from "./PulseStreamV2.Base.t.sol";
import {PulseStreamV2}         from "../PulseStreamV2.sol";

/// @dev Two-step ownership (Ownable2Step) and disabled renounce.
contract PulseStreamV2OwnershipTest is PulseStreamV2TestBase {
    address internal newOwner = makeAddr("newOwner");

    function test_Owner_IsInitialOwner() public view {
        assertEq(stream.owner(), owner);
        assertEq(stream.pendingOwner(), address(0));
    }

    function test_TransferOwnership_OnlySetsPending() public {
        vm.prank(owner);
        stream.transferOwnership(newOwner);
        assertEq(stream.owner(), owner, "owner must not change until accepted");
        assertEq(stream.pendingOwner(), newOwner);
    }

    function test_TransferOwnership_EmitsStarted() public {
        vm.expectEmit(true, true, false, false, address(stream));
        emit Ownable2Step.OwnershipTransferStarted(owner, newOwner);
        vm.prank(owner);
        stream.transferOwnership(newOwner);
    }

    function test_AcceptOwnership_CompletesTransfer() public {
        vm.prank(owner);
        stream.transferOwnership(newOwner);

        vm.expectEmit(true, true, false, false, address(stream));
        emit Ownable.OwnershipTransferred(owner, newOwner);
        vm.prank(newOwner);
        stream.acceptOwnership();

        assertEq(stream.owner(), newOwner);
        assertEq(stream.pendingOwner(), address(0));
    }

    function test_AcceptOwnership_NewOwnerCanAdministerOldCannot() public {
        vm.prank(owner);
        stream.transferOwnership(newOwner);
        vm.prank(newOwner);
        stream.acceptOwnership();

        vm.prank(newOwner);
        stream.proposeTreasury(treasuryAddr);
        assertEq(stream.pendingTreasury(), treasuryAddr);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        stream.proposeTreasury(treasuryAddr);
    }

    function test_AcceptOwnership_RevertsForNonPending() public {
        vm.prank(owner);
        stream.transferOwnership(newOwner);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        stream.acceptOwnership();
        assertEq(stream.owner(), owner);
    }

    function test_AcceptOwnership_RevertsWhenNothingPending() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        stream.acceptOwnership();
    }

    function test_TransferOwnership_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        stream.transferOwnership(newOwner);
    }

    function test_TransferOwnership_SecondCallReplacesPending() public {
        address other = makeAddr("other");
        vm.startPrank(owner);
        stream.transferOwnership(newOwner);
        stream.transferOwnership(other);
        vm.stopPrank();
        assertEq(stream.pendingOwner(), other);

        vm.prank(newOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, newOwner));
        stream.acceptOwnership();
    }

    function test_PreviousOwnerStillOwnsUntilAccepted() public {
        vm.prank(owner);
        stream.transferOwnership(newOwner);
        vm.prank(owner);
        stream.proposeTreasury(treasuryAddr); // still works
        assertEq(stream.pendingTreasury(), treasuryAddr);
    }

    // ── renounceOwnership disabled ───────────────────────────────────────────

    function test_RenounceOwnership_RevertsRenounceDisabled() public {
        vm.prank(owner);
        vm.expectRevert(PulseStreamV2.RenounceDisabled.selector);
        stream.renounceOwnership();
        assertEq(stream.owner(), owner);
    }

    function test_RenounceOwnership_NonOwnerRevertsUnauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        stream.renounceOwnership();
    }

    function test_RenounceOwnership_StillDisabledWithPendingTransfer() public {
        vm.startPrank(owner);
        stream.transferOwnership(newOwner);
        vm.expectRevert(PulseStreamV2.RenounceDisabled.selector);
        stream.renounceOwnership();
        vm.stopPrank();
        assertEq(stream.owner(), owner);
        assertEq(stream.pendingOwner(), newOwner);
    }

    function test_RenounceOwnership_DisabledForNewOwnerToo() public {
        vm.prank(owner);
        stream.transferOwnership(newOwner);
        vm.prank(newOwner);
        stream.acceptOwnership();
        vm.prank(newOwner);
        vm.expectRevert(PulseStreamV2.RenounceDisabled.selector);
        stream.renounceOwnership();
        assertEq(stream.owner(), newOwner);
    }

    function test_TransferOwnership_ToZeroDoesNotChangeOwner() public {
        // Ownable2Step allows setting pending to zero (cancels pending); owner stays.
        vm.startPrank(owner);
        stream.transferOwnership(newOwner);
        stream.transferOwnership(address(0));
        vm.stopPrank();
        assertEq(stream.pendingOwner(), address(0));
        assertEq(stream.owner(), owner);
    }
}
