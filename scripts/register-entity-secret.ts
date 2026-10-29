#!/usr/bin/env bun
/**
 * One-time entity secret registration for Circle developer-controlled wallets.
 * Run: bun run scripts/register-entity-secret.ts
 * NEVER commit this output, the .env file, or the recovery file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { registerEntitySecretCiphertext, initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) {
  console.error("ERROR: CIRCLE_API_KEY is not set in .env");
  process.exit(1);
}

// 1. Generate a cryptographically secure 32-byte secret (never printed to stdout)
const entitySecret = crypto.randomBytes(32).toString("hex");

// 2. Ensure recovery dir exists under /home/user/app (only path user can download from)
const recoveryDir = "/home/user/app/.circle";
fs.mkdirSync(recoveryDir, { recursive: true });
const recoveryPath = path.join(recoveryDir, "recovery_file.dat");

// 3. Register ciphertext with Circle
console.log("Registering entity secret ciphertext with Circle...");
let response: Awaited<ReturnType<typeof registerEntitySecretCiphertext>>;
try {
  response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: recoveryDir,
  });
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Registration failed:", msg);
  process.exit(1);
}

// 4. Persist recovery file
if (response.data?.recoveryFile) {
  fs.writeFileSync(recoveryPath, response.data.recoveryFile, "utf-8");
  console.log("Recovery file written to:", recoveryPath);
} else {
  console.warn("Warning: recovery file not returned by API — check .circle/ manually.");
}

// 5. Append CIRCLE_ENTITY_SECRET to .env (never log the value)
const envPath = path.join("/home/user/app", ".env");
fs.appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, "utf-8");
console.log("CIRCLE_ENTITY_SECRET written to .env");

// 6. Verify registration with a read-only SDK call
console.log("Verifying registration...");
try {
  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
  });
  await client.listWalletSets({ pageSize: 1 });
  console.log("SUCCESS: Entity secret registered and verified.");
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Verification failed:", msg);
  process.exit(1);
}
