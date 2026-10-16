/**
 * export-contracts.ts
 *
 * Reads the Foundry broadcast JSON produced by DeployPulseRank.s.sol and
 * writes a typed contracts.json into src/ for frontend consumption.
 *
 * Usage (after a successful `forge script ... --broadcast`):
 *   bun run scripts/export-contracts.ts
 *
 * The broadcast JSON lives at:
 *   contracts/broadcast/DeployPulseRank.s.sol/5042/run-latest.json
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
const CHAIN_ID = 5042;

const BROADCAST_PATH = resolve(
  ROOT,
  `contracts/broadcast/DeployPulseRank.s.sol/${CHAIN_ID}/run-latest.json`
);

const OUTPUT_PATH = resolve(ROOT, "src/contracts.json");

// ── Foundry broadcast JSON shape (minimal) ───────────────────────────────────

interface Transaction {
  transactionType: string;
  contractName: string | null;
  contractAddress: string;
  function: string | null;
}

interface BroadcastJson {
  transactions: Transaction[];
  timestamp: number;
  chain: number;
}

// ── Artifact paths ────────────────────────────────────────────────────────────

const ARTIFACTS: Record<string, string> = {
  PulseRegistry: resolve(
    ROOT,
    "contracts/out/PulseRegistry.sol/PulseRegistry.json"
  ),
  PulseScore: resolve(ROOT, "contracts/out/PulseScore.sol/PulseScore.json"),
  PulseStream: resolve(ROOT, "contracts/out/PulseStream.sol/PulseStream.json"),
};

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(BROADCAST_PATH)) {
    console.error(
      `Broadcast file not found: ${BROADCAST_PATH}\n` +
        `Run the forge deploy script first:\n` +
        `  forge script contracts/script/DeployPulseRank.s.sol \\n` +
        `    --rpc-url https://rpc.mainnet.arc.io \\n` +
        `    --broadcast --private-key $DEPLOYER_PRIVATE_KEY --chain-id 5042`
    );
    process.exit(1);
  }

  const broadcast = JSON.parse(
    readFileSync(BROADCAST_PATH, "utf-8")
  ) as BroadcastJson;

  // Extract CREATE transactions (transactionType = "CREATE")
  const creates = broadcast.transactions.filter(
    (tx) => tx.transactionType === "CREATE" && tx.contractName !== null
  );

  const addresses: Record<string, string> = {};
  for (const tx of creates) {
    if (tx.contractName) {
      addresses[tx.contractName] = tx.contractAddress;
    }
  }

  const required = ["PulseRegistry", "PulseScore", "PulseStream"];
  for (const name of required) {
    if (!addresses[name]) {
      console.error(
        `Missing deployed address for ${name}. ` +
          `Check the broadcast JSON at:\n  ${BROADCAST_PATH}`
      );
      process.exit(1);
    }
  }

  interface FoundryArtifact {
    abi: unknown[];
  }

  // Load ABIs from Foundry artifacts
  const abis: Record<string, unknown[]> = {};
  for (const name of required) {
    const artifactPath = ARTIFACTS[name];
    if (!existsSync(artifactPath)) {
      console.error(
        `Artifact not found: ${artifactPath}\n` +
          `Run \`forge build\` first to compile the contracts.`
      );
      process.exit(1);
    }
    const artifact = JSON.parse(readFileSync(artifactPath, "utf-8")) as FoundryArtifact;
    abis[name] = artifact.abi;
  }

  const contracts = {
    chainId: CHAIN_ID,
    network: "Arc Mainnet",
    usdc: "0x3600000000000000000000000000000000000000",
    deployedAt: new Date(broadcast.timestamp * 1000).toISOString(),
    PulseRegistry: {
      address: addresses["PulseRegistry"] as `0x${string}`,
      abi: abis["PulseRegistry"],
    },
    PulseScore: {
      address: addresses["PulseScore"] as `0x${string}`,
      abi: abis["PulseScore"],
    },
    PulseStream: {
      address: addresses["PulseStream"] as `0x${string}`,
      abi: abis["PulseStream"],
    },
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(contracts, null, 2));

  console.log(`\n✓ contracts.json written to src/contracts.json`);
  console.log(`  Chain     : ${CHAIN_ID} (${contracts.network})`);
  console.log(`  Registry  : ${contracts.PulseRegistry.address}`);
  console.log(`  Score     : ${contracts.PulseScore.address}`);
  console.log(`  Stream    : ${contracts.PulseStream.address}`);
  console.log(`  USDC      : ${contracts.usdc}`);
  console.log(`  Deployed  : ${contracts.deployedAt}`);
}

main();
