import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRepo, score } from '../lib/checks.js';
import { assessContent, demoLinks } from '../lib/quality.js';
import { assessRepo } from '../lib/assess.js';
import { nearRulebook } from '../lib/rulebook.js';
import { numberedExcerpts, parseJudge, createJudge } from '../lib/judge.js';

const days = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 10, 12 - i)).toISOString());

// Eight files, every one of them present and every one of them template or empty.
const boilerplate = () => new Map([
  ['README.md', '# Getting Started with Create React App\n\nThis project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).\n\nBuilt with React. Uses NEAR testnet and NEAR Intents and near ai.\n\n```bash\nnpm start\nnpm test\n```\n'],
  ['LICENSE', 'MIT License'],
  ['package.json', '{"name":"app","scripts":{"start":"react-scripts start","test":"react-scripts test"},"dependencies":{"react":"18","near-api-js":"4"}}'],
  ['package-lock.json', '{}'],
  ['.env.example', 'KEY='],
  ['src/App.js', "import './App.css';\nfunction App() {\n  return (<div className=\"App\"><p>Edit <code>src/App.js</code> and save to reload.</p><a href=\"https://reactjs.org\">Learn React</a></div>);\n}\nexport default App;\n"],
  ['src/index.js', "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);\n"],
  ['src/App.test.js', "test('works', () => { expect(true).toBe(true); });\n"],
]);

function realRepo() {
  const files = new Map();
  files.set('README.md', `# Escrow Desk\n\n## The problem\n${'Freelancers on NEAR wait weeks for payment because clients hold funds and disputes have no neutral party. '.repeat(12)}\n\n## How it works\n${'The contract holds funds in escrow, releases on milestone approval, and refunds after a deadline. '.repeat(8)}\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm test\n\`\`\`\n\n## Demo\nhttps://escrow-desk.vercel.app\n\nBuilt with near-api-js. AI-assisted code is listed in CREDITS.md.\n`);
  files.set('LICENSE', 'MIT');
  files.set('package.json', '{"scripts":{"test":"node --test"},"dependencies":{"near-api-js":"4"}}');
  files.set('package-lock.json', '{}');
  for (let f = 0; f < 6; f++) {
    const body = [`import { connect, keyStores } from 'near-api-js';`, `const RPC = 'https://rpc.testnet.near.org';`];
    for (let i = 0; i < 300; i++) body.push(`export function step${f}_${i}(state, amount) { if (amount <= 0) throw new Error('bad amount'); return { ...state, held: state.held + amount * ${i + 1} }; }`);
    body.push(`export async function release(account, id) { return account.functionCall({ contractId: 'escrow.testnet', methodName: 'release', args: { id } }); }`);
    files.set(`src/escrow${f}.js`, body.join('\n'));
  }
  const tests = ["import test from 'node:test';", "import assert from 'node:assert/strict';", "import { step0_1 } from '../src/escrow0.js';"];
  for (let i = 0; i < 45; i++) tests.push(`test('step ${i}', () => { assert.equal(step0_1({ held: ${i} }, 1).held, ${i + 2}); });`);
  files.set('test/escrow.test.js', tests.join('\n'));
  return files;
}

test('eight boilerplate files score well below 100 on content', () => {
  const snap = { files: boilerplate(), commits: days(1) };
  const rules = score(checkRepo(snap));
  const q = assessContent(snap, { rulesScore: rules.score });
  assert.ok(rules.score >= 60, `rules check alone gives ${rules.score}`);
  assert.ok(q.score < 35, `content score ${q.score}`);
  const byId = Object.fromEntries(q.signals.map((s) => [s.id, s]));
  assert.ok(byId.readme.value < 0.3, 'template README is penalised');
  assert.ok(byId.code.value < 0.1, 'template code is skipped');
  assert.equal(byId.near.value, 0.2, 'near-api-js declared but never imported');
  assert.equal(byId.tests.value, 0, 'expect(true) is not a test');
});

test('a repo with real content outscores the boilerplate by a wide margin', () => {
  const snap = { files: realRepo(), commits: days(9) };
  const q = assessContent(snap, { rulesScore: score(checkRepo(snap)).score, demoOk: true });
  const bp = assessContent({ files: boilerplate(), commits: days(1) }, { rulesScore: 90 });
  assert.ok(q.score >= 80, `real repo ${q.score}`);
  assert.ok(q.score - bp.score >= 45);
  const near = q.signals.find((s) => s.id === 'near');
  assert.ok(near.evidence.some((e) => /^src\/escrow\d\.js:\d+$/.test(e)), 'NEAR evidence cites a file and line');
});

test('file presence is a minority of the score', () => {
  const q = assessContent({ files: new Map(), commits: [] }, { rulesScore: 100 });
  assert.ok(q.score <= 10);
});

test('demo links skip badges and repo links and prefer deployments', () => {
  const links = demoLinks('![b](https://img.shields.io/x) https://github.com/a/b https://docs.near.org/x see https://foo.vercel.app/ and https://youtu.be/abc');
  assert.equal(links[0], 'https://foo.vercel.app/');
  assert.ok(!links.some((l) => l.includes('github.com')));
});

test('assessRepo puts content fixes in the fix list and keeps the rules score', async () => {
  const a = await assessRepo({ files: boilerplate(), commits: days(1) }, { rulebook: nearRulebook, checkDemo: false });
  assert.ok(a.score < 35);
  assert.ok(a.rulesScore > a.score);
  assert.ok(a.fixes.some((f) => f.id === 'content-code'));
  assert.equal(a.v, 3);
});

test('judge prompt numbers lines and the parser drops invented paths and uncited high scores', () => {
  const snap = { files: realRepo(), commits: days(3), sha: 'abc' };
  const prompt = numberedExcerpts(snap, 6000);
  assert.match(prompt, /--- README\.md ---\n1\| # Escrow Desk/);
  const rubric = nearRulebook.judging;
  const reply = { criteria: rubric.criteria.map((c, i) => ({ id: c.id, score: 5, reason: 'r', evidence: i === 0 ? [{ path: 'src/escrow0.js', lines: '3-10', note: 'logic' }] : [{ path: 'src/made-up.js', lines: '1' }] })), summary: 's' };
  const out = parseJudge(JSON.stringify(reply), rubric, snap);
  assert.equal(out.criteria[0].score, 5);
  assert.equal(out.criteria[0].evidence[0].path, 'src/escrow0.js');
  assert.equal(out.criteria[1].score, 2, 'uncited score is capped');
  assert.equal(parseJudge('{"criteria":[]}', rubric, snap), null);
});

test('judge is skipped without a key and cached per repo and commit', async () => {
  const rubric = nearRulebook.judging;
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const content = JSON.stringify({ criteria: rubric.criteria.map((c) => ({ id: c.id, score: 3, reason: 'ok', evidence: [{ path: 'README.md', lines: '1-3' }] })), summary: 'fine' });
    return { ok: true, json: async () => ({ id: 'x', model: 'm', choices: [{ message: { content }, finish_reason: 'stop' }] }) };
  };
  const mem = {};
  const store = { read: async (n, f) => mem[n] || f, write: async (n, d) => { mem[n] = d; } };
  const j = createJudge({ store, rubric, fetchImpl, cap: 5 });
  assert.equal(await j.judge('https://github.com/a/b', { files: realRepo(), sha: '1' }, { key: '' }), null);
  const a = await j.judge('https://github.com/a/b', { files: realRepo(), sha: '1' }, { key: 'k' });
  const b = await j.judge('https://github.com/A/b', { files: realRepo(), sha: '1' }, { key: 'k' });
  assert.equal(a.score, 60);
  assert.equal(b.cached, true);
  assert.equal(calls, 1);
  await j.judge('https://github.com/a/b', { files: realRepo(), sha: '2' }, { key: 'k' });
  assert.equal(calls, 2, 'a new commit is judged again');
});
