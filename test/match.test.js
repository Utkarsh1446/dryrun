import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignSearchHits, canonRepo, demoPostApiUrl, extractGithubRepos, nameScore, needsDemoFetch, reposFromTweet, sameRepo, searchGithub,
} from '../lib/match.js';

test('github urls are extracted and junk hosts are dropped', () => {
  const text = [
    'Built at NEAR HACKATHON. https://github.com/Bronxydrone/Veto',
    'https://github.com/topics/near',
    'https://github.com/a/b/blob/main/README.md',
    'https://github.com/a/b.git',
  ].join('\n');
  assert.deepEqual(extractGithubRepos(text), [
    'https://github.com/Bronxydrone/Veto',
    'https://github.com/a/b',
  ]);
  assert.equal(canonRepo('https://github.com/orgs/near'), null);
});

test('demo post url becomes the public syndication endpoint', () => {
  const u = demoPostApiUrl('https://x.com/tarantinbv/status/2116528585829720403?s=20');
  assert.equal(u.syndication, 'https://cdn.syndication.twimg.com/tweet-result?id=2116528585829720403&token=0');
  assert.match(u.fallback, /^https:\/\/api\.fxtwitter\.com\/tarantinbv\/status\/2116528585829720403$/);
  assert.equal(demoPostApiUrl('https://example.com/a/status/1'), null);
  assert.equal(demoPostApiUrl('https://x.com/home'), null);
});

test('tweet payloads yield repo urls from text, entities, or a card', () => {
  assert.deepEqual(reposFromTweet({
    text: 'see',
    entities: { urls: [{ expanded_url: 'https://github.com/Bronxydrone/Veto' }] },
  }), ['https://github.com/Bronxydrone/Veto']);
  assert.deepEqual(reposFromTweet({
    tweet: { text: 'https://github.com/topics/near', card: { url: 'https://github.com/acme/widget' } },
  }), ['https://github.com/acme/widget']);
});

test('name score is exact, prefix, or nothing', () => {
  assert.equal(nameScore('Tidepool', 'Tidepool'), 1);
  const veto = nameScore('Veto: on-chain spending firewall for AI agents on NEAR', 'Veto');
  assert.ok(veto >= 0.9 && veto < 0.99, veto);
  assert.ok(nameScore('Agent Spend Guard', 'agent') < 0.8);
  assert.equal(nameScore('Something Else', 'react'), 0);
  assert.equal(nameScore('Tidepool', 'Tidepool', ''), 1);
});

test('search assignment refuses a close call', () => {
  const repos = [{ url: 'https://github.com/a/Veto', name: 'Veto', description: '' }];
  const ambiguous = assignSearchHits([
    { id: '1', name: 'Veto: one firewall' },
    { id: '2', name: 'Veto: two firewall' },
  ], repos);
  assert.equal(ambiguous.length, 0);
  const hit = assignSearchHits([{ id: 't', name: 'Tidepool' }], [{ url: 'https://github.com/a/Tidepool', name: 'Tidepool', description: '' }]);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].confidence, 'high');
  assert.equal(hit[0].url, 'https://github.com/a/Tidepool');
  const medium = assignSearchHits([{ id: 'v', name: 'Veto: on-chain spending firewall' }], repos);
  assert.equal(medium[0].confidence, 'medium');
});

test('github search treats 403 as a rate limit and normalises hits', async () => {
  const limited = await searchGithub('x', { fetchImpl: async () => new Response('{}', { status: 403 }), token: '' });
  assert.equal(limited.rateLimited, true);
  assert.deepEqual(limited.items, []);
  const ok = await searchGithub('x', {
    token: '',
    fetchImpl: async (url, init) => {
      assert.match(url, /search\/repositories/);
      assert.equal(init.redirect, 'manual');
      assert.equal(init.headers.authorization, undefined);
      return new Response(JSON.stringify({ items: [
        { html_url: 'https://github.com/acme/widget', name: 'widget', description: 'a widget' },
        { html_url: 'https://github.com/topics/nope', name: 'nope', description: '' },
      ] }), { status: 200 });
    },
  });
  assert.equal(ok.items.length, 1);
  assert.equal(ok.items[0].url, 'https://github.com/acme/widget');
});

test('demo fetch is retried only after the backoff', () => {
  const now = Date.parse('2026-11-13T00:00:00Z');
  assert.equal(needsDemoFetch(undefined, now), true);
  assert.equal(needsDemoFetch({ at: '2026-11-13T00:00:00Z', error: null, text: '' }, now + 1000), false);
  assert.equal(needsDemoFetch({ at: '2026-11-13T00:00:00Z', error: 'HTTP 500' }, now + 1000), false);
  assert.equal(needsDemoFetch({ at: '2026-11-12T00:00:00Z', error: 'HTTP 500' }, now), true);
});

test('repo identity ignores case and a .git suffix', () => {
  assert.equal(sameRepo('https://github.com/Acme/Widget.git', 'https://github.com/acme/Widget'), true);
  assert.equal(sameRepo('https://github.com/acme/widget', 'https://github.com/acme/other'), false);
});
