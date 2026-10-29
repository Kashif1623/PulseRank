#!/usr/bin/env bun
/**
 * Links PulseScoreV2 and PulseTaskV2 to PulseStreamV2 by calling setPulseStream()
 * via the Circle REST API directly (avoids SDK Bun compatibility issues).
 */
import crypto from "node:crypto";
import { webcrypto } from "node:crypto";

const WALLET_ID   = "95db8cf1-cfed-5301-92ab-f562aa2d284b";
const STREAM_ADDR = "0x75636CF6a8F890E96D1b01B2832d0BFE19Aa9347";
const SCORE_ADDR  = "0x374D9d2B6cA2557D24FA49603dcfdEd4905AB683";
const TASK_ADDR   = "0x389880420C90E7Efd4ed970C2530b4dce995601A";
const BLOCKCHAIN  = "ARC";
const CIRCLE_API  = "https://api.circle.com/v1/w3s";

async function circlePost(path: string, body: object, apiKey: string) {
  const idempotencyKey = crypto.randomUUID();
  const res = await fetch(`${CIRCLE_API}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Request-Id": idempotencyKey,
    },
    body: JSON.stringify({ ...body, idempotencyKey }),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error(`Circle API ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

/** Encrypt entitySecret with Circle's public key to produce entitySecretCiphertext. */
async function buildEntitySecretCiphertext(entitySecret: string, apiKey: string): Promise<string> {
  // Fetch Circle's public key
  const res = await fetch(`${CIRCLE_API}/config/entity/publicKey`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  const json = await res.json() as { data?: { publicKey?: string } };
  const pem = json?.data?.publicKey;
  if (!pem) throw new Error("Could not fetch Circle public key");

  // Import the RSA-OAEP public key
  const pemBody = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Buffer.from(pemBody, "base64");
  const key = await webcrypto.subtle.importKey(
    "spki", der,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false, ["encrypt"]
  );

  // Encrypt the entity secret bytes
  const secretBytes = Buffer.from(entitySecret, "hex");
  const encrypted = await webcrypto.subtle.encrypt({ name: "RSA-OAEP" }, key, secretBytes);
  return Buffer.from(encrypted).toString("base64");
}

async function main() {
  const apiKey       = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? "";
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET ?? "";
  if (!apiKey)       throw new Error("CIRCLE_API_KEY must be set in .env");
  if (!entitySecret) throw new Error("CIRCLE_ENTITY_SECRET must be set in .env");

  for (const [name, contractAddress] of [["PulseScoreV2", SCORE_ADDR], ["PulseTaskV2", TASK_ADDR]] as const) {
    console.log(`\nBuilding fresh ciphertext for ${name}...`);
    const entitySecretCiphertext = await buildEntitySecretCiphertext(entitySecret, apiKey);
    console.log(`Calling setPulseStream on ${name} (${contractAddress})...`);
    const data = await circlePost("/developer/transactions/contractExecution", {
      walletId: WALLET_ID,
      contractAddress,
      abiFunctionSignature: "setPulseStream(address)",
      abiParameters: [STREAM_ADDR],
      blockchain: BLOCKCHAIN,
      entitySecretCiphertext,
      feeLevel: "MEDIUM",
    }, apiKey);
    const tx = ((data).data as Record<string, unknown> | undefined)?.transaction as Record<string, string> | undefined;
    console.log(`  id     : ${String(tx?.id ?? "unknown")}`);
    console.log(`  txHash : ${String(tx?.txHash ?? "pending")}`);
    console.log(`  state  : ${String(tx?.state ?? "submitted")}`);
  }

  console.log("\nDone. Both setPulseStream calls submitted.");
}

main().catch((e: unknown) => { console.error("Error:", e instanceof Error ? e.message : String(e)); process.exit(1); });
