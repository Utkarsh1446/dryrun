// Creates a throwaway testnet account, deploys contract/target wasm, and inits it.
// The private key is written outside the repo. deployed.json gets only public ids and tx hashes.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { base58Encode, keyFromSeed, rpc, signAndSend } from '../lib/near.js';

const wasmPath = new URL('../contract/target/wasm32-unknown-unknown/release/dryrun_receipts.wasm', import.meta.url);
const outPath = new URL('../contract/deployed.json', import.meta.url);
const FAUCETS = ['https://helper.nearprotocol.com/account', 'https://helper.testnet.near.org/account'];

function accountId() {
  return `dryrun-b30f-${randomBytes(3).toString('hex')}.testnet`;
}

async function createAccount(id, publicKey) {
  const body = JSON.stringify({ newAccountId: id, newAccountPublicKey: `ed25519:${base58Encode(publicKey)}` });
  let last = 'no faucet response';
  for (const url of FAUCETS) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(30_000) });
      const text = await response.text();
      if (response.ok) return url;
      last = `${url} ${response.status} ${text.slice(0, 240)}`;
    } catch (error) {
      last = `${url} ${error.message}`;
    }
  }
  throw new Error(last);
}

const seed = randomBytes(32);
const key = keyFromSeed(seed);
const id = process.env.NEAR_CONTRACT_ID || accountId();
if (!process.env.NEAR_PRIVATE_KEY) {
  console.log(`creating ${id}`);
  const faucet = await createAccount(id, key.publicKey);
  console.log(`faucet ${faucet}`);
  const dir = join(homedir(), '.near-credentials', 'testnet');
  await mkdir(dir, { recursive: true });
  const secretPath = join(dir, `${id}.json`);
  await writeFile(secretPath, JSON.stringify({
    account_id: id,
    public_key: `ed25519:${base58Encode(key.publicKey)}`,
    private_key: `ed25519:${base58Encode(Buffer.concat([seed, key.publicKey]))}`,
  }), { mode: 0o600 });
  console.log(`key file ${secretPath}`);
  process.env.NEAR_CONTRACT_ID = id;
  process.env.NEAR_SIGNER_ID = id;
  process.env.NEAR_PRIVATE_KEY = `ed25519:${base58Encode(Buffer.concat([seed, key.publicKey]))}`;
}

const code = await readFile(wasmPath);
console.log(`wasm ${code.length} bytes`);
const signer = { accountId: process.env.NEAR_SIGNER_ID || process.env.NEAR_CONTRACT_ID, key };
if (process.env.NEAR_PRIVATE_KEY && !process.env.NEAR_SIGNER_ID) signer.accountId = process.env.NEAR_CONTRACT_ID;

const outcome = await signAndSend({
  signerId: signer.accountId,
  key: process.env.NEAR_PRIVATE_KEY ? (await import('../lib/near.js')).parseNearPrivateKey(process.env.NEAR_PRIVATE_KEY) : key,
  receiverId: signer.accountId,
  actions: [
    { type: 'deployContract', code },
    { type: 'functionCall', methodName: 'new', args: {}, gas: 300_000_000_000_000n, deposit: 0 },
  ],
});

const account = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: signer.accountId });
const deployed = {
  network: 'testnet',
  contractId: signer.accountId,
  deployTx: outcome.txHash,
  codeHash: account.code_hash,
  rpc: 'https://rpc.testnet.near.org',
  explorerAccount: `https://explorer.testnet.near.org/accounts/${signer.accountId}`,
  explorerTx: `https://explorer.testnet.near.org/transactions/${outcome.txHash}`,
};
if (JSON.stringify(deployed).includes('ed25519:')) throw new Error('Refusing to write a key into deployed.json');
await writeFile(outPath, JSON.stringify(deployed, null, 2) + '\n');
console.log(JSON.stringify({ contractId: deployed.contractId, deployTx: deployed.deployTx, codeHash: deployed.codeHash }));
