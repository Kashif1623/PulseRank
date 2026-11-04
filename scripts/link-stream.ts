#!/usr/bin/env bun
/**
 * Calls setPulseStream on PulseScoreV2 and PulseTaskV2
 * using the Circle DCW SDK (same pattern as compass-deploy.ts).
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, parseAbi, getAddress, defineChain } from "viem";
import { parseStreamArg } from "./stream-arg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env  = readFileSync(resolve(ROOT, ".env"), "utf8");

function envVar(key: string): string {
  const m = env.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) throw new Error(`Missing env var: ${key}`);
  return m[1].trim();
}

const API_KEY       = envVar("CIRCLE_API_KEY");
const ENTITY_SECRET = envVar("CIRCLE_ENTITY_SECRET");
const WALLET_ID     = "95db8cf1-cfed-5301-92ab-f562aa2d284b";

// Addresses come from src/contracts.json (run `bun run deploy:patch` first), or pass
// --stream 0x... to link a specific PulseStreamV2.
const contracts = (JSON.parse(readFileSync(resolve(ROOT, "src/contracts.json"), "utf8")) as {
  contracts: Record<string, { address: string }>;
}).contracts;
const NEW_STREAM  = parseStreamArg(process.argv, contracts.PulseStreamV2.address);
const SCORE_ADDR  = contracts.PulseScoreV2.address;
const TASK_ADDR   = contracts.PulseTaskV2.address;

// Preflight (read-only): never point Score and Task at an address that is not the upgraded
// stream wired to them. A typo here would break stream activation until it is corrected.
const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
});
const reader = createPublicClient({ chain: arc, transport: http() });
const streamAbi = parseAbi([
  "function scoreContract() view returns (address)",
  "function taskContract() view returns (address)",
  "function pendingOwner() view returns (address)",
]);
const code = await reader.getCode({ address: NEW_STREAM });
if (!code || code === "0x") throw new Error(`No contract code at ${NEW_STREAM}. Refusing to link.`);
const [onScore, onTask] = await Promise.all([
  reader.readContract({ address: NEW_STREAM, abi: streamAbi, functionName: "scoreContract" }),
  reader.readContract({ address: NEW_STREAM, abi: streamAbi, functionName: "taskContract" }),
]);
if (onScore !== getAddress(SCORE_ADDR) || onTask !== getAddress(TASK_ADDR)) {
  throw new Error(`${NEW_STREAM} is not wired to the current Score/Task contracts. Refusing to link.`);
}
try {
  await reader.readContract({ address: NEW_STREAM, abi: streamAbi, functionName: "pendingOwner" });
} catch {
  throw new Error(`${NEW_STREAM} is not the upgraded PulseStreamV2 (no pendingOwner). Refusing to link.`);
}
console.log(`Preflight OK: ${NEW_STREAM} is the upgraded stream wired to the current Score and Task.`);

// keccak256("setPulseStream(address)")[0..4] = 0xd2eee8e4
function encodeCalldata(streamAddress: string): string {
  const selector = "d2eee8e4";
  const paddedAddr = streamAddress.replace("0x", "").padStart(64, "0").toLowerCase();
  return "0x" + selector + paddedAddr;
}

const client = initiateDeveloperControlledWalletsClient({
  apiKey: API_KEY,
  entitySecret: ENTITY_SECRET,
});

async function pollTx(txId: string): Promise<void> {
  for (let i = 0; i < 90; i++) {
    await new Promise(res => setTimeout(res, 2000));
    const pr = await client.getTransaction({ id: txId });
    const tx = pr.data?.transaction;
    const state = tx?.state ?? "UNKNOWN";
    process.stdout.write(`\r  Poll ${i + 1}: ${state}    `);
    if (["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED"].includes(state)) {
      console.log("");
      if (state === "FAILED" || state === "CANCELLED") throw new Error(`TX ${state}: ${txId}`);
      return;
    }
  }
  throw new Error("Timed out");
}

async function sendTx(label: string, contractAddr: string): Promise<void> {
  console.log(`\nCalling setPulseStream on ${label} (${contractAddr})...`);
  const r = await client.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: contractAddr,
    callData: encodeCalldata(NEW_STREAM) as `0x${string}`,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    // entitySecretCiphertext only needed for raw REST; SDK handles it via entitySecret in init
  });
  // The SDK may internally use the ciphertext; pass it explicitly via the REST path if needed
  console.log("  SDK response:", JSON.stringify(r.data));
  const txId = r.data?.id;
  if (!txId) throw new Error("No txId returned: " + JSON.stringify(r));
  console.log(`  TX: ${txId} — polling...`);
  await pollTx(txId);
  console.log(`  ✅  ${label}.setPulseStream confirmed.`);
}

try {
  await sendTx("PulseScoreV2", SCORE_ADDR);
  await sendTx("PulseTaskV2",  TASK_ADDR);
  console.log("\n✅  Both contracts linked to new PulseStreamV2:", NEW_STREAM);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("AlreadySet") || msg.includes("b37c4505")) {
    console.warn("  ⚠  AlreadySet — already linked.");
  } else {
    console.error("\n  ❌ ", msg);
    process.exit(1);
  }
}
