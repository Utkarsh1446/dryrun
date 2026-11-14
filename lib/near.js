// Testnet signer and view calls. No npm dependencies. The private key is read from NEAR_PRIVATE_KEY and is never logged.
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
export const TESTNET_RPC = 'https://rpc.testnet.near.org';

export function base58Encode(buffer) {
  const bytes = Buffer.from(buffer);
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]];
  return out;
}

export function base58Decode(text) {
  if (typeof text !== 'string' || !text.length) throw new Error('Invalid base58');
  const bytes = [0];
  for (const ch of text) {
    const val = ALPHABET.indexOf(ch);
    if (val < 0) throw new Error('Invalid base58');
    let carry = val;
    for (let j = 0; j < bytes.length; j += 1) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros += 1;
  return Buffer.from([...Array(zeros).fill(0), ...bytes.reverse()]);
}

export function keyFromSeed(seed) {
  const raw = Buffer.from(seed);
  if (raw.length !== 32) throw new Error('Ed25519 seed must be 32 bytes');
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: 'der', type: 'pkcs8' });
  const spki = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const publicKey = Buffer.from(spki.subarray(spki.length - 32));
  return { privateKey, publicKey, seed: raw };
}

export function parseNearPrivateKey(value) {
  const raw = String(value || '').trim().replace(/^ed25519:/, '');
  const bytes = base58Decode(raw);
  if (bytes.length !== 64) throw new Error('NEAR private key must decode to 64 bytes');
  const parsed = keyFromSeed(bytes.subarray(0, 32));
  if (!parsed.publicKey.equals(bytes.subarray(32))) throw new Error('NEAR private key does not match its public half');
  return parsed;
}

export function formatNearPrivateKey(seed, publicKey) {
  return `ed25519:${base58Encode(Buffer.concat([Buffer.from(seed), Buffer.from(publicKey)]))}`;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(Number(n));
  return b;
}

function u64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

function u128(n) {
  const b = Buffer.alloc(16);
  let x = BigInt(n);
  for (let i = 0; i < 16; i += 1) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

function str(value) {
  const b = Buffer.from(String(value), 'utf8');
  return Buffer.concat([u32(b.length), b]);
}

export function serializeTransaction({ signerId, publicKey, nonce, receiverId, blockHash, actions }) {
  const parts = [
    str(signerId),
    Buffer.concat([Buffer.from([0]), Buffer.from(publicKey)]),
    u64(nonce),
    str(receiverId),
    Buffer.from(blockHash),
    u32(actions.length),
  ];
  for (const action of actions) {
    if (action.type === 'deployContract') {
      const code = Buffer.from(action.code);
      parts.push(Buffer.from([1]), u32(code.length), code);
    } else if (action.type === 'functionCall') {
      const args = Buffer.from(typeof action.args === 'string' ? action.args : JSON.stringify(action.args ?? {}));
      parts.push(Buffer.from([2]), str(action.methodName), u32(args.length), args, u64(action.gas), u128(action.deposit || 0));
    } else {
      throw new Error('Unsupported action');
    }
  }
  return Buffer.concat(parts);
}

export function signTransaction(transaction, key) {
  const serialized = serializeTransaction(transaction);
  const hash = createHash('sha256').update(serialized).digest();
  const signature = sign(null, hash, key.privateKey);
  if (signature.length !== 64) throw new Error('Unexpected signature length');
  return { serialized, hash, signature, signed: Buffer.concat([serialized, Buffer.from([0]), signature]) };
}

export function rpcUrl(env = process.env) {
  return env.NEAR_RPC_URL || TESTNET_RPC;
}

export async function rpc(method, params, { url = rpcUrl(), fetchImpl = fetch, timeoutMs = 40_000 } = {}) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'dryrun', method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const message = body.error?.data || body.error?.message || `RPC ${response.status}`;
    throw Object.assign(new Error(typeof message === 'string' ? message : JSON.stringify(message).slice(0, 400)), { status: 502 });
  }
  return body.result;
}

export async function viewFunction({ accountId, methodName, args = {}, url, fetchImpl } = {}) {
  const result = await rpc('query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: accountId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  }, { url, fetchImpl });
  if (result.error) throw Object.assign(new Error(String(result.error)), { status: 502 });
  const text = Buffer.from(result.result || []).toString('utf8');
  return text ? JSON.parse(text) : null;
}

function outcomeFailed(status) {
  if (!status || typeof status !== 'object') return false;
  return Boolean(status.Failure || status.failure);
}

export function readOutcome(result) {
  if (outcomeFailed(result?.status)) throw Object.assign(new Error('Transaction failed'), { status: 502 });
  for (const receipt of result?.receipts_outcome || []) {
    if (outcomeFailed(receipt?.outcome?.status)) {
      const failure = receipt.outcome.status.Failure || receipt.outcome.status.failure;
      throw Object.assign(new Error(JSON.stringify(failure).slice(0, 500)), { status: 502 });
    }
  }
  const encoded = result?.status?.SuccessValue;
  const text = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
  return {
    txHash: result?.transaction?.hash || result?.transaction_outcome?.id || null,
    returnValue: text ? JSON.parse(text) : null,
  };
}

let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

export async function submitSigned(signed, { url, fetchImpl } = {}) {
  const params = { signed_tx_base64: signed.toString('base64'), wait_until: 'EXECUTED' };
  try {
    return readOutcome(await rpc('send_tx', params, { url, fetchImpl, timeoutMs: 60_000 }));
  } catch (error) {
    if (!/method not found/i.test(error.message || '')) throw error;
    return readOutcome(await rpc('broadcast_tx_commit', [params.signed_tx_base64], { url, fetchImpl, timeoutMs: 60_000 }));
  }
}

export async function signAndSend({ signerId, key, receiverId, actions, url, fetchImpl }) {
  return enqueue(async () => {
    const accessKey = await rpc('query', {
      request_type: 'view_access_key',
      finality: 'final',
      account_id: signerId,
      public_key: `ed25519:${base58Encode(key.publicKey)}`,
    }, { url, fetchImpl });
    const blockHash = base58Decode(accessKey.block_hash);
    if (blockHash.length !== 32) throw new Error('RPC returned a bad block hash');
    const { signed } = signTransaction({
      signerId,
      publicKey: key.publicKey,
      nonce: BigInt(accessKey.nonce) + 1n,
      receiverId,
      blockHash,
      actions,
    }, key);
    return submitSigned(signed, { url, fetchImpl });
  });
}

export function signerFromEnv(env = process.env) {
  const accountId = env.NEAR_SIGNER_ID || env.NEAR_CONTRACT_ID || '';
  const secret = env.NEAR_PRIVATE_KEY || '';
  if (!accountId || !secret) return null;
  return { accountId, key: parseNearPrivateKey(secret), rpc: rpcUrl(env) };
}
