/**
 * Links the newly deployed PulseStreamV2 (v3 deploy) to PulseScoreV2 and PulseTaskV2
 * by calling setPulseStream on each via Circle developer-controlled wallets REST API.
 */
import crypto from 'crypto';

const CIRCLE_API_KEY    = process.env.CIRCLE_API_KEY!;
const ENTITY_SECRET     = process.env.CIRCLE_ENTITY_SECRET!;
const WALLET_ID         = '95db8cf1-cfed-5301-92ab-f562aa2d284b';
const BLOCKCHAIN        = 'ARC';
const NEW_STREAM_ADDR   = '0x1C8DB2fD6ED9d9Caea9e04B157DdE031C28e66F8';
const _SCORE_ADDR       = '0xCBAa6A61A5960Af31A52bcbc32c1EC99a344F1Ed'; // already linked
const TASK_ADDR         = '0x4FDF4B96D1d4e3788f33a64dC53e5e2c389Ac1d5';

// setPulseStream(address) selector = keccak256("setPulseStream(address)")[0:4]
// = 0x8b8ab34c
const _SET_STREAM_ABI = [{
  name: 'setPulseStream',
  type: 'function',
  inputs: [{ name: 's', type: 'address' }],
  outputs: [],
  stateMutability: 'nonpayable',
}];

async function getEntityCiphertext(): Promise<string> {
  const secretBytes  = Buffer.from(ENTITY_SECRET, 'hex');
  const pubKeyResp   = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
  });
  const pubKeyJson   = await pubKeyResp.json() as { data?: { publicKey?: string } };
  const pubKeyPem    = pubKeyJson?.data?.publicKey;
  if (!pubKeyPem) throw new Error(`Failed to get public key: ${JSON.stringify(pubKeyJson)}`);

  const encrypted = crypto.publicEncrypt(
    { key: pubKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    secretBytes,
  );
  return encrypted.toString('base64');
}

async function callSetPulseStream(contractAddress: string, label: string): Promise<void> {
  console.log(`\nCalling setPulseStream on ${label} (${contractAddress})...`);
  const ciphertext  = await getEntityCiphertext();
  const idempKey    = crypto.randomUUID();

  const body = {
    idempotencyKey: idempKey,
    walletId: WALLET_ID,
    blockchain: BLOCKCHAIN,
    contractAddress,
    abiFunctionSignature: 'setPulseStream(address)',
    abiParameters: [NEW_STREAM_ADDR],
    entitySecretCiphertext: ciphertext,
    feeLevel: 'MEDIUM',
  };

  const resp = await fetch('https://api.circle.com/v1/w3s/developer/transactions/contractExecution', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json() as { data?: { id?: string; state?: string }; code?: number; message?: string };
  if (!resp.ok || json.code) {
    throw new Error(`${label} setPulseStream failed: ${JSON.stringify(json)}`);
  }
  const txId = json.data?.id;
  console.log(`  Submitted tx ${txId} — polling for terminal state...`);

  // Poll up to 60s
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetch(`https://api.circle.com/v1/w3s/transactions/${txId}`, {
      headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
    });
    const pollJson = await poll.json() as { data?: { transaction?: { state?: string; txHash?: string } } };
    const state    = pollJson.data?.transaction?.state;
    const txHash   = pollJson.data?.transaction?.txHash;
    console.log(`  [${i+1}] state=${state}`);
    if (state === 'CONFIRMED' || state === 'COMPLETE') {
      console.log(`  ${label} setPulseStream ${state} — txHash: ${txHash}`);
      return;
    }
    if (state === 'FAILED' || state === 'CANCELLED') {
      throw new Error(`${label} setPulseStream transaction ${state}: ${JSON.stringify(pollJson)}`);
    }
  }
  throw new Error(`${label} setPulseStream timed out after 60s`);
}

void (async () => {
  console.log(`Linking PulseStreamV2 (${NEW_STREAM_ADDR}) to PulseScoreV2 and PulseTaskV2...`);
  // PulseScoreV2 already linked — skip to avoid AlreadySet revert
  // await callSetPulseStream(SCORE_ADDR, 'PulseScoreV2');
  await callSetPulseStream(TASK_ADDR,  'PulseTaskV2');
  console.log('\nAll setPulseStream calls confirmed.');
})();
