// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PulseRegistry} from "./PulseRegistry.sol";
import {PulseScore} from "./PulseScore.sol";

/// @title PulseStream
/// @notice Core streaming escrow contract for PulseRank.
contract PulseStream is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_AMOUNT = 200_000;
    uint256 public constant MAX_KEEPER_BOUNTY = 2_000_000;
    uint256 public constant KEEPER_FEE_BPS = 100;
    uint256 public constant MAX_PAUSE_DURATION = 7 days;
    address public immutable USDC;

    struct ModeConfig {
        uint256 heartbeatInterval;
        uint256 gracePeriod;
    }

    enum StreamStatus {
        Proposed,
        Active,
        Closed
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
        uint8 mode;
        StreamStatus status;
    }

    mapping(uint8 => ModeConfig) private _modeConfigs;
    mapping(uint256 => Stream) public streams;
    mapping(uint256 => uint256) private _pausedDurationAtLastHeartbeat;

    uint256 public nextStreamId;
    PulseRegistry public immutable registry;
    PulseScore public immutable scoreContract;
    mapping(address => uint256[]) public agentStreams;
    mapping(address => uint256[]) public funderStreams;
    mapping(address => uint256) public pendingPayouts;

    error AgentNotRegistered();
    error AmountTooLow();
    error InvalidDuration();
    error InvalidMode();
    error NotAgent();
    error NotFunder();
    error StreamNotActive();
    error StreamIsPaused();
    error NotPaused();
    error PauseNotExpired();
    error AlreadyPaused();
    error HeartbeatTooEarly();
    error ReclaimNotReady();
    error StreamAlreadyReclaimed();
    error NotParticipant();
    error StreamNotComplete();
    error NoPayout();
    error HeartbeatDeadlineMissed();
    error StreamComplete();
    error ZeroAddress();
    error NotProposed();

    event StreamProposed(
        uint256 indexed streamId,
        address indexed funder,
        address indexed agent,
        uint256 totalAmount,
        uint256 durationSecs,
        uint8 mode
    );
    event StreamCreated(
        uint256 indexed streamId,
        address indexed funder,
        address indexed agent,
        uint256 totalAmount,
        uint256 durationSecs,
        uint8 mode
    );
    event StreamCancelled(uint256 indexed streamId, address indexed funder);
    event HeartbeatSent(uint256 indexed streamId, address indexed agent, uint256 newEarned, uint256 timestamp);
    event StreamPaused(uint256 indexed streamId, uint256 timestamp);
    event StreamUnpaused(uint256 indexed streamId, uint256 pausedDuration_);
    event StreamReclaimed(
        uint256 indexed streamId,
        address indexed keeper,
        uint256 earnedByAgent,
        uint256 keeperBounty,
        uint256 refundToFunder
    );
    event StreamSettled(
        uint256 indexed streamId,
        address indexed agent,
        uint256 earnedByAgent,
        uint256 refundToFunder
    );
    event PayoutClaimed(address indexed recipient, uint256 amount);

    /// @notice Deploy PulseStream with USDC token, registry, score contract, and owner.
    /// @param usdc_ USDC token address.
    /// @param registry_ PulseRegistry address.
    /// @param scoreContract_ PulseScore address.
    /// @param initialOwner Owner address.
    constructor(address usdc_, address registry_, address scoreContract_, address initialOwner) Ownable(initialOwner) {
        if (usdc_ == address(0)) revert ZeroAddress();
        if (registry_ == address(0)) revert ZeroAddress();
        if (scoreContract_ == address(0)) revert ZeroAddress();

        USDC = usdc_;
        registry = PulseRegistry(registry_);
        scoreContract = PulseScore(scoreContract_);

        _modeConfigs[1] = ModeConfig({heartbeatInterval: 1800, gracePeriod: 600});
        _modeConfigs[2] = ModeConfig({heartbeatInterval: 7200, gracePeriod: 1800});
        _modeConfigs[3] = ModeConfig({heartbeatInterval: 43200, gracePeriod: 7200});

        nextStreamId = 1;
    }

    /// @notice Propose a new stream and escrow USDC.
    /// @param agent Agent receiving stream earnings.
    /// @param totalAmount Total USDC amount (6 decimals).
    /// @param durationSecs Stream duration in seconds.
    /// @param mode Heartbeat mode (1 strict, 2 normal, 3 relaxed).
    /// @return streamId Newly created stream ID.
    function proposeStream(
        address agent,
        uint256 totalAmount,
        uint256 durationSecs,
        uint8 mode
    ) external nonReentrant returns (uint256 streamId) {
        PulseRegistry.Agent memory agentData = registry.getAgent(agent);
        if (!agentData.registered) revert AgentNotRegistered();
        if (totalAmount < MIN_AMOUNT) revert AmountTooLow();
        if (durationSecs == 0) revert InvalidDuration();

        ModeConfig memory cfg = _modeConfigs[mode];
        if (cfg.heartbeatInterval == 0) revert InvalidMode();

        IERC20(USDC).safeTransferFrom(msg.sender, address(this), totalAmount);

        streamId = nextStreamId;
        nextStreamId = streamId + 1;

        Stream storage stream = streams[streamId];
        stream.funder = msg.sender;
        stream.agent = agent;
        stream.totalAmount = totalAmount;
        stream.durationSecs = durationSecs;
        stream.ratePerSecX18 = (totalAmount * 1e18) / durationSecs;
        stream.startTime = 0;
        stream.lastHeartbeat = 0;
        stream.mode = mode;
        stream.status = StreamStatus.Proposed;

        agentStreams[agent].push(streamId);
        funderStreams[msg.sender].push(streamId);

        emit StreamProposed(streamId, msg.sender, agent, totalAmount, durationSecs, mode);
    }

    /// @notice Accept a proposed stream and activate it.
    /// @param streamId Stream ID.
    function acceptStream(uint256 streamId) external nonReentrant {
        Stream storage stream = streams[streamId];

        if (msg.sender != stream.agent) revert NotAgent();
        if (stream.status != StreamStatus.Proposed) revert NotProposed();

        stream.status = StreamStatus.Active;
        stream.startTime = block.timestamp;
        stream.lastHeartbeat = block.timestamp;

        scoreContract.initScore(stream.agent);

        emit StreamCreated(streamId, stream.funder, stream.agent, stream.totalAmount, stream.durationSecs, stream.mode);
    }

    /// @notice Cancel a proposed stream and refund the funder to pending payouts.
    /// @param streamId Stream ID.
    function cancelProposal(uint256 streamId) external nonReentrant {
        Stream storage stream = streams[streamId];

        if (msg.sender != stream.funder) revert NotFunder();
        if (stream.status != StreamStatus.Proposed) revert NotProposed();

        stream.status = StreamStatus.Closed;
        pendingPayouts[stream.funder] += stream.totalAmount;

        emit StreamCancelled(streamId, stream.funder);
    }

    /// @notice Send heartbeat for an active stream.
    /// @param streamId Stream ID.
    function sendHeartbeat(uint256 streamId) external nonReentrant {
        Stream storage stream = streams[streamId];
        _ensureActive(stream);

        if (msg.sender != stream.agent) revert NotAgent();
        if (stream.pausedAt != 0) revert StreamIsPaused();

        ModeConfig memory cfg = _modeConfigs[stream.mode];
        uint256 elapsedSinceHeartbeat = _effectiveElapsedSinceLastHeartbeat(streamId, stream);
        if (elapsedSinceHeartbeat < cfg.heartbeatInterval) revert HeartbeatTooEarly();

        uint256 totalEarned = _computeEarned(stream);
        if (totalEarned > stream.earnedAmount) {
            stream.earnedAmount = totalEarned;
        }

        stream.lastHeartbeat = block.timestamp;
        _pausedDurationAtLastHeartbeat[streamId] = stream.pausedDuration;

        uint256 lockedBalance = stream.totalAmount - stream.earnedAmount;
        scoreContract.recordHeartbeat(stream.agent, lockedBalance);

        emit HeartbeatSent(streamId, stream.agent, stream.earnedAmount, block.timestamp);
    }

    /// @notice Pause a stream.
    /// @param streamId Stream ID.
    function pauseStream(uint256 streamId) external {
        Stream storage stream = streams[streamId];
        _ensureActive(stream);

        if (msg.sender != stream.funder) revert NotFunder();
        if (stream.pausedAt != 0) revert AlreadyPaused();

        stream.pausedAt = block.timestamp;

        emit StreamPaused(streamId, block.timestamp);
    }

    /// @notice Unpause a stream.
    /// @param streamId Stream ID.
    function unpauseStream(uint256 streamId) external {
        Stream storage stream = streams[streamId];
        _ensureActive(stream);

        if (msg.sender != stream.funder) revert NotFunder();
        if (stream.pausedAt == 0) revert NotPaused();

        uint256 pausedDelta = block.timestamp - stream.pausedAt;
        stream.pausedDuration += pausedDelta;
        stream.pausedAt = 0;

        emit StreamUnpaused(streamId, pausedDelta);
    }

    /// @notice Permissionless unpause after max pause duration.
    /// @param streamId Stream ID.
    function forceUnpause(uint256 streamId) external {
        Stream storage stream = streams[streamId];
        _ensureActive(stream);

        if (stream.pausedAt == 0) revert NotPaused();

        uint256 pausedDelta = block.timestamp - stream.pausedAt;
        if (pausedDelta < MAX_PAUSE_DURATION) revert PauseNotExpired();

        stream.pausedDuration += pausedDelta;
        stream.pausedAt = 0;

        emit StreamUnpaused(streamId, pausedDelta);
    }

    /// @notice Trigger reclaim after missed heartbeat deadline.
    /// @param streamId Stream ID.
    function triggerReclaim(uint256 streamId) external nonReentrant {
        Stream storage stream = streams[streamId];
        _ensureActive(stream);

        if (stream.pausedAt != 0) revert StreamIsPaused();

        ModeConfig memory cfg = _modeConfigs[stream.mode];
        uint256 elapsedSinceHeartbeat = _effectiveElapsedSinceLastHeartbeat(streamId, stream);
        uint256 deadline = cfg.heartbeatInterval + cfg.gracePeriod;
        if (elapsedSinceHeartbeat <= deadline) revert ReclaimNotReady();

        uint256 elapsed = (stream.startTime != 0 && block.timestamp > stream.startTime)
            ? block.timestamp - stream.startTime
            : 0;

        uint256 totalPaused = stream.pausedDuration;
        if (stream.pausedAt != 0) {
            totalPaused += block.timestamp - stream.pausedAt;
        }

        uint256 activeElapsed = (totalPaused >= elapsed) ? 0 : elapsed - totalPaused;
        if (activeElapsed > stream.durationSecs) {
            activeElapsed = stream.durationSecs;
        }

        if (activeElapsed >= stream.durationSecs) revert StreamComplete();

        uint256 earned = _computeEarned(stream);
        stream.earnedAmount = earned;

        uint256 unearned = stream.totalAmount - earned;
        uint256 keeperBounty = (unearned * KEEPER_FEE_BPS) / 10_000;
        if (keeperBounty > MAX_KEEPER_BOUNTY) {
            keeperBounty = MAX_KEEPER_BOUNTY;
        }
        uint256 refundToFunder = unearned - keeperBounty;

        stream.status = StreamStatus.Closed;

        if (earned > 0) {
            pendingPayouts[stream.agent] += earned;
        }
        if (keeperBounty > 0) {
            pendingPayouts[msg.sender] += keeperBounty;
        }
        if (refundToFunder > 0) {
            pendingPayouts[stream.funder] += refundToFunder;
        }

        scoreContract.recordHardReclaim(stream.agent);

        emit StreamReclaimed(streamId, msg.sender, earned, keeperBounty, refundToFunder);
    }

    /// @notice Settle a completed stream through pull-payments.
    /// @param streamId Stream ID.
    function settleStream(uint256 streamId) external nonReentrant {
        Stream storage stream = streams[streamId];
        _ensureActive(stream);

        if (msg.sender != stream.funder && msg.sender != stream.agent) revert NotParticipant();

        uint256 elapsed = (block.timestamp > stream.startTime)
            ? block.timestamp - stream.startTime
            : 0;

        uint256 totalPaused = stream.pausedDuration;
        if (stream.pausedAt != 0) {
            totalPaused += block.timestamp - stream.pausedAt;
        }

        uint256 activeElapsed = (totalPaused >= elapsed) ? 0 : elapsed - totalPaused;
        if (activeElapsed > stream.durationSecs) {
            activeElapsed = stream.durationSecs;
        }

        if (activeElapsed < stream.durationSecs) {
            ModeConfig memory cfg = _modeConfigs[stream.mode];
            uint256 effectiveElapsed = _effectiveElapsedSinceLastHeartbeat(streamId, stream);
            uint256 deadline = cfg.heartbeatInterval + cfg.gracePeriod;
            if (effectiveElapsed > deadline) revert HeartbeatDeadlineMissed();
            revert StreamNotComplete();
        }

        uint256 earned = _computeEarned(stream);
        uint256 refundToFunder = stream.totalAmount - earned;

        stream.earnedAmount = earned;
        stream.status = StreamStatus.Closed;

        if (earned > 0) {
            pendingPayouts[stream.agent] += earned;
        }
        if (refundToFunder > 0) {
            pendingPayouts[stream.funder] += refundToFunder;
        }

        emit StreamSettled(streamId, stream.agent, earned, refundToFunder);
    }

    /// @notice Claim accumulated payout credits.
    function claimPayout() external nonReentrant {
        uint256 amount = pendingPayouts[msg.sender];
        if (amount == 0) revert NoPayout();

        pendingPayouts[msg.sender] = 0;
        IERC20(USDC).safeTransfer(msg.sender, amount);

        emit PayoutClaimed(msg.sender, amount);
    }

    /// @notice Get a stream by ID.
    /// @param streamId Stream ID.
    /// @return stream Stream data.
    function getStream(uint256 streamId) external view returns (Stream memory stream) {
        return streams[streamId];
    }

    /// @notice Get all stream IDs for an agent.
    /// @param agent Agent address.
    /// @return ids Stream IDs.
    function getAgentStreams(address agent) external view returns (uint256[] memory ids) {
        return agentStreams[agent];
    }

    /// @notice Get all stream IDs for a funder.
    /// @param funder Funder address.
    /// @return ids Stream IDs.
    function getFunderStreams(address funder) external view returns (uint256[] memory ids) {
        return funderStreams[funder];
    }

    /// @notice Get mode configuration.
    /// @param mode Mode id (1, 2, or 3).
    /// @return config Mode configuration struct.
    function getModeConfig(uint8 mode) external view returns (ModeConfig memory config) {
        config = _modeConfigs[mode];
    }

    /// @notice Compute currently earned amount for a stream.
    /// @param streamId Stream ID.
    /// @return earned Current earned USDC amount.
    function computeEarned(uint256 streamId) external view returns (uint256 earned) {
        Stream storage stream = streams[streamId];
        return _computeEarned(stream);
    }

    function _ensureActive(Stream storage stream) internal view {
        if (stream.status == StreamStatus.Closed) revert StreamAlreadyReclaimed();
        if (stream.status != StreamStatus.Active) revert StreamNotActive();
    }

    function _effectiveElapsedSinceLastHeartbeat(
        uint256 streamId,
        Stream storage stream
    ) internal view returns (uint256 elapsed) {
        elapsed = block.timestamp - stream.lastHeartbeat;

        uint256 pausedSinceLast = stream.pausedDuration - _pausedDurationAtLastHeartbeat[streamId];
        if (stream.pausedAt != 0) {
            pausedSinceLast += block.timestamp - stream.pausedAt;
        }

        if (pausedSinceLast >= elapsed) {
            return 0;
        }

        return elapsed - pausedSinceLast;
    }

    function _computeEarned(Stream storage stream) internal view returns (uint256 earned) {
        if (stream.status != StreamStatus.Active) {
            return 0;
        }

        if (stream.startTime == 0 || block.timestamp <= stream.startTime) {
            return 0;
        }

        uint256 elapsed = block.timestamp - stream.startTime;
        uint256 totalPaused = stream.pausedDuration;
        if (stream.pausedAt != 0) {
            totalPaused += block.timestamp - stream.pausedAt;
        }

        uint256 activeElapsed;
        if (totalPaused >= elapsed) {
            activeElapsed = 0;
        } else {
            activeElapsed = elapsed - totalPaused;
        }

        if (activeElapsed > stream.durationSecs) {
            activeElapsed = stream.durationSecs;
        }

        earned = (stream.ratePerSecX18 * activeElapsed) / 1e18;
        if (earned > stream.totalAmount) {
            earned = stream.totalAmount;
        }
    }
}
