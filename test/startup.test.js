import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITERIA, IDS, LABEL, parseStartup, SOURCES, systemPrompt } from '../lib/rubrics/startup.js';
import { startupLens } from '../lib/ai.js';

test('every criterion cites a real source and the label says "inspired by"', () => {
  for (const c of CRITERIA) for (const s of c.sources) assert.match(SOURCES[s].url, /^https:\/\//);
  assert.match(LABEL, /inspired by/i);
  assert.match(LABEL, /not an endorsement/i);
  assert.match(systemPrompt('idea'), /<subject>/);
});

test('startup reply is validated and scored', async () => {
  const reply = { criteria: IDS.map((id, i) => ({ id, score: i % 2 ? 4 : 2, reason: 'because' })), biggestRisk: 'small audience', fix: 'name the user' };
  const out = parseStartup(JSON.stringify(reply));
  assert.equal(out.criteria.length, IDS.length);
  assert.ok(out.score > 0 && out.score <= 100);
  assert.equal(out.biggestRisk, 'small audience');
  assert.ok(out.criteria[0].sources.length);
  assert.equal(parseStartup('{"criteria":[{"id":"why_now","score":9}]}'), null, 'too few criteria');
  assert.equal(await startupLens('idea', { key: '' }), null);
});
