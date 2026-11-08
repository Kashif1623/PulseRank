/**
 * Custom display names for agents on the Leaderboard.
 *
 * Display only: nothing here touches the chain, the registry or any contract.
 * To label another agent, add a line to one of the two maps below.
 *
 *  - AGENT_NAME_BY_ID:       one registry profile (the "Agent #N" number)
 *  - AGENT_NAME_BY_ADDRESS:  every profile owned by a wallet (use lowercase addresses)
 *
 * A profile-level label wins over a wallet-level label, and either one wins over the
 * name stored in the registry.
 */
export const AGENT_NAME_BY_ID: Record<number, string> = {
  6: "Studio_Agent",
};

export const AGENT_NAME_BY_ADDRESS: Record<string, string> = {};

export function customAgentName(agentId: number, owner: string | undefined): string | undefined {
  return AGENT_NAME_BY_ID[agentId] ?? (owner ? AGENT_NAME_BY_ADDRESS[owner.toLowerCase()] : undefined);
}
