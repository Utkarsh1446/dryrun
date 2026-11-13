import test from 'node:test';
import assert from 'node:assert/strict';
import { crawlDirectory, nextSnapshots } from '../lib/directory.js';
import { defineAdapter, liveAdapters } from '../lib/hackathons/adapter.js';
import { near } from '../lib/hackathons/near.js';

test('near adapter normalises a directory page', async () => {
  let seen = '';
  const fetchImpl = async (url, init) => {
    seen = url;
    assert.equal(init.redirect, 'manual');
    assert.match(init.headers['user-agent'], /DryRun/);
    return new Response(JSON.stringify({
      projects: [
        { id: '1', project_name: 'Leash', tracks: ['security'], demo_url: 'https://x.com/a/status/9' },
        { id: '', project_name: 'skip me' },
      ],
      total: 10, page: 1, pageSize: 8,
    }), { status: 200 });
  };
  const page = await near.fetchPage(1, fetchImpl);
  assert.match(seen, /api\/projects\?page=1$/);
  assert.equal(page.total, 10);
  assert.equal(page.projects.length, 1);
  assert.equal(page.projects[0].name, 'Leash');
  assert.equal(page.projects[0].demoUrl, 'https://x.com/a/status/9');
  assert.ok(near.tracks.some((t) => t.id === 'security' && t.label === 'AI Security & Defense'));
  assert.equal(near.live, true);
});

test('a second adapter can be registered, and a broken spec is refused', () => {
  const fixture = defineAdapter({
    id: 'fixture',
    name: 'Fixture Cup',
    live: true,
    tracks: [{ id: 'open', label: 'Open' }],
    fetchPage: async () => ({ projects: [], total: 0, page: 1, pageSize: 1 }),
  });
  assert.deepEqual(liveAdapters([near, fixture, defineAdapter({
    id: 'later', name: 'Later', live: false, tracks: [], fetchPage: async () => ({ projects: [], total: 0, page: 1, pageSize: 1 }),
  })]).map((a) => a.id), ['near-2026', 'fixture']);
  assert.throws(() => defineAdapter({ id: 'x', name: 'x', tracks: [] }), /fetchPage/);
});

test('directory crawl is one page at a time and retries a failed page', async () => {
  let active = 0;
  let max = 0;
  let calls = 0;
  const sleeps = [];
  const adapter = defineAdapter({
    id: 't', name: 'T', live: true, tracks: [],
    fetchPage: async (page) => {
      calls += 1;
      active += 1;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      if (page === 2 && calls < 3) throw Object.assign(new Error('flap'), { status: 503 });
      return {
        projects: [{ id: String(page), name: `N${page}`, tracks: ['open'], demoUrl: null }],
        total: 2, page, pageSize: 1,
      };
    },
  });
  const result = await crawlDirectory(adapter, { gapMs: 0, sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } });
  assert.equal(max, 1);
  assert.equal(result.projects.length, 2);
  assert.equal(result.projects[0].id, '1');
  assert.equal(result.projects[1].id, '2');
  assert.ok(sleeps.some((ms) => ms >= 50));
});

test('snapshots record a change and ignore an identical reading', () => {
  const first = nextSnapshots([], { at: 't1', total: 10, byTrack: { open: 10 } });
  const same = nextSnapshots(first, { at: 't2', total: 10, byTrack: { open: 10 } });
  assert.equal(same.length, 1);
  const next = nextSnapshots(same, { at: 't3', total: 12, byTrack: { open: 12 } });
  assert.equal(next.length, 2);
  assert.equal(next[1].total, 12);
});
