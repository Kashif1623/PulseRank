// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPulseStreamV2, IPulseTaskV2, VerificationMethod} from "./IPulseV2Interfaces.sol";

contract PulseTaskV2 is Ownable, EIP712, ReentrancyGuard, IPulseTaskV2 {
    enum MilestoneStatus {
        Pending,
        SubmittedByAgent,
        ApprovedByFunder,
        RejectedByFunder,
        AutoApproved
    }

    struct Milestone {
        string description;
        uint256 paymentBps;
        uint256 submitDeadline;
        bytes32 proofHash;
        address attester;
        bool attesterApproved;
        MilestoneStatus status;
    }

    struct Task {
        address funder;
        address agent;
        uint256 streamId;
        Milestone[] milestones;
        VerificationMethod verification;
        bool active;
        uint256 createdAt;
    }

    struct MilestoneInput {
        string description;
        uint256 paymentBps;
        uint256 submitDeadline;
        address attester;
    }

    mapping(uint256 => Task) public tasks;
    uint256 public nextTaskId;
    mapping(uint256 => uint256) public streamToTask;

    address public pulseStream;
    bool public streamSet;

    bytes32 public constant MILESTONE_APPROVE_TYPEHASH =
        keccak256("MilestoneApproval(uint256 taskId,uint256 milestoneIdx,uint256 nonce,uint256 deadline)");
    mapping(address => uint256) public attesterNonces;

    error InvalidBpsSum();
    error EmptyDescription();
    error WrongStatus();
    error EmptyProof();
    error AttesterApprovalRequired();
    error NotFunder();
    error NotAgent();
    error NotAuthorized();
    error ZeroAddress();
    error InvalidMilestoneCount();
    error MilestoneIndexOutOfRange();
    error AlreadySet();
    error SignatureExpired();
    error NoAttesterConfigured();
    error InvalidSignature();

    event PulseStreamSet(address indexed pulseStream);
    event TaskCreated(uint256 indexed taskId, address indexed funder, address indexed agent, uint256 streamId);
    event ProofSubmitted(uint256 indexed taskId, uint256 milestoneIdx, bytes32 proofHash);
    event MilestoneApproved(uint256 indexed taskId, uint256 milestoneIdx);
    event MilestoneRejected(uint256 indexed taskId, uint256 milestoneIdx, string reason);
    event MilestoneAutoApproved(uint256 indexed taskId, uint256 milestoneIdx);

    constructor(address initialOwner) Ownable(initialOwner) EIP712("PulseTaskV2", "1") {
        if (initialOwner == address(0)) revert ZeroAddress();
        nextTaskId = 1;
    }

    function setPulseStream(address s) external onlyOwner nonReentrant {
        if (streamSet) revert AlreadySet();
        if (s == address(0)) revert ZeroAddress();
        pulseStream = s;
        streamSet = true;
        emit PulseStreamSet(s);
    }

    function createTask(
        address agent,
        uint256 streamId,
        VerificationMethod method,
        MilestoneInput[] calldata milestones_
    ) external nonReentrant returns (uint256 taskId) {
        if (agent == address(0)) revert ZeroAddress();
        uint256 count = milestones_.length;
        if (count == 0 || count > 20) revert InvalidMilestoneCount();

        uint256 bpsSum = 0;
        for (uint256 i = 0; i < count; i++) {
            if (bytes(milestones_[i].description).length == 0) revert EmptyDescription();
            bpsSum += milestones_[i].paymentBps;
        }
        if (bpsSum != 10_000) revert InvalidBpsSum();

        taskId = nextTaskId++;
        Task storage t = tasks[taskId];
        t.funder = msg.sender;
        t.agent = agent;
        t.streamId = streamId;
        t.verification = method;
        t.active = true;
        t.createdAt = block.timestamp;

        for (uint256 i = 0; i < count; i++) {
            t.milestones.push(Milestone({
                description: milestones_[i].description,
                paymentBps: milestones_[i].paymentBps,
                submitDeadline: milestones_[i].submitDeadline,
                proofHash: bytes32(0),
                attester: milestones_[i].attester,
                attesterApproved: false,
                status: MilestoneStatus.Pending
            }));
        }

        if (streamId > 0) {
            (address streamFunder,) = IPulseStreamV2(pulseStream).getStreamParties(streamId);
            if (msg.sender != streamFunder) revert NotFunder();
            streamToTask[streamId] = taskId;
        }
        emit TaskCreated(taskId, msg.sender, agent, streamId);
    }

    function submitMilestoneProof(uint256 taskId, uint256 milestoneIdx, bytes32 proofHash) external nonReentrant {
        Task storage t = tasks[taskId];
        if (msg.sender != t.agent) revert NotAgent();
        Milestone storage milestone = _milestone(t, milestoneIdx);
        if (milestone.status != MilestoneStatus.Pending) revert WrongStatus();
        milestone.proofHash = proofHash;
        milestone.status = MilestoneStatus.SubmittedByAgent;
        emit ProofSubmitted(taskId, milestoneIdx, proofHash);
    }

    function approveMilestone(uint256 taskId, uint256 milestoneIdx) external nonReentrant {
        Task storage t = tasks[taskId];
        Milestone storage milestone = _milestone(t, milestoneIdx);
        if (msg.sender != t.funder && msg.sender != milestone.attester) revert NotAuthorized();
        if (milestone.status != MilestoneStatus.SubmittedByAgent) revert WrongStatus();
        milestone.status = MilestoneStatus.ApprovedByFunder;
        emit MilestoneApproved(taskId, milestoneIdx);
    }

    function getTask(uint256 taskId) external view returns (
        address funder, address agent, uint256 streamId, VerificationMethod verificationMethod,
        bool active, uint256 createdAt, uint256 milestoneCount
    ) {
        Task storage t = tasks[taskId];
        return (t.funder, t.agent, t.streamId, t.verification, t.active, t.createdAt, t.milestones.length);
    }

    function approvedBps(uint256 taskId) external view returns (uint256 bps) {
        Task storage t = tasks[taskId];
        for (uint256 i = 0; i < t.milestones.length; i++) {
            if (t.milestones[i].status == MilestoneStatus.ApprovedByFunder ||
                t.milestones[i].status == MilestoneStatus.AutoApproved) {
                bps += t.milestones[i].paymentBps;
            }
        }
    }

    function _milestone(Task storage t, uint256 milestoneIdx) internal view returns (Milestone storage) {
        if (milestoneIdx >= t.milestones.length) revert MilestoneIndexOutOfRange();
        return t.milestones[milestoneIdx];
    }
}
