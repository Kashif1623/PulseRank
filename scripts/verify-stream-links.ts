#!/usr/bin/env bun
/**
 * Read-only check that a PulseStreamV2 deployment is wired correctly on Arc Mainnet.
 * Needs no keys and sends no transactions.
 *
 *   bun run scripts/verify-stream-links.ts                 # checks src/contracts.json
 *   bun run scripts/verify-stream-links.ts --stream 0x...  # checks a freshly deployed stream
 *
 * Exit code 0 = every check passed, 1 = at least one check failed.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http, parseAbi, getAddress, defineChain } from "viem";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(resolve(ROOT, "src/contracts.json"), "utf8")) as {
  usdc: string;
  contracts: Record<string, { address: string }>;
};

const idx = process.argv.indexOf("--stream");
const streamAddr = getAddress(idx !== -1 ? process.argv[idx + 1] : cfg.contracts.PulseStreamV2.address);
const score = getAddress(cfg.contracts.PulseScoreV2.address);
const task = getAddress(cfg.contracts.PulseTaskV2.address);
const registry = getAddress(cfg.contracts.PulseRegistryV2.address);
const usdc = getAddress(cfg.usdc);

const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
});
const client = createPublicClient({ chain: arc, transport: http() });

const streamAbi = parseAbi([
  "function USDC() view returns (address)",
  "function registry() view returns (address)",
  "function scoreContract() view returns (address)",
  "function taskContract() view returns (address)",
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function nextStreamId() view returns (uint256)",
]);
const linkAbi = parseAbi(["function pulseStream() view returns (address)"]);

let failed = 0;
function check(label: string, actual: string, expected?: string) {
  const ok = expected === undefined || actual.toLowerCase() === expected.toLowerCase();
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok || !expected ? "" : `  (expected ${expected})`}`);
}

const chainId = await client.getChainId();
check("chain id", String(chainId), "5042");

const code = await client.getCode({ address: streamAddr });
check("stream has code", code && code !== "0x" ? "yes" : "no", "yes");

const read = <F extends "USDC" | "registry" | "scoreContract" | "taskContract" | "owner" | "pendingOwner">(fn: F) =>
  client.readContract({ address: streamAddr, abi: streamAbi, functionName: fn });

check("stream.USDC", await read("USDC"), usdc);
check("stream.registry", await read("registry"), registry);
check("stream.scoreContract", await read("scoreContract"), score);
check("stream.taskContract", await read("taskContract"), task);
check("stream.owner", await read("owner"));
// pendingOwner() only exists on the upgraded (two-step ownership) contract.
try {
  check("stream.pendingOwner (upgraded contract)", await read("pendingOwner"));
} catch {
  check("stream is the upgraded contract (pendingOwner() missing)", "no", "yes");
}
check("stream.nextStreamId", String(await client.readContract({ address: streamAddr, abi: streamAbi, functionName: "nextStreamId" })));

check("score.pulseStream", await client.readContract({ address: score, abi: linkAbi, functionName: "pulseStream" }), streamAddr);
check("task.pulseStream", await client.readContract({ address: task, abi: linkAbi, functionName: "pulseStream" }), streamAddr);

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
