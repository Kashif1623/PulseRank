// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PulseRegistry
/// @notice Registry for PulseRank agents.
contract PulseRegistry is ReentrancyGuard {
    struct Agent {
        bytes32 name;
        string profileURI;
        uint256 minDailyRate;
        bool registered;
    }

    mapping(address => Agent) public agents;
    mapping(bytes32 => bool) public nameRegistered;
    address[] public registeredAgentsList;

    error AlreadyRegistered();
    error NameTaken(bytes32 name);
    error EmptyName();
    error EmptyProfileURI();
    error NotRegistered();

    event AgentRegistered(address indexed agent, bytes32 indexed name, string profileURI, uint256 minDailyRate);
    event ProfileURIUpdated(address indexed agent, string newURI);
    event MinDailyRateUpdated(address indexed agent, uint256 newRate);

    modifier onlyRegisteredAgent() {
        if (!agents[msg.sender].registered) revert NotRegistered();
        _;
    }

    /// @notice Register caller as an agent.
    /// @param name Unique bytes32 agent name.
    /// @param profileURI Metadata/profile URI.
    /// @param minDailyRate Minimum daily rate requested by the agent.
    function registerAgent(bytes32 name, string calldata profileURI, uint256 minDailyRate) external nonReentrant {
        if (agents[msg.sender].registered) revert AlreadyRegistered();
        if (name == bytes32(0)) revert EmptyName();
        if (nameRegistered[name]) revert NameTaken(name);
        if (bytes(profileURI).length == 0) revert EmptyProfileURI();

        agents[msg.sender] = Agent({name: name, profileURI: profileURI, minDailyRate: minDailyRate, registered: true});
        nameRegistered[name] = true;
        registeredAgentsList.push(msg.sender);

        emit AgentRegistered(msg.sender, name, profileURI, minDailyRate);
    }

    /// @notice Update caller profile URI.
    /// @param newURI New profile URI.
    function updateProfileURI(string calldata newURI) external onlyRegisteredAgent {
        if (bytes(newURI).length == 0) revert EmptyProfileURI();
        agents[msg.sender].profileURI = newURI;
        emit ProfileURIUpdated(msg.sender, newURI);
    }

    /// @notice Update caller minimum daily rate.
    /// @param newRate New minimum daily rate.
    function updateMinDailyRate(uint256 newRate) external onlyRegisteredAgent {
        agents[msg.sender].minDailyRate = newRate;
        emit MinDailyRateUpdated(msg.sender, newRate);
    }

    /// @notice Get a full agent record.
    /// @param agent Agent wallet address.
    /// @return agentData Full agent struct.
    function getAgent(address agent) external view returns (Agent memory agentData) {
        return agents[agent];
    }

    /// @notice Get count of registered agents.
    /// @return count Number of registered agents.
    function getRegisteredCount() external view returns (uint256 count) {
        return registeredAgentsList.length;
    }

    /// @notice Get a paginated slice of registered agent addresses.
    /// @param offset Start index.
    /// @param limit Maximum number of addresses to return.
    /// @return slice Paginated address slice.
    function getRegisteredAgents(uint256 offset, uint256 limit) external view returns (address[] memory slice) {
        uint256 total = registeredAgentsList.length;
        if (offset >= total || limit == 0) {
            return new address[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 length = end - offset;
        slice = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            slice[i] = registeredAgentsList[offset + i];
        }
    }
}
