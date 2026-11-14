import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { anonymiseBoardRow, publicBoard } from '../lib/anonymise.js';
import { assertReceiptArgs } from '../lib/chain.js';
import { AI_NOT_CALLED, settleDryReview } from '../lib/settle.js';
import { canonical, checkPayload, deepPayload, hashPayload, quoteDigest, sha256Hex } from '../lib/hash.js';
import { base58Decode, base58Encode, formatNearPrivateKey, keyFromSeed, parseNearPrivateKey, serializeTransaction, signTransaction } from '../lib/near.js';
import { nearAiStatus } from '../lib/nearai.js';
import { holdDryQuote, quote, quoteRequestBody, releaseDryQuote } from '../lib/pay.js';

test('canonical json is stable and the check hash ignores key order', () => {
  const payload = checkPayload({
    repo: 'https://github.com/acme/widget',
    sha: 'a'.repeat(40),
    checker: '0.3.0',
    assessment: { score: 70, rulesScore: 80, fails: 1, warns: 0, results: [{ id: 'license', level: 'fail' }, { id: 'readme', level: 'pass' }] },
  });
  assert.equal(canonical({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
  assert.equal(hashPayload(payload), sha256Hex(canonical(payload)));
  assert.equal(hashPayload(payload), hashPayload(JSON.parse(canonical(payload))));
  assert.equal(payload.kind, 'check');
});

test('a deep payload carries the quote hash and says when the model was not called', () => {
  const payload = deepPayload({
    repo: 'https://github.com/acme/widget',
    sha: 'b'.repeat(40),
    quoteHash: 'c'.repeat(64),
    review: null,
    aiCalled: false,
  });
  assert.equal(payload.aiCalled, false);
  assert.equal(payload.review, null);
  assert.equal(payload.quoteHash, 'c'.repeat(64));
  assert.equal(hashPayload(payload).length, 64);
});

test('receipt arguments match the contract rules', () => {
  const ok = {
    repo_url: 'https://github.com/acme/widget',
    commit_sha: 'a'.repeat(40),
    result_hash: 'b'.repeat(64),
    checker_version: '0.3.0',
    kind: 'check',
    quote_hash: null,
  };
  assert.equal(assertReceiptArgs(ok).kind, 'check');
  assert.throws(() => assertReceiptArgs({ ...ok, kind: 'deep', quote_hash: null }), /quote hash/);
  assert.throws(() => assertReceiptArgs({ ...ok, quote_hash: 'c'.repeat(64) }), /no quote hash/);
  assert.throws(() => assertReceiptArgs({ ...ok, commit_sha: 'ABC' }), /commit_sha/);
  assert.throws(() => assertReceiptArgs({ ...ok, repo_url: 'https://evil.example/a' }), /github/);
});

test('the guessed board hides team and repo names unless asked', () => {
  const row = anonymiseBoardRow({
    id: '99',
    name: 'Visible Team',
    repo: 'https://github.com/acme/secret-repo',
    demoUrl: 'https://x.com/someone/status/1',
    matchNote: 'from the post https://github.com/acme/secret-repo',
    score: 80,
    rank: 2,
    tracks: ['open'],
  });
  const text = JSON.stringify(row);
  assert.equal(text.includes('Visible Team'), false);
  assert.equal(text.includes('secret-repo'), false);
  assert.equal(text.includes('github.com'), false);
  assert.equal(text.includes('x.com'), false);
  assert.match(row.name, /^team-[0-9a-f]{6}$/);
  assert.match(row.repoAlias, /^repo-[0-9a-f]{6}$/);
  const shown = publicBoard([{ id: '99', name: 'Visible Team', repo: 'https://github.com/acme/secret-repo', score: 1 }], { names: true });
  assert.equal(shown[0].name, 'Visible Team');
  assert.equal(shown[0].anonymised, false);
});

test('1Click quotes are dry and a held quote can be released', async () => {
  const body = quoteRequestBody({ originAsset: 'asset', refundTo: '0xabc', recipient: '', priceUsdc: 5_000_000n, now: 1_700_000_000_000 });
  assert.equal(body.dry, true);
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ quote: { amountInFormatted: '5.1', amountInUsd: '5.00', timeEstimate: 30, deadline: '2099-01-01T00:00:00.000Z' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const q = await quote({ originAsset: 'nep141:usdc.base', refundTo: '0xabc', fetchImpl });
  assert.equal(seen[0].dry, true);
  assert.equal(q.dry, true);
  assert.equal(q.depositAddress, null);
  assert.equal(q.fundsMoved, false);
  assert.equal(q.quoteHash, quoteDigest(q));
  assert.equal(JSON.stringify(q).includes('depositAddress":"'), false);
  const held = holdDryQuote(q.quoteId, 'https://github.com/acme/widget');
  assert.equal(held.quoteHash, q.quoteHash);
  assert.throws(() => holdDryQuote(q.quoteId, 'https://github.com/acme/widget'), /already being settled/);
  releaseDryQuote(q.quoteId);
  assert.equal(holdDryQuote(q.quoteId, 'https://github.com/acme/widget').quoteId, q.quoteId);
  releaseDryQuote(q.quoteId);
});

test('a dry review records the quote and does not call the model when no key is set', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ quote: { amountInFormatted: '5', deadline: '2099-01-01T00:00:00.000Z' } }), { status: 200 });
  const q = await quote({ originAsset: 'asset', refundTo: '0xabc', fetchImpl });
  let ran = false;
  const recorded = [];
  const out = await settleDryReview({
    quoteId: q.quoteId,
    repo: 'https://github.com/acme/widget',
    sha: 'd'.repeat(40),
    run: async () => { ran = true; return { review: { summary: 'should not run' } }; },
    record: async (args) => { recorded.push(args); return { id: 7, txHash: 'tx', ...args }; },
    aiConfigured: false,
    chainReady: true,
  });
  assert.equal(ran, false);
  assert.equal(out.aiCalled, false);
  assert.equal(out.aiError, AI_NOT_CALLED);
  assert.equal(out.fundsMoved, false);
  assert.equal(recorded[0].kind, 'deep');
  assert.equal(recorded[0].quote_hash, q.quoteHash);
  assert.equal(recorded[0].result_hash, out.resultHash);
  assert.throws(() => holdDryQuote(q.quoteId, 'https://github.com/acme/widget'), /already used/);
});

test('a failed record releases the dry quote', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ quote: { deadline: '2099-01-01T00:00:00.000Z' } }), { status: 200 });
  const q = await quote({ originAsset: 'asset', refundTo: '0xabc', fetchImpl });
  await assert.rejects(() => settleDryReview({
    quoteId: q.quoteId,
    repo: 'https://github.com/acme/widget',
    sha: 'e'.repeat(40),
    run: async () => { throw new Error('model down'); },
    record: async () => ({ id: 1 }),
    aiConfigured: true,
    chainReady: true,
  }), /model down/);
  assert.equal(holdDryQuote(q.quoteId, 'https://github.com/acme/widget').quoteId, q.quoteId);
  releaseDryQuote(q.quoteId);
});

test('ed25519 near key round-trips and the signed transaction verifies', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  const pub = Buffer.from(spki.subarray(spki.length - 32));
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' });
  const seed = pkcs8.subarray(pkcs8.length - 32);
  const formatted = formatNearPrivateKey(seed, pub);
  const parsed = parseNearPrivateKey(formatted);
  assert.ok(parsed.publicKey.equals(pub));
  const hello = base58Decode(base58Encode(Buffer.from('hello')));
  assert.equal(hello.toString(), 'hello');
  const fromSeed = keyFromSeed(seed);
  const serialized = serializeTransaction({
    signerId: 'dryrun.testnet',
    publicKey: fromSeed.publicKey,
    nonce: 1n,
    receiverId: 'dryrun.testnet',
    blockHash: Buffer.alloc(32, 7),
    actions: [{ type: 'functionCall', methodName: 'record', args: { ok: true }, gas: 30n, deposit: 0 }],
  });
  assert.equal(serialized[0], 'dryrun.testnet'.length);
  const signed = signTransaction({
    signerId: 'dryrun.testnet',
    publicKey: fromSeed.publicKey,
    nonce: 1n,
    receiverId: 'dryrun.testnet',
    blockHash: Buffer.alloc(32, 7),
    actions: [{ type: 'functionCall', methodName: 'get_receipt', args: { id: 1 }, gas: 30n, deposit: 0 }],
  }, fromSeed);
  const hash = createHash('sha256').update(signed.serialized).digest();
  assert.ok(verify(null, hash, fromSeed.privateKey, signed.signature));
  assert.equal(signed.signed.length, signed.serialized.length + 65);
  assert.equal(sign(null, hash, fromSeed.privateKey).length, 64);
});

test('NEAR AI status is honest when no key is set', () => {
  const status = nearAiStatus({});
  assert.equal(status.configured, false);
  assert.match(status.note, /not set/);
  assert.equal(status.keySource, 'NEAR_AI_API_KEY');
  assert.equal(nearAiStatus({ NEAR_AI_API_KEY: 'present' }).configured, true);
});
