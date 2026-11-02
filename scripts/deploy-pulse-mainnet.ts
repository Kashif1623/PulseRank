#!/usr/bin/env bun
/**
 * scripts/deploy-pulse-mainnet.ts
 *
 * Post-deploy address patcher for PulseRank v2 on Arc Mainnet.
 *
 * USAGE (after a Compass live broadcast succeeds):
 *   bun run scripts/deploy-pulse-mainnet.ts \
 *     --registry  <0x...>   # omit if unchanged \
 *     --score     <0x...>   \
 *     --task      <0x...>   \
 *     --stream    <0x...>   \
 *     --deployer  <0x...>   # wallet that signed the deploy \
 *     --score-tx  <0x...>   # deploy tx hash \
 *     --task-tx   <0x...>   \
 *     --stream-tx <0x...>   \
 *     --version   v2.2       # semver label for this deploy \
 *     --notes    "Short description of what changed"
 *
 * All flags are optional — only the contracts you pass will be updated.
 * If --registry is omitted the existing registry address is preserved.
 *
 * The script patches:
 *   src/contracts.json      — address + txHash + version + linkedTo fields
 *   src/Docs.tsx            — replaces address literals in the CONTRACTS array
 *   README.md               — updates the deployed-addresses table
 *   AGENTS.md               — appends a new deploy record section
 *
 * No compilation, no RPC calls, no secrets needed — pure file patching.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Argument parsing ──────────────────────────────────────────────────────────

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function optionalHex(val: string | undefined): `0x${string}` | undefined {
  if (!val) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(val)) {
    throw new Error(`Invalid address: "${val}"`);
  }
  return val as `0x${string}`;
}

const newRegistry  = optionalHex(arg("--registry"));
const newScore     = optionalHex(arg("--score"));
const newTask      = optionalHex(arg("--task"));
const newStream    = optionalHex(arg("--stream"));
const deployer     = optionalHex(arg("--deployer"));

const scoreTx      = arg("--score-tx")   ?? "";
const taskTx       = arg("--task-tx")    ?? "";
const streamTx     = arg("--stream-tx")  ?? "";
const version      = arg("--version")    ?? "v2.x";
const notes        = arg("--notes")      ?? "Routine redeployment";

if (!newRegistry && !newScore && !newTask && !newStream) {
  console.error("❌  No contract addresses provided. Pass at least one of:");
  console.error("    --registry --score --task --stream");
  process.exit(1);
}

const ROOT         = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsPath = resolve(ROOT, "src/contracts.json");
const docsPath      = resolve(ROOT, "src/Docs.tsx");
const readmePath    = resolve(ROOT, "README.md");
const agentsPath    = resolve(ROOT, "AGENTS.md");

console.log("\n🚀  PulseRank post-deploy patcher");
console.log("────────────────────────────────");
console.log(`  version : ${version}`);
console.log(`  notes   : ${notes}`);
if (newRegistry) console.log(`  registry: ${newRegistry}`);
if (newScore)    console.log(`  score   : ${newScore}`);
if (newTask)     console.log(`  task    : ${newTask}`);
if (newStream)   console.log(`  stream  : ${newStream}`);
console.log();

// ── 1. src/contracts.json ─────────────────────────────────────────────────────

interface ContractEntry {
  address: string;
  txHash?: string;
  version?: string;
  note?: string;
  linkedTo?: string;
  linkedScore?: string;
  linkedTask?: string;
  linkedRegistry?: string;
}

interface ContractsJson {
  network: string;
  chainId: number;
  deployedAt: string;
  deployer: string;
  usdc: string;
  contracts: Record<string, ContractEntry>;
}

const cj: ContractsJson = JSON.parse(readFileSync(contractsPath, "utf8")) as ContractsJson;
const old = { ...cj.contracts };

cj.deployedAt = new Date().toISOString();
if (deployer) cj.deployer = deployer;

if (newRegistry) {
  cj.contracts.PulseRegistryV2 = {
    ...cj.contracts.PulseRegistryV2,
    address: newRegistry,
    version,
    note: notes,
  };
}

if (newScore) {
  const linkedTo = newStream ?? cj.contracts.PulseStreamV2?.address ?? "";
  cj.contracts.PulseScoreV2 = {
    ...cj.contracts.PulseScoreV2,
    address: newScore,
    txHash: scoreTx || cj.contracts.PulseScoreV2?.txHash,
    version,
    note: notes,
    linkedTo,
  };
}

if (newTask) {
  const linkedTo = newStream ?? cj.contracts.PulseStreamV2?.address ?? "";
  cj.contracts.PulseTaskV2 = {
    ...cj.contracts.PulseTaskV2,
    address: newTask,
    txHash: taskTx || cj.contracts.PulseTaskV2?.txHash,
    version,
    note: notes,
    linkedTo,
  };
}

if (newStream) {
  cj.contracts.PulseStreamV2 = {
    ...cj.contracts.PulseStreamV2,
    address: newStream,
    txHash: streamTx || cj.contracts.PulseStreamV2?.txHash,
    version,
    note: notes,
    linkedScore:    newScore    ?? cj.contracts.PulseScoreV2?.address    ?? "",
    linkedTask:     newTask     ?? cj.contracts.PulseTaskV2?.address     ?? "",
    linkedRegistry: newRegistry ?? cj.contracts.PulseRegistryV2?.address ?? "",
  };
}

writeFileSync(contractsPath, JSON.stringify(cj, null, 2) + "\n");
console.log("✅  src/contracts.json updated");

// ── 2. src/Docs.tsx ───────────────────────────────────────────────────────────
// Docs.tsx has a CONTRACTS array with address: "0x..." literals.
// Replace each old address with the new one.

let docs = readFileSync(docsPath, "utf8");
const replacements: [string, string][] = [
  [old.PulseRegistryV2.address, (newRegistry ?? old.PulseRegistryV2.address)],
  [old.PulseScoreV2.address,    (newScore    ?? old.PulseScoreV2.address)],
  [old.PulseTaskV2.address,     (newTask     ?? old.PulseTaskV2.address)],
  [old.PulseStreamV2.address,   (newStream   ?? old.PulseStreamV2.address)],
];

let docsChanged = false;
for (const [oldAddr, freshAddr] of replacements) {
  if (oldAddr !== freshAddr && docs.includes(oldAddr)) {
    docs = docs.split(oldAddr).join(freshAddr);
    docsChanged = true;
  }
}

if (docsChanged) {
  writeFileSync(docsPath, docs);
  console.log("✅  src/Docs.tsx updated");
} else {
  console.log("⏭   src/Docs.tsx — no address changes needed");
}

// ── 3. README.md ──────────────────────────────────────────────────────────────
// README has a markdown table with address values in backtick cells.

let readme = readFileSync(readmePath, "utf8");
let readmeChanged = false;

for (const [oldAddr, freshAddr] of replacements) {
  if (oldAddr !== freshAddr && readme.includes(oldAddr)) {
    readme = readme.split(oldAddr).join(freshAddr);
    readmeChanged = true;
  }
}

// Also update any "Deployed to Arc Mainnet on YYYY-MM-DD" date line.
const dateStr = new Date().toISOString().split("T")[0];
readme = readme.replace(
  /Deployed to Arc Mainnet on \d{4}-\d{2}-\d{2}/,
  `Deployed to Arc Mainnet on ${dateStr}`
);

writeFileSync(readmePath, readme);
if (readmeChanged) {
  console.log("✅  README.md updated");
} else {
  console.log("⏭   README.md — no address changes needed (date refreshed)");
}

// ── 4. AGENTS.md ──────────────────────────────────────────────────────────────
// Append a new deploy record block at the bottom.

const deployRecord = `
## Deployed Contracts — Arc Mainnet (Chain ID 5042) — ${version} (${dateStr})

${notes}

Deployer wallet: \`${deployer ?? cj.deployer}\`

| Contract | Address | Version |
|---|---|---|
| PulseRegistryV2 | \`${cj.contracts.PulseRegistryV2.address}\` | ${newRegistry ? version : "unchanged"} |
| PulseScoreV2    | \`${cj.contracts.PulseScoreV2.address}\`    | ${newScore    ? version : "unchanged"} |
| PulseTaskV2     | \`${cj.contracts.PulseTaskV2.address}\`     | ${newTask     ? version : "unchanged"} |
| PulseStreamV2   | \`${cj.contracts.PulseStreamV2.address}\`   | ${newStream   ? version : "unchanged"} |
| USDC (Arc Mainnet) | \`${cj.usdc}\` | — |
${scoreTx  ? `\nPulseScoreV2 deploy tx:  \`${scoreTx}\``  : ""}${taskTx   ? `\nPulseTaskV2 deploy tx:   \`${taskTx}\``   : ""}${streamTx ? `\nPulseStreamV2 deploy tx: \`${streamTx}\`` : ""}
`;

let agents = readFileSync(agentsPath, "utf8");

// Insert the new record just before the next h2 if "CURRENT" appears,
// otherwise just append at the end.
const currentMarker = "(CURRENT)";
if (agents.includes(currentMarker)) {
  agents = agents.replace(currentMarker, "(SUPERSEDED)");
}
agents = agents.trimEnd() + "\n" + deployRecord;
writeFileSync(agentsPath, agents);
console.log("✅  AGENTS.md updated");

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`
────────────────────────────────
✨  Patch complete (${version})

Files updated:
  src/contracts.json
  src/Docs.tsx
  README.md
  AGENTS.md

Next steps:
  1. bun run check           — verify no type errors
  2. git add -A && git commit -m "deploy: ${version} — ${notes}"
  3. git push origin main
  4. Re-trigger Vercel deploy (auto if push-to-deploy is on)
`);
