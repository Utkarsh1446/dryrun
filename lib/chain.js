// Records and reads DryRun receipts on NEAR testnet. Writes need NEAR_PRIVATE_KEY. Reads need only the contract id.
import { readFileSync } from 'node:fs';
import { CHECKER_VERSION } from './hash.js';
import { signerFromEnv, viewFunction } from './near.js';

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;

export function deployedInfo() {
  try {
    const parsed = JSON.parse(readFileSync(new URL('../contract/deployed.json', import.meta.url), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || parsed.private_key || parsed.privateKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function chainStatus(env = process.env) {
  const deployed = deployedInfo();
  const contractId = env.NEAR_CONTRACT_ID || deployed?.contractId || '';
  const signer = signerFromEnv({ ...env, NEAR_CONTRACT_ID: contractId });
  return {
    network: 'testnet',
    contractId: contractId || null,
    configured: Boolean(signer && contractId),
    canRead: Boolean(contractId),
    checker: CHECKER_VERSION,
    rpcUrl: signer?.rpc || env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',
    explorerAccount: contractId ? `https://explorer.testnet.near.org/accounts/${contractId}` : null,
    deployTx: deployed?.deployTx || null,
  };
}

export function assertReceiptArgs(args) {
  if (typeof args?.repo_url !== 'string' || !args.repo_url.startsWith('https://github.com/') || args.repo_url.length > 300 || /\s/.test(args.repo_url)) {
    throw Object.assign(new Error('repo_url must be an https://github.com URL'), { status: 400 });
  }
  if (!HEX40.test(args.commit_sha || '')) throw Object.assign(new Error('commit_sha must be 40 hex characters'), { status: 400 });
  if (!HEX64.test(args.result_hash || '')) throw Object.assign(new Error('result_hash must be 64 hex characters'), { status: 400 });
  if (!/^[0-9A-Za-z._-]{1,32}$/.test(args.checker_version || '')) throw Object.assign(new Error('checker_version is invalid'), { status: 400 });
  if (args.kind !== 'check' && args.kind !== 'deep') throw Object.assign(new Error('kind must be check or deep'), { status: 400 });
  if (args.kind === 'check' && args.quote_hash) throw Object.assign(new Error('check receipts have no quote hash'), { status: 400 });
  if (args.kind === 'deep' && !HEX64.test(args.quote_hash || '')) throw Object.assign(new Error('deep receipts need a quote hash'), { status: 400 });
  return args;
}

function withLinks(receipt, txHash, contractId) {
  if (!receipt) return null;
  return {
    ...receipt,
    txHash: txHash || null,
    explorerTx: txHash ? `https://explorer.testnet.near.org/transactions/${txHash}` : null,
    explorerAccount: contractId ? `https://explorer.testnet.near.org/accounts/${contractId}` : null,
    network: 'testnet',
  };
}

export async function recordReceipt(args, env = process.env) {
  const status = chainStatus(env);
  if (!status.configured) return null;
  assertReceiptArgs(args);
  const signer = signerFromEnv({ ...env, NEAR_CONTRACT_ID: status.contractId });
  const { signAndSend } = await import('./near.js');
  const outcome = await signAndSend({
    signerId: signer.accountId,
    key: signer.key,
    receiverId: status.contractId,
    actions: [{ type: 'functionCall', methodName: 'record', args, gas: 80_000_000_000_000n, deposit: 0 }],
    url: status.rpcUrl,
  });
  return withLinks(outcome.returnValue, outcome.txHash, status.contractId);
}

export async function readReceipt({ id, hash } = {}, env = process.env) {
  const status = chainStatus(env);
  if (!status.canRead) throw Object.assign(new Error('No testnet contract id is configured'), { status: 404 });
  let receipt = null;
  if (id != null && id !== '') {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) throw Object.assign(new Error('Receipt id must be a positive integer'), { status: 400 });
    receipt = await viewFunction({ accountId: status.contractId, methodName: 'get_receipt', args: { id: n }, url: status.rpcUrl });
  } else if (hash) {
    if (!HEX64.test(hash)) throw Object.assign(new Error('Result hash must be 64 hex characters'), { status: 400 });
    receipt = await viewFunction({ accountId: status.contractId, methodName: 'get_by_hash', args: { result_hash: hash }, url: status.rpcUrl });
  } else {
    throw Object.assign(new Error('Pass a receipt id or a result hash'), { status: 400 });
  }
  if (!receipt) throw Object.assign(new Error('No receipt on this contract'), { status: 404 });
  return withLinks(receipt, null, status.contractId);
}
