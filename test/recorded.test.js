import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPayload, hashPayload } from '../lib/hash.js';

const recorded = JSON.parse(readFileSync(new URL('../public/recorded-check.json', import.meta.url), 'utf8'));
const RECEIPT_HASH = '611e27bd71b1e24977bb77bea1ff3ec00fdad8a14b2c1b37b0032c926e2fcf54';

test('the recorded check is the rust-status-message run stored in receipt 1', () => {
  assert.equal(recorded.recorded, true);
  assert.equal(recorded.score, 55);
  assert.equal(recorded.repo, 'https://github.com/near-examples/rust-status-message');
  assert.equal(recorded.sha, 'dca9bf2c080345c7efe8dc2ff13f9b4efd45065e');
  assert.equal(recorded.checker, '0.3.0');
  assert.equal(recorded.fails, 1);
  assert.equal(recorded.warns, 2);
  assert.equal(recorded.results.filter((row) => row.level === 'pass').length, 7);
  assert.equal(recorded.results.filter((row) => row.level === 'warn').length, 2);
  assert.equal(recorded.results.filter((row) => row.level === 'fail').length, 1);
  const payload = checkPayload({
    repo: recorded.repo,
    sha: recorded.sha,
    checker: recorded.checker,
    assessment: recorded,
  });
  assert.equal(hashPayload(payload), RECEIPT_HASH);
  assert.equal(recorded.resultHash, RECEIPT_HASH);
  assert.equal(recorded.receipt.id, 1);
  assert.equal(recorded.receipt.kind, 'check');
  assert.equal(recorded.receipt.txHash, '4dBZ5SxvdfrLLP3W8ZQodWxFcpbLRaGKdS5gCJ85XEw4');
  assert.equal(recorded.receipt.explorerTx, 'https://explorer.testnet.near.org/transactions/4dBZ5SxvdfrLLP3W8ZQodWxFcpbLRaGKdS5gCJ85XEw4');
  assert.equal(recorded.receipt.result_hash, RECEIPT_HASH);
  assert.match(recorded.label, /not a live run/i);
});
