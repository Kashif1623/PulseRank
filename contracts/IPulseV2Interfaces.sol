// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Verification method enum shared across PulseTaskV2 and PulseStreamV2.
enum VerificationMethod { Manual, Hash, Attester }

interface IPulseStreamV2 {
    function getStreamParties(uint256 streamId) external view returns (address funder, address agent);

    function resolveDisputeCallback(uint256 disputeId, bool agentWon) external;
}

interface IPulseDisputeV2 {
    function getDisputeAgent(uint256 disputeId) external view returns (address agent);
}

interface IPulseTaskV2 {
    function getTask(uint256 taskId)
        external
        view
        returns (
            address funder,
            address agent,
            uint256 streamId,
            VerificationMethod verificationMethod,
            bool active,
            uint256 createdAt,
            uint256 milestoneCount
        );
}
