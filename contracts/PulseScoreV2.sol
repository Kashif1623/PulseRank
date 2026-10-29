// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PulseScoreV2
/// @notice Tiered reputation scoring for PulseRank v2 agents.
contract PulseScoreV2 is Ownable, ReentrancyGuard {
    uint256 private constant MIN_LOCKED_FOR_HEARTBEAT = 1_000_000;
    uint256 private constant INITIAL_SCORE = 400;
    uint256 private constant MAX_SCORE = 1000;

    mapping(address => uint256) public scores;
    mapping(address => bool) public initialized;
    mapping(address => uint256) public successfulStreams;
    mapping(address => uint256) public failedStreams;
    mapping(address => uint256) public disputesAgainst;
    mapping(address => uint256) public disputesWon;

    address public pulseStream;
    bool public streamSet;

    error NotAuthorized();
    error ZeroAddress();
    error AlreadySet();

    event PulseStreamSet(address indexed pulseStream);
    event ScoreInitialized(address indexed agent, uint256 score);
    event ScoreChanged(address indexed agent, uint256 newScore, string reason);

    modifier onlyPulseStream() {
        if (msg.sender != pulseStream) revert NotAuthorized();
        _;
    }

    /// @notice Initialize ownership for the scoring system.
    /// @param initialOwner Owner that can configure PulseStream linkage.
    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    /// @notice Set PulseStream contract address once.
    /// @param s PulseStreamV2 address.
    function setPulseStream(address s) external onlyOwner nonReentrant {
        if (streamSet) revert AlreadySet();
        if (s == address(0)) revert ZeroAddress();

        pulseStream = s;
        streamSet = true;

        emit PulseStreamSet(s);
    }

    /// @notice Initialize an agent's score baseline.
    /// @param agent Agent to initialize.
    function initScore(address agent) external onlyPulseStream nonReentrant {
        if (!initialized[agent]) {
            initialized[agent] = true;
            scores[agent] = INITIAL_SCORE;
            emit ScoreInitialized(agent, INITIAL_SCORE);
        }
    }

    /// @notice Record a valid heartbeat and increase score if lock threshold is met.
    /// @param agent Agent account.
    /// @param lockedBalance Remaining locked USDC amount (6 decimals).
    function recordHeartbeat(address agent, uint256 lockedBalance) external onlyPulseStream nonReentrant {
        uint256 newScore = scores[agent];
        if (lockedBalance >= MIN_LOCKED_FOR_HEARTBEAT && newScore < MAX_SCORE) {
            unchecked {
                ++newScore;
            }
            if (newScore > MAX_SCORE) {
                newScore = MAX_SCORE;
            }
            scores[agent] = newScore;
        }

        emit ScoreChanged(agent, newScore, "heartbeat");
    }

    /// @notice Record a hard reclaim against an agent.
    /// @param agent Agent account.
    function recordHardReclaim(address agent) external onlyPulseStream nonReentrant {
        uint256 current = scores[agent];
        uint256 newScore;

        if (current <= 100) {
            newScore = 0;
        } else {
            unchecked {
                newScore = current - 100;
            }
        }

        scores[agent] = newScore;
        unchecked {
            ++failedStreams[agent];
        }

        emit ScoreChanged(agent, newScore, "hard-reclaim");
    }

    /// @notice Record successful stream completion for an agent.
    /// @param agent Agent account.
    function recordSuccess(address agent) external onlyPulseStream nonReentrant {
        uint256 current = scores[agent];
        uint256 newScore = current + 25;
        if (newScore > MAX_SCORE) {
            newScore = MAX_SCORE;
        }

        scores[agent] = newScore;
        unchecked {
            ++successfulStreams[agent];
        }

        emit ScoreChanged(agent, newScore, "success");
    }

    /// @notice Record a dispute resolved against the agent.
    /// @param agent Agent account.
    function recordDisputeAgainst(address agent) external onlyPulseStream nonReentrant {
        uint256 current = scores[agent];
        uint256 newScore;

        if (current <= 20) {
            newScore = 0;
        } else {
            unchecked {
                newScore = current - 20;
            }
        }

        scores[agent] = newScore;
        unchecked {
            ++disputesAgainst[agent];
        }

        emit ScoreChanged(agent, newScore, "dispute-against");
    }

    /// @notice Record a dispute resolved in favor of the agent.
    /// @param agent Agent account.
    function recordDisputeWon(address agent) external onlyPulseStream nonReentrant {
        uint256 current = scores[agent];
        uint256 newScore = current + 10;
        if (newScore > MAX_SCORE) {
            newScore = MAX_SCORE;
        }

        scores[agent] = newScore;
        unchecked {
            ++disputesWon[agent];
        }

        emit ScoreChanged(agent, newScore, "dispute-won");
    }

    /// @notice Return the score tier label for an agent.
    /// @param agent Agent account.
    /// @return tier Tier label.
    function getTier(address agent) external view returns (string memory tier) {
        uint256 score = scores[agent];
        if (score < 300) {
            return "Bronze";
        }
        if (score < 600) {
            return "Silver";
        }
        if (score < 800) {
            return "Gold";
        }
        return "Elite";
    }

    /// @notice Return complete score and counters for an agent.
    /// @param agent Agent account.
    /// @return score Current score.
    /// @return tier Current tier label.
    /// @return successCount Successful stream count.
    /// @return failedCount Failed stream count.
    /// @return disputesAgainstCount Disputes resolved against agent.
    /// @return disputesWonCount Disputes resolved for agent.
    function getStats(address agent)
        external
        view
        returns (
            uint256 score,
            string memory tier,
            uint256 successCount,
            uint256 failedCount,
            uint256 disputesAgainstCount,
            uint256 disputesWonCount
        )
    {
        score = scores[agent];
        if (score < 300) {
            tier = "Bronze";
        } else if (score < 600) {
            tier = "Silver";
        } else if (score < 800) {
            tier = "Gold";
        } else {
            tier = "Elite";
        }

        successCount = successfulStreams[agent];
        failedCount = failedStreams[agent];
        disputesAgainstCount = disputesAgainst[agent];
        disputesWonCount = disputesWon[agent];
    }
}
