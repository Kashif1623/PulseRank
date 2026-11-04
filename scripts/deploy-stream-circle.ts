#!/usr/bin/env bun
/**
 * scripts/deploy-stream-circle.ts
 *
 * Deploys ONLY the upgraded PulseStreamV2 to Arc Mainnet, signed by your existing Circle
 * developer-controlled wallet (the one that owns Score and Task). No raw private key.
 * It uses Circle's public Smart Contract Platform SDK, so it runs on your own machine.
 *
 * RUN IT YOURSELF, OUTSIDE ARC STUDIO. Arc Studio does not send mainnet transactions.
 *
 *   forge build
 *   bun run scripts/deploy-stream-circle.ts             # dry run: prints the plan, sends nothing
 *   bun run scripts/deploy-stream-circle.ts --confirm   # asks you to type DEPLOY, then deploys
 *
 * Credentials: CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET from the environment or ./.env.
 * Optional: CIRCLE_WALLET_ID (defaults to the deployer wallet recorded for this project).
 *
 * Your Circle account must be enabled for mainnet (Circle Console) for the API to accept ARC.
 */

import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { createInterface } from "readline/promises";
import { fileURLToPath } from "url";
import { createPublicClient, http, keccak256, parseAbi, isAddress } from "viem";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import {
  initiateSmartContractPlatformClient,
  type Blockchain as ScpBlockchain,
} from "@circle-fin/smart-contract-platform";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC_URL = "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const BLOCKCHAIN = "ARC" as ScpBlockchain;
const DEFAULT_WALLET_ID = "95db8cf1-cfed-5301-92ab-f562aa2d284b";

const POLL_MS = 2_000;
const MAX_POLLS = 120;

// ── helpers ──────────────────────────────────────────────────────────────────

function readDotEnv(): Record<string, string> {
  const path = resolve(ROOT, ".env");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const dotEnv = readDotEnv();
function need(key: string): string {
  const v = process.env[key] ?? dotEnv[key];
  if (!v) throw new Error(`Missing ${key}. Set it in your environment or in ./.env.`);
  return v;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── load project facts ───────────────────────────────────────────────────────

const contracts = (JSON.parse(readFileSync(resolve(ROOT, "src/contracts.json"), "utf8")) as {
  usdc: string;
  deployer: string;
  contracts: Record<string, { address: string }>;
}) ;

const USDC     = contracts.usdc;
const REGISTRY = contracts.contracts.PulseRegistryV2.address;
const SCORE    = contracts.contracts.PulseScoreV2.address;
const TASK     = contracts.contracts.PulseTaskV2.address;
const DEPLOYER = contracts.deployer;

for (const [label, a] of Object.entries({ USDC, REGISTRY, SCORE, TASK, DEPLOYER })) {
  if (!isAddress(a)) throw new Error(`${label} in src/contracts.json is not a valid address: ${a}`);
}

const artifactPath = resolve(ROOT, "contracts/out/PulseStreamV2.sol/PulseStreamV2.json");
if (!existsSync(artifactPath)) throw new Error("Missing artifact. Run `forge build` first.");
const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
  abi: unknown[];
  bytecode: { object: string };
};
const bytecode = artifact.bytecode.object.startsWith("0x") ? artifact.bytecode.object : `0x${artifact.bytecode.object}`;
if (bytecode.length < 1000) throw new Error("Artifact bytecode looks empty. Run `forge build`.");
if (!JSON.stringify(artifact.abi).includes("RenounceDisabled")) {
  throw new Error("Artifact is not the upgraded PulseStreamV2 (no RenounceDisabled). Run `forge build` on the latest main.");
}

const walletId = process.env.CIRCLE_WALLET_ID ?? dotEnv.CIRCLE_WALLET_ID ?? DEFAULT_WALLET_ID;
const confirm  = process.argv.includes("--confirm");

const publicClient = createPublicClient({ transport: http(RPC_URL) });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const streamRead = parseAbi([
  "function owner() view returns (address)",
  "function scoreContract() view returns (address)",
  "function taskContract() view returns (address)",
  "function registry() view returns (address)",
  "function USDC() view returns (address)",
]);

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const chainId = await publicClient.getChainId();
  if (chainId !== CHAIN_ID) throw new Error(`RPC reports chain ${chainId}, expected ${CHAIN_ID}.`);

  const walletsClient = initiateDeveloperControlledWalletsClient({
    apiKey: need("CIRCLE_API_KEY"),
    entitySecret: need("CIRCLE_ENTITY_SECRET"),
  });
  const wallet = (await walletsClient.getWallet({ id: walletId })).data?.wallet;
  if (!wallet) throw new Error(`Circle wallet ${walletId} not found for these credentials.`);
  if (wallet.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    throw new Error(`Wallet ${walletId} is ${wallet.address}, but this project's deployer is ${DEPLOYER}. Aborting.`);
  }

  const balance = await publicClient.readContract({
    address: USDC as `0x${string}`, abi: erc20, functionName: "balanceOf", args: [wallet.address as `0x${string}`],
  });

  const constructorArgs = [USDC, REGISTRY, SCORE, TASK, wallet.address];

  console.log("\nPulseStreamV2 deployment plan (Arc Mainnet, chain 5042)");
  console.log("─────────────────────────────────────────────────────────");
  console.log(`  signer wallet   : ${wallet.address}  (Circle wallet ${walletId})`);
  console.log(`  wallet USDC     : ${(Number(balance) / 1e6).toFixed(6)}  (also its gas balance on Arc)`);
  console.log(`  USDC            : ${USDC}`);
  console.log(`  registry        : ${REGISTRY}`);
  console.log(`  score           : ${SCORE}`);
  console.log(`  task            : ${TASK}`);
  console.log(`  initialOwner    : ${wallet.address}`);
  console.log(`  bytecode keccak : ${keccak256(bytecode as `0x${string}`)}`);
  console.log("  Only PulseStreamV2 is deployed. Registry, Score and Task are not touched.\n");

  if (balance === 0n) throw new Error("The wallet has no USDC for gas.");
  if (!confirm) {
    console.log("Dry run only: nothing was sent. Re-run with --confirm to deploy.");
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Mainnet transactions are irreversible. Type DEPLOY to continue: ");
  rl.close();
  if (answer.trim() !== "DEPLOY") {
    console.log("Cancelled. Nothing was sent.");
    return;
  }

  const scp = initiateSmartContractPlatformClient({
    apiKey: need("CIRCLE_API_KEY"),
    entitySecret: need("CIRCLE_ENTITY_SECRET"),
  });

  const res = await scp.deployContract({
    name: "PulseStreamV2",
    blockchain: BLOCKCHAIN,
    walletId,
    abiJson: JSON.stringify(artifact.abi),
    bytecode,
    constructorParameters: constructorArgs,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const contractId = res.data?.contractId;
  if (!contractId) throw new Error("Circle did not return a contract id.");
  console.log(`\nSubmitted. Circle contract id: ${contractId}`);

  let address = "";
  let txHash = "";
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_MS);
    const c = (await scp.getContract({ id: contractId })).data?.contract;
    if (!c) throw new Error("Contract not found while polling.");
    process.stdout.write(`\r  status: ${c.status ?? "UNKNOWN"} (${i + 1}/${MAX_POLLS})   `);
    if (c.status === "FAILED") {
      throw new Error(`Deployment failed: ${c.deploymentErrorReason ?? "unknown"} ${c.deploymentErrorDetails ?? ""}`.trim());
    }
    if (c.status === "COMPLETE") {
      address = c.contractAddress ?? "";
      txHash = c.txHash ?? "";
      break;
    }
  }
  console.log("");
  if (!isAddress(address)) throw new Error("Timed out or no address returned. Check Circle Console before retrying.");

  // Confirm on-chain, never trust the API response alone.
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") throw new Error(`No contract code at ${address}.`);
  const readStream = (fn: "owner" | "scoreContract" | "taskContract" | "registry" | "USDC") =>
    publicClient.readContract({ address, abi: streamRead, functionName: fn });
  const [owner, score, task, registry, usdc] = await Promise.all([
    readStream("owner"), readStream("scoreContract"), readStream("taskContract"), readStream("registry"), readStream("USDC"),
  ]);
  const checks: [string, string, string][] = [
    ["owner", owner, wallet.address], ["scoreContract", score, SCORE], ["taskContract", task, TASK],
    ["registry", registry, REGISTRY], ["USDC", usdc, USDC],
  ];
  let ok = true;
  for (const [label, got, want] of checks) {
    const pass = got.toLowerCase() === want.toLowerCase();
    ok &&= pass;
    console.log(`${pass ? "PASS" : "FAIL"}  ${label}: ${got}`);
  }
  if (!ok) throw new Error("On-chain wiring does not match. Do NOT relink. Investigate first.");

  let block = "";
  if (txHash) {
    for (let i = 0; i < 10 && !block; i++) {
      try {
        const rcpt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
        block = rcpt.blockNumber.toString();
      } catch { await sleep(1500); }
    }
  }

  console.log(`
✅  PulseStreamV2 deployed and verified on-chain.
    address : ${address}
    tx      : ${txHash || "(see Circle Console)"}
    block   : ${block || "(look up the tx on the explorer)"}

NEXT (in this order):
  1. bun run scripts/link-stream.ts --stream ${address}
  2. bun run scripts/verify-stream-links.ts --stream ${address}      # every line must PASS
  3. Send these three values (address, tx, block) back, or run:
     bun run deploy:patch --stream ${address} --stream-tx ${txHash || "<tx>"} --stream-block ${block || "<block>"} --deployer ${wallet.address} --version v2.3 --notes "Active-only settle guard, self-stream auto-activation, two-step ownership"
`);
}

main().catch((e: unknown) => {
  console.error("\n❌ ", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
