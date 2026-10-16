// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PulseScore
/// @notice Reputation scoring contract for PulseRank agents.
contract PulseScore is Ownable {
    uint256 private constant MIN_LOCKED_FOR_HEARTBEAT = 1_000_000;
    uint256 private constant INITIAL_SCORE = 500;
    uint256 private constant MAX_SCORE = 1000;
    uint256 private constant HARD_RECLAIM_SLASH = 150;

    mapping(address => uint256) public scores;
    mapping(address => bool) public hasScore;

    address public pulseStream;
    bool public streamSet;

    error StreamAlreadySet();
    error ZeroAddress();
    error NotAuthorized();

    event PulseStreamSet(address indexed stream);
    event ScoreInitialized(address indexed agent, uint256 score);
    event ScoreUpdated(address indexed agent, uint256 newScore, string reason);

    /// @notice Restricts function calls to the configured PulseStream contract.
    modifier onlyPulseStream() {
        if (msg.sender != pulseStream) revert NotAuthorized();
        _;
    }

    /// @notice Deploy with the desired initial owner.
    /// @param initialOwner Owner address.
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Set PulseStream contract address once.
    /// @param stream PulseStream address.
    function setPulseStream(address stream) external onlyOwner {
        if (streamSet) revert StreamAlreadySet();
        if (stream == address(0)) revert ZeroAddress();

        pulseStream = stream;
        streamSet = true;

        emit PulseStreamSet(stream);
    }

    /// @notice Initialize an agent score at the default baseline.
    /// @param agent Agent address.
    function initScore(address agent) external onlyPulseStream {
        if (!hasScore[agent]) {
            hasScore[agent] = true;
            scores[agent] = INITIAL_SCORE;
            emit ScoreInitialized(agent, INITIAL_SCORE);
        }
    }

    /// @notice Record a heartbeat score update.
    /// @param agent Agent address.
    /// @param lockedBalance Unearned locked stream balance in 6-decimal USDC units.
    function recordHeartbeat(address agent, uint256 lockedBalance) external onlyPulseStream {
        uint256 currentScore = scores[agent];

        if (lockedBalance >= MIN_LOCKED_FOR_HEARTBEAT && currentScore < MAX_SCORE) {
            unchecked {
                currentScore += 1;
            }
            scores[agent] = currentScore;
        }

        emit ScoreUpdated(agent, currentScore, "heartbeat");
    }

    /// @notice Record a hard reclaim slash.
    /// @param agent Agent address.
    function recordHardReclaim(address agent) external onlyPulseStream {
        uint256 currentScore = scores[agent];
        uint256 newScore;

        if (currentScore <= HARD_RECLAIM_SLASH) {
            newScore = 0;
        } else {
            unchecked {
                newScore = currentScore - HARD_RECLAIM_SLASH;
            }
        }

        scores[agent] = newScore;
        emit ScoreUpdated(agent, newScore, "reclaim");
    }

    /// @notice Read an agent score.
    /// @param agent Agent address.
    /// @return score Current score in the 0-1000 range.
    function getScore(address agent) external view returns (uint256 score) {
        return scores[agent];
    }
}
