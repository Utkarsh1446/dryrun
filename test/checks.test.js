import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRepo, checkSubmission, checkDirectory, unresolvedCommands, readmeCommands, score } from '../lib/checks.js';
import { isPaid, USDC_NEAR } from '../lib/pay.js';
import { validRepo } from '../lib/repo.js';
import { parseReply, buildPrompt } from '../lib/deep.js';

const level = (rs, id) => rs.find((r) => r.id === id)?.level;
const README = `# Thing\n${'A tool that settles invoices on NEAR using NEAR Intents on testnet. '.repeat(4)}\nBuilt with near-api-js.\n\n\`\`\`bash\nnpm install\nnpm run dev\nnode scripts/seed.js\n\`\`\`\n`;
const good = () => new Map([
  ['README.md', README], ['LICENSE', 'MIT'], ['package.json', '{"scripts":{"dev":"node server.js"}}'],
  ['scripts/seed.js', 'console.log(1)'], ['test/a.test.js', ''],
]);

test('a clean repo passes with no failures', () => {
  const rs = checkRepo({ files: good(), commits: ['2026-11-10T00:00:00Z'], tags: [] });
  assert.equal(score(rs).fails, 0, JSON.stringify(rs.filter((r) => r.level === 'fail')));
});

test('missing license, README and run steps fail', () => {
  assert.equal(level(checkRepo({ files: new Map([['a.js', '']]) }), 'license'), 'fail');
  assert.equal(level(checkRepo({ files: new Map([['a.js', '']]) }), 'readme'), 'fail');
  const f = good(); f.set('README.md', 'x'.repeat(300));
  assert.equal(level(checkRepo({ files: f }), 'run-steps'), 'fail');
});

test('README commands that do not resolve are caught', () => {
  const f = good();
  const bad = unresolvedCommands(readmeCommands('```\n$ npm run build && python tools/x.py\nnpm install\nnpm --prefix web run dev\nbun server.js\nmake demo\n```'), f);
  assert.equal(bad.length, 4, bad.join('|')); // build, tools/x.py, server.js, make
  assert.deepEqual(unresolvedCommands(readmeCommands(README), f), []);
});

test('secrets: tracked .env and key-shaped strings fail, without echoing the secret', () => {
  const f = good(); f.set('.env', 'A=1'); f.set('k.json', '{"private_key":"ed25519:' + '3'.repeat(88) + '"}');
  const r = checkRepo({ files: f }).find((x) => x.id === 'secrets');
  assert.equal(r.level, 'fail');
  assert.ok(!r.detail.includes('3333'));
  f.set('pub.json', '{"public_key":"ed25519:' + '3'.repeat(44) + '","signature":"ed25519:' + '3'.repeat(88) + '"}'); // public keys and tx signatures are fine
  assert.ok(!checkRepo({ files: f }).find((x) => x.id === 'secrets').detail.includes('pub.json'));
});

test('hackathon window (Q-001/Q-003)', () => {
  assert.equal(level(checkRepo({ files: good(), commits: ['2026-09-01T00:00:00Z'] }), 'window'), 'fail');
  assert.equal(level(checkRepo({ files: good(), commits: ['2026-11-02T00:00:00Z', '2026-08-01T00:00:00Z'] }), 'window'), 'warn');
  assert.equal(level(checkRepo({ files: good(), commits: ['2026-11-02T00:00:00Z', '2026-08-01T00:00:00Z'], tags: ['pre-hackathon'] }), 'window'), 'pass');
});

test('submission fields mirror the API table', () => {
  const rs = checkSubmission({ projectName: 'x', idea: 'short', nearAddress: 'Bad.NEAR', tracks: ['defi', 'nope'], demoUrl: 'https://example.com', demoText: 'look at this' });
  for (const id of ['f-name', 'f-idea', 'f-near', 'f-tracks', 'f-demo', 'f-post']) assert.equal(level(rs, id), 'fail', id);
  const ok = checkSubmission({ projectName: 'DryRun', idea: 'x'.repeat(40), nearAddress: 'dry-run.near', tracks: ['open'], demoUrl: 'https://x.com/a/status/123', demoText: 'Built at NEAR HACKATHON @NEARProtocol #NEARHackathon https://github.com/a/b' });
  assert.ok(ok.every((r) => r.level === 'pass'), JSON.stringify(ok));
  assert.equal(level(checkSubmission({ idea: 'x'.repeat(13000) }), 'f-size'), 'fail');
});

test('directory: name clash and crowding', () => {
  const d = [{ project_name: 'Leash', tracks: ['security'] }, { project_name: 'Agent Leash', tracks: ['security'] }, { project_name: 'Pot', tracks: ['social'] }];
  const rs = checkDirectory(d, { projectName: 'Leash: limits', tracks: ['security', 'social'] });
  assert.equal(level(rs, 'd-name'), 'warn');
  assert.equal(level(rs, 'd-security'), 'warn');
  assert.equal(level(checkDirectory(d, { projectName: 'Zebra' }), 'd-name'), 'pass');
});

test('payment only counts when settled to us, in USDC, for the full price', () => {
  const cfg = { recipient: 'me.near', priceUsdc: 5_000_000n };
  const st = (o = {}) => ({ status: 'SUCCESS', quoteResponse: { quoteRequest: { recipient: 'me.near', destinationAsset: USDC_NEAR, ...o.req }, quote: { amountOut: '5000000', ...o.q } }, ...o.top });
  assert.equal(isPaid(st(), cfg), true);
  assert.equal(isPaid(st({ top: { status: 'PROCESSING' } }), cfg), false);
  assert.equal(isPaid(st({ req: { recipient: 'attacker.near' } }), cfg), false);
  assert.equal(isPaid(st({ req: { destinationAsset: 'nep141:wrap.near' } }), cfg), false);
  assert.equal(isPaid(st({ q: { amountOut: '4999999' } }), cfg), false);
  assert.equal(isPaid(st(), { recipient: '', priceUsdc: 5_000_000n }), false);
  assert.equal(isPaid({}, cfg), false);
});

test('repo URL is validated before it reaches git', () => {
  assert.ok(validRepo('https://github.com/near/intents'));
  for (const u of ['--upload-pack=x', 'file:///etc', 'https://github.com/a/b; rm -rf /', 'https://evil.com/a/b', 'https://github.com/a', 42]) assert.ok(!validRepo(u), String(u));
});

test('deep review: prompt fences the repo, reply parsing tolerates prose', () => {
  assert.match(buildPrompt({ files: good() }), /^<repo>[\s\S]*README\.md[\s\S]*<\/repo>$/);
  assert.equal(parseReply('Sure!\n{"summary":"ok","claims":[],"topFixes":[]}').summary, 'ok');
  assert.equal(parseReply('no json here'), null);
});
