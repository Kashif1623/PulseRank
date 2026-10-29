// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PulseRegistryV2
/// @notice Agent registration registry for PulseRank v2.
///         A single wallet may register multiple distinct agent profiles,
///         each identified by an auto-incrementing agentId.
contract PulseRegistryV2 is ReentrancyGuard {
    /// @notice Agent profile metadata and commercial floor.
    struct AgentProfile {
        bytes32 name;
        string  profileURI;
        uint256 minDailyRate;
        uint256 registeredAt;
        bool    active;
        address owner;      // wallet that created this profile
    }

    // ── Storage ──────────────────────────────────────────────────────────────

    /// @notice Total agents ever registered (also the next agentId to assign).
    uint256 public agentCount;

    /// @notice agentId → profile.
    mapping(uint256 => AgentProfile) public agents;

    /// @notice Globally unique name → agentId (0 means unregistered).
    mapping(bytes32 => uint256) public nameToAgentId;

    /// @notice agentId → true once minted.
    mapping(uint256 => bool) public isRegistered;

    /// @notice wallet → list of agentIds owned by that wallet.
    mapping(address => uint256[]) private _ownerAgents;

    /// @notice Legacy per-address single-agent view: wallet → primary agentId
    ///         (set on first registration, unchanged on subsequent ones).
    mapping(address => uint256) public primaryAgentId;

    // ── Errors ────────────────────────────────────────────────────────────────

    error NameTaken(bytes32 name);
    error EmptyName();
    error InvalidProfileURI();
    error NotRegistered();
    error NotActive();
    error StillActive();
    error NotOwner();

    // ── Events ────────────────────────────────────────────────────────────────

    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        bytes32 indexed name,
        string  profileURI,
        uint256 minDailyRate
    );
    event ProfileUpdated(uint256 indexed agentId, string profileURI, uint256 minDailyRate);
    event AgentDeactivated(uint256 indexed agentId);
    event AgentReactivated(uint256 indexed agentId);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner(uint256 agentId) {
        if (!isRegistered[agentId]) revert NotRegistered();
        if (agents[agentId].owner != msg.sender) revert NotOwner();
        _;
    }

    modifier onlyActiveOwner(uint256 agentId) {
        if (!isRegistered[agentId]) revert NotRegistered();
        if (agents[agentId].owner != msg.sender) revert NotOwner();
        if (!agents[agentId].active) revert NotActive();
        _;
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /// @notice Register a new agent profile for the caller.
    ///         One wallet may call this multiple times with distinct names.
    /// @param name        Unique bytes32-encoded name.
    /// @param profileURI  Metadata URI.
    /// @param minDailyRate Minimum daily USDC rate in 6-decimal units.
    /// @return agentId The newly assigned agent id.
    function registerAgent(
        bytes32 name,
        string calldata profileURI,
        uint256 minDailyRate
    ) external nonReentrant returns (uint256 agentId) {
        if (name == bytes32(0)) revert EmptyName();
        if (nameToAgentId[name] != 0) revert NameTaken(name);
        if (bytes(profileURI).length == 0) revert InvalidProfileURI();

        agentCount++;
        agentId = agentCount;

        agents[agentId] = AgentProfile({
            name:         name,
            profileURI:   profileURI,
            minDailyRate: minDailyRate,
            registeredAt: block.timestamp,
            active:       true,
            owner:        msg.sender
        });
        isRegistered[agentId]    = true;
        nameToAgentId[name]      = agentId;
        _ownerAgents[msg.sender].push(agentId);

        // Set primary on first registration.
        if (primaryAgentId[msg.sender] == 0) {
            primaryAgentId[msg.sender] = agentId;
        }

        emit AgentRegistered(agentId, msg.sender, name, profileURI, minDailyRate);
    }

    /// @notice Update profile metadata for an agent the caller owns.
    function updateProfile(
        uint256 agentId,
        string calldata profileURI,
        uint256 minDailyRate
    ) external nonReentrant onlyActiveOwner(agentId) {
        if (bytes(profileURI).length == 0) revert InvalidProfileURI();
        AgentProfile storage p = agents[agentId];
        p.profileURI   = profileURI;
        p.minDailyRate = minDailyRate;
        emit ProfileUpdated(agentId, profileURI, minDailyRate);
    }

    /// @notice Deactivate an agent profile the caller owns.
    function deactivate(uint256 agentId) external nonReentrant onlyActiveOwner(agentId) {
        agents[agentId].active = false;
        emit AgentDeactivated(agentId);
    }

    /// @notice Reactivate an agent profile the caller owns.
    function reactivate(uint256 agentId) external nonReentrant onlyOwner(agentId) {
        if (agents[agentId].active) revert StillActive();
        agents[agentId].active = true;
        emit AgentReactivated(agentId);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice Full profile for an agent by id.
    function getAgent(uint256 agentId) external view returns (AgentProfile memory) {
        return agents[agentId];
    }

    /// @notice All agent ids owned by a wallet.
    function getAgentsByOwner(address owner) external view returns (uint256[] memory) {
        return _ownerAgents[owner];
    }

    /// @notice Paginated list of ALL registered agent ids (1-based, sequential).
    function getAgents(uint256 offset, uint256 limit)
        external view returns (uint256[] memory list)
    {
        uint256 total = agentCount;
        if (offset >= total || limit == 0) return new uint256[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 len = end - offset;
        list = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            list[i] = offset + i + 1; // agentIds are 1-based
        }
    }

    /// @notice True when the agent id is registered and currently active.
    function isActiveAgent(uint256 agentId) external view returns (bool) {
        return isRegistered[agentId] && agents[agentId].active;
    }

    /// @notice True when the address owns at least one registered agent.
    function hasRegistered(address owner) external view returns (bool) {
        return _ownerAgents[owner].length > 0;
    }
}
