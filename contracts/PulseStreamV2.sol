// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PulseRegistryV2} from "./PulseRegistryV2.sol";
import {PulseScoreV2} from "./PulseScoreV2.sol";
import {PulseTaskV2} from "./PulseTaskV2.sol";
import {IPulseDisputeV2, IPulseStreamV2, IPulseTaskV2, VerificationMethod} from "./IPulseV2Interfaces.sol";

/// @title PulseStreamV2
/// @notice Core PulseRank v2 streaming escrow and payout settlement contract.
contract PulseStreamV2 is ReentrancyGuard, Ownable, IPulseStreamV2 {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_AMOUNT = 200_000;
    uint256 public constant MAX_KEEPER_BOUNTY = 2_000_000;
    uint256 public constant KEEPER_FEE_BPS = 100;
    uint256 public constant MAX_GRACE_MISSED = 3;
    uint256 public constant AUTHORITY_CHANGE_DELAY = 2 days;
    uint256 public constant PENALTY_BPS = 500;
    uint256 public constant AUTHORITY_CHANGE_DELAY_TREASURY = 2 days;

    address public immutable USDC;

    struct ModeConfig {
        uint256 heartbeatInterval;
        uint256 gracePeriod;
    }

    enum StreamStatus {
        Proposed,
        Active,
        Paused,
        Completed,
        Reclaimed,
        Cancelled
    }

    struct Stream {
        address funder;
        address agent;
        uint256 totalAmount;
        uint256 durationSecs;
        uint256 ratePerSecX18;
        uint256 startTime;
        uint256 lastHeartbeat;
        uint256 earnedAmount;
        uint256 pausedAt;
        uint256 pausedDuration;
        uint256 missedHeartbeats;
        uint256 lastMissCheckpoint;
        uint256 taskId;
        uint8 mode;
        StreamStatus status;
    }

    mapping(uint256 => Stream) public streams;
    uint256 public nextStreamId;
    mapping(address => uint256[]) public agentStreams;
    mapping(address => uint256[]) public funderStreams;
    mapping(address => uint256) public pendingPayouts;
    mapping(uint8 => ModeConfig) private _modes;

    PulseRegistryV2 public immutable registry;
    PulseScoreV2 public immutable scoreContract;
    PulseTaskV2 public immutable taskContract;

    address public disputeContract;
    address public pendingDisputeContract;
    uint256 public disputeContractEffectiveAt;

    address public treasury;
    address public pendingTreasury;
    uint256 public pendingTreasuryEffectiveAt;

    error AgentNotRegistered();
    error AmountTooLow();
    error InvalidDuration();
    error InvalidMode();
    error NotAgent();
    error NotFunder();
    error NotParticipant();
    error WrongStatus();
    error HeartbeatTooEarly();
    error ReclaimNotReady();
    error StreamComplete();
    error StreamNotComplete();
    error NoPayout();
    error PauseNotExpired();
    error ZeroAddress();
    error NotAuthorized();
    error TimelockNotExpired();
    error StreamNotTimedOut();
    error TreasuryNotSet();

    event StreamProposed(uint256 indexed streamId, address indexed funder, address indexed agent, uint256 totalAmount, uint256 durationSecs, uint8 mode, uint256 taskId);
    event StreamActivated(uint256 indexed streamId, uint256 startTime);
    event StreamCancelled(uint256 indexed streamId);
    event HeartbeatSent(uint256 indexed streamId, uint256 timestamp, uint256 newEarned, uint256 missedHeartbeats);
    event GraceLimitWarning(uint256 indexed streamId, uint256 missedHeartbeats);
    event StreamPaused(uint256 indexed streamId, uint256 timestamp);
    event StreamUnpaused(uint256 indexed streamId, uint256 totalPausedDuration);
    event StreamReclaimed(uint256 indexed streamId, address indexed keeper, uint256 earned, uint256 bounty, uint256 refund);
    event StreamCompleted(uint256 indexed streamId, uint256 earned, uint256 refund);
    event PayoutClaimed(address indexed recipient, uint256 amount);
    event DisputeContractSet(address indexed disputeContract);
    event DisputeContractProposed(address indexed pending, uint256 effectiveAt);
    event TreasurySet(address indexed treasury);
    event TreasuryProposed(address indexed pending, uint256 effectiveAt);
    event StreamTimedOut(uint256 indexed streamId, address indexed keeper, uint256 agentEarned, uint256 penalty, uint256 funderRefund);
    event ModeConfigUpdated(uint8 indexed mode, uint256 heartbeatInterval, uint256 gracePeriod);
    event DisputeCallbackExecuted(uint256 indexed disputeId, bool agentWon);

    constructor(address usdc_, address registry_, address scoreContract_, address taskContract_, address initialOwner)
        Ownable(initialOwner)
    {
        if (usdc_ == address(0)) revert ZeroAddress();
        if (registry_ == address(0)) revert ZeroAddress();
        if (scoreContract_ == address(0)) revert ZeroAddress();
        if (taskContract_ == address(0)) revert ZeroAddress();
        if (initialOwner == address(0)) revert ZeroAddress();

        USDC = usdc_;
        registry = PulseRegistryV2(registry_);
        scoreContract = PulseScoreV2(scoreContract_);
        taskContract = PulseTaskV2(taskContract_);

        _modes[1] = ModeConfig({heartbeatInterval: 300, gracePeriod: 600});
        _modes[2] = ModeConfig({heartbeatInterval: 1800, gracePeriod: 1800});
        _modes[3] = ModeConfig({heartbeatInterval: 3600, gracePeriod: 7200});

        nextStreamId = 1;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function proposeDisputeContract(address d) external onlyOwner nonReentrant {
        if (d == address(0)) revert ZeroAddress();
        pendingDisputeContract = d;
        disputeContractEffectiveAt = block.timestamp + AUTHORITY_CHANGE_DELAY;
        emit DisputeContractProposed(d, disputeContractEffectiveAt);
    }

    function commitDisputeContract() external onlyOwner nonReentrant {
        if (block.timestamp < disputeContractEffectiveAt) revert TimelockNotExpired();
        if (pendingDisputeContract == address(0)) revert ZeroAddress();
        disputeContract = pendingDisputeContract;
        pendingDisputeContract = address(0);
        disputeContractEffectiveAt = 0;
        emit DisputeContractSet(disputeContract);
    }

    function proposeTreasury(address t) external onlyOwner nonReentrant {
        if (t == address(0)) revert ZeroAddress();
        pendingTreasury = t;
        pendingTreasuryEffectiveAt = block.timestamp + AUTHORITY_CHANGE_DELAY_TREASURY;
        emit TreasuryProposed(t, pendingTreasuryEffectiveAt);
    }

    function commitTreasury() external onlyOwner nonReentrant {
        if (block.timestamp < pendingTreasuryEffectiveAt) revert TimelockNotExpired();
        if (pendingTreasury == address(0)) revert TreasuryNotSet();
        treasury = pendingTreasury;
        pendingTreasury = address(0);
        pendingTreasuryEffectiveAt = 0;
        emit TreasurySet(treasury);
    }

    function setModeConfig(uint8 mode, uint256 heartbeatInterval_, uint256 gracePeriod_) external onlyOwner {
        if (heartbeatInterval_ < 300 || heartbeatInterval_ > 3600) revert InvalidMode();
        if (gracePeriod_ < 300 || gracePeriod_ > 7200) revert InvalidMode();
        _modes[mode] = ModeConfig({heartbeatInterval: heartbeatInterval_, gracePeriod: gracePeriod_});
        emit ModeConfigUpdated(mode, heartbeatInterval_, gracePeriod_);
    }

    // ── Stream lifecycle ──────────────────────────────────────────────────────

    function proposeStream(address agent, uint256 totalAmount, uint256 durationSecs, uint8 mode, uint256 taskId)
        external nonReentrant returns (uint256 streamId)
    {
        if (!registry.hasRegistered(agent)) revert AgentNotRegistered();
        if (totalAmount < MIN_AMOUNT) revert AmountTooLow();
        if (durationSecs == 0) revert InvalidDuration();
        ModeConfig memory cfg = _modes[mode];
        if (cfg.heartbeatInterval == 0) revert InvalidMode();

        IERC20(USDC).safeTransferFrom(msg.sender, address(this), totalAmount);

        streamId = nextStreamId;
        nextStreamId = streamId + 1;

        Stream storage s = streams[streamId];
        s.funder = msg.sender;
        s.agent = agent;
        s.totalAmount = totalAmount;
        s.durationSecs = durationSecs;
        s.ratePerSecX18 = (totalAmount * 1e18) / durationSecs;
        s.taskId = taskId;
        s.mode = mode;
        s.status = StreamStatus.Proposed;

        agentStreams[agent].push(streamId);
        funderStreams[msg.sender].push(streamId);

        emit StreamProposed(streamId, msg.sender, agent, totalAmount, durationSecs, mode, taskId);
    }

    function acceptStream(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        if (msg.sender != s.agent) revert NotAgent();
        if (s.status != StreamStatus.Proposed) revert WrongStatus();
        s.status = StreamStatus.Active;
        s.startTime = block.timestamp;
        s.lastHeartbeat = block.timestamp;
        s.lastMissCheckpoint = block.timestamp;
        scoreContract.initScore(s.agent);
        emit StreamActivated(streamId, block.timestamp);
    }

    function cancelProposal(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        if (msg.sender != s.funder) revert NotFunder();
        if (s.status != StreamStatus.Proposed) revert WrongStatus();
        s.status = StreamStatus.Cancelled;
        pendingPayouts[s.funder] += s.totalAmount;
        emit StreamCancelled(streamId);
    }

    function sendHeartbeat(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        if (msg.sender != s.agent) revert NotAgent();
        if (s.status != StreamStatus.Active) revert WrongStatus();

        ModeConfig memory cfg = _modes[s.mode];
        uint256 elapsed = block.timestamp - s.lastHeartbeat;
        if (elapsed < cfg.heartbeatInterval) revert HeartbeatTooEarly();

        uint256 newEarned = _computeEarnedFromSnapshot(s, block.timestamp);
        if (newEarned > s.earnedAmount) {
            s.earnedAmount = newEarned;
        }
        s.lastHeartbeat = block.timestamp;
        scoreContract.recordHeartbeat(s.agent, s.totalAmount - s.earnedAmount);
        emit HeartbeatSent(streamId, block.timestamp, s.earnedAmount, s.missedHeartbeats);
    }

    function pauseStream(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        if (msg.sender != s.funder) revert NotFunder();
        if (s.status != StreamStatus.Active) revert WrongStatus();
        s.status = StreamStatus.Paused;
        s.pausedAt = block.timestamp;
        emit StreamPaused(streamId, block.timestamp);
    }

    function unpauseStream(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        if (msg.sender != s.funder) revert NotFunder();
        if (s.status != StreamStatus.Paused) revert WrongStatus();
        uint256 pausedDelta = block.timestamp - s.pausedAt;
        s.pausedDuration += pausedDelta;
        s.pausedAt = 0;
        s.status = StreamStatus.Active;
        s.lastHeartbeat = block.timestamp;
        emit StreamUnpaused(streamId, s.pausedDuration);
    }

    function triggerReclaim(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        if (msg.sender != s.funder && msg.sender != s.agent) revert NotParticipant();
        if (s.status != StreamStatus.Active && s.status != StreamStatus.Paused) revert WrongStatus();
        (, , uint256 earned) = _snapshot(s, block.timestamp);
        earned = _applyTaskCap(s, earned);
        s.earnedAmount = earned;
        uint256 unearned = s.totalAmount - earned;
        pendingPayouts[s.agent] += earned;
        pendingPayouts[s.funder] += unearned;
        s.status = StreamStatus.Reclaimed;
        emit StreamReclaimed(streamId, msg.sender, earned, 0, unearned);
    }

    /// @notice Permissionless. Terminates a stream whose agent has gone silent.
    /// @dev    Eligible when: stream is Active or Paused, AND
    ///         block.timestamp > lastHeartbeat + heartbeatInterval + gracePeriod
    ///         (uses the ModeConfig for the stream's mode).
    ///         Distributes funds:
    ///           - agent earns up to earned amount (via _computeEarnedFromSnapshot)
    ///           - 5% penalty taken from UNEARNED remainder, sent to treasury
    ///           - remainder after penalty refunded to funder
    ///         Slashes agent score via scoreContract.recordHardReclaim(agent).
    ///         Marks stream status = Reclaimed.
    function cancelTimedOutStream(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.Active) revert WrongStatus();

        ModeConfig memory cfg = _modes[s.mode];
        if (block.timestamp <= s.lastHeartbeat + cfg.heartbeatInterval + cfg.gracePeriod) revert StreamNotTimedOut();

        uint256 agentEarned = _computeEarnedFromSnapshot(s, block.timestamp);
        agentEarned = _applyTaskCap(s, agentEarned);
        uint256 unearned = s.totalAmount - agentEarned;
        uint256 penalty = (unearned * PENALTY_BPS) / 10_000;
        uint256 funderRefund = unearned - penalty;

        s.earnedAmount = agentEarned;
        pendingPayouts[s.agent] += agentEarned;

        if (treasury == address(0)) {
            funderRefund += penalty;
        } else {
            IERC20(USDC).safeTransfer(treasury, penalty);
        }

        pendingPayouts[s.funder] += funderRefund;
        s.status = StreamStatus.Reclaimed;
        scoreContract.recordHardReclaim(s.agent);

        emit StreamTimedOut(streamId, msg.sender, agentEarned, penalty, funderRefund);
    }

    function settleStream(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        if (msg.sender != s.funder && msg.sender != s.agent) revert NotParticipant();
        (, , uint256 earned) = _snapshot(s, block.timestamp);
        earned = _applyTaskCap(s, earned);
        uint256 refund = s.totalAmount - earned;
        s.earnedAmount = earned;
        s.status = StreamStatus.Completed;
        pendingPayouts[s.agent] += earned;
        pendingPayouts[s.funder] += refund;
        emit StreamCompleted(streamId, earned, refund);
    }

    function claimPayout() external nonReentrant {
        uint256 amount = pendingPayouts[msg.sender];
        if (amount == 0) revert NoPayout();
        pendingPayouts[msg.sender] = 0;
        IERC20(USDC).safeTransfer(msg.sender, amount);
        emit PayoutClaimed(msg.sender, amount);
    }

    // ── Dispute callback ──────────────────────────────────────────────────────

    function resolveDisputeCallback(uint256 disputeId, bool agentWon) external {
        if (msg.sender != disputeContract) revert NotAuthorized();
        emit DisputeCallbackExecuted(disputeId, agentWon);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getStream(uint256 streamId) external view returns (Stream memory) {
        return streams[streamId];
    }

    function getStreamParties(uint256 streamId) external view override returns (address funder, address agent) {
        Stream storage s = streams[streamId];
        return (s.funder, s.agent);
    }

    /// @notice Returns true when a stream is eligible for cancelTimedOutStream.
    function isTimedOut(uint256 streamId) external view returns (bool) {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.Active) return false;
        ModeConfig memory cfg = _modes[s.mode];
        return block.timestamp > s.lastHeartbeat + cfg.heartbeatInterval + cfg.gracePeriod;
    }

    function getModeConfig(uint8 mode) external view returns (uint256 heartbeatInterval, uint256 gracePeriod) {
        ModeConfig memory cfg = _modes[mode];
        return (cfg.heartbeatInterval, cfg.gracePeriod);
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    function _snapshot(Stream storage s, uint256 atTime)
        internal view
        returns (uint256 activeElapsed, uint256 elapsed, uint256 earned)
    {
        if (s.startTime == 0 || atTime <= s.startTime) return (0, 0, 0);
        elapsed = atTime - s.startTime;
        uint256 totalPaused = s.pausedDuration;
        if (s.status == StreamStatus.Paused && s.pausedAt != 0) {
            totalPaused += (atTime - s.pausedAt);
        }
        activeElapsed = totalPaused >= elapsed ? 0 : elapsed - totalPaused;
        if (activeElapsed > s.durationSecs) activeElapsed = s.durationSecs;
        earned = (s.ratePerSecX18 * activeElapsed) / 1e18;
        if (earned > s.totalAmount) earned = s.totalAmount;
    }

    function _computeEarnedFromSnapshot(Stream storage s, uint256 atTime) internal view returns (uint256 earned) {
        (, , earned) = _snapshot(s, atTime);
    }

    function _applyTaskCap(Stream storage s, uint256 earned) internal view returns (uint256) {
        if (s.taskId > 0) {
            uint256 bps = taskContract.approvedBps(s.taskId);
            uint256 taskCapped = (s.totalAmount * bps) / 10_000;
            if (earned > taskCapped) return taskCapped;
        }
        return earned;
    }
}
